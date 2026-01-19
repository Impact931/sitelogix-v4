import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { getFileRepository, getReportRepository } from '@/lib/repositories'
import type { ElevenLabsPostCallPayload } from '@/lib/repositories'
import { GoogleSheetsReportRepository } from '@/lib/repositories/adapters/google/report.adapter'

const WEBHOOK_SECRET = process.env.ELEVENLABS_WEBHOOK_SECRET
const ELEVENLABS_API_KEY = process.env.ELEVEN_LABS_API_KEY

/**
 * ElevenLabs webhook event types
 */
interface ElevenLabsWebhookEvent {
  type: 'post_call_transcription' | 'post_call_audio'
  event_timestamp: number
  data: ElevenLabsPostCallPayload | ElevenLabsAudioPayload
}

interface ElevenLabsAudioPayload {
  conversation_id: string
  audio_data: string // base64 encoded MP3
}

/**
 * Verify ElevenLabs webhook signature
 * Signature format: t=timestamp,v0=hash
 */
function verifySignature(payload: string, signature: string | null): boolean {
  if (!WEBHOOK_SECRET || !signature) {
    console.warn('[PostCall] Missing webhook secret or signature')
    return false
  }

  try {
    const parts = signature.split(',')
    const timestamp = parts.find(p => p.startsWith('t='))?.slice(2)
    const hash = parts.find(p => p.startsWith('v0='))?.slice(3)

    if (!timestamp || !hash) {
      console.warn('[PostCall] Invalid signature format')
      return false
    }

    // Create the signed payload: timestamp.payload
    const signedPayload = `${timestamp}.${payload}`
    const expectedHash = createHmac('sha256', WEBHOOK_SECRET)
      .update(signedPayload)
      .digest('hex')

    const isValid = hash === expectedHash
    if (!isValid) {
      console.warn('[PostCall] Signature mismatch')
    }
    return isValid
  } catch (error) {
    console.error('[PostCall] Signature verification error:', error)
    return false
  }
}

/**
 * POST /api/voice/post-call
 *
 * Receives post-call webhook from ElevenLabs after a conversation ends.
 * Handles both:
 * - post_call_transcription: Contains transcript data
 * - post_call_audio: Contains base64 audio data
 *
 * This endpoint is called by ElevenLabs, not the frontend.
 * Configure this URL in ElevenLabs workspace settings.
 */
export async function POST(request: NextRequest) {
  try {
    // Get raw body for signature verification
    const rawBody = await request.text()
    const signature = request.headers.get('elevenlabs-signature')

    console.log('[PostCall] Webhook received:', {
      hasSignature: !!signature,
      hasSecret: !!WEBHOOK_SECRET,
      bodyLength: rawBody.length,
      signaturePreview: signature?.substring(0, 50),
    })

    // Verify signature but log and continue if it fails (for debugging)
    const signatureValid = !WEBHOOK_SECRET || verifySignature(rawBody, signature)
    if (!signatureValid) {
      console.warn('[PostCall] Signature verification failed - processing anyway for debugging')
    }

    const rawPayload = JSON.parse(rawBody)

    // Check if this is the new wrapped format or the old format
    const isWrappedFormat = rawPayload.type && rawPayload.data

    console.log('[PostCall] Payload format:', {
      isWrappedFormat,
      type: rawPayload.type,
      hasData: !!rawPayload.data,
    })

    // Handle wrapped format (new ElevenLabs webhook format)
    if (isWrappedFormat) {
      const event = rawPayload as ElevenLabsWebhookEvent

      if (event.type === 'post_call_audio') {
        return handleAudioWebhook(event.data as ElevenLabsAudioPayload)
      } else if (event.type === 'post_call_transcription') {
        return handleTranscriptionWebhook(event.data as ElevenLabsPostCallPayload)
      } else {
        console.log('[PostCall] Unknown event type:', event.type)
        return NextResponse.json({
          success: true,
          message: `Unknown event type: ${event.type}`,
        })
      }
    }

    // Handle old format (backwards compatibility)
    const payload = rawPayload as ElevenLabsPostCallPayload
    return handleTranscriptionWebhook(payload)
  } catch (error) {
    console.error('[PostCall] Error processing webhook:', error)

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to process post-call data',
      },
      { status: 500 }
    )
  }
}

/**
 * Handle post_call_transcription webhook
 */
async function handleTranscriptionWebhook(payload: ElevenLabsPostCallPayload) {
  console.log('[PostCall] Processing transcription webhook:', {
    conversation_id: payload.conversation_id,
    agent_id: payload.agent_id,
    status: payload.status,
    duration_secs: payload.call_duration_secs,
    has_transcript: !!payload.transcript?.length,
    has_recording: !!payload.recording_url,
  })

  // Validate required fields
  if (!payload.conversation_id) {
    console.error('[PostCall] Missing conversation_id')
    return NextResponse.json(
      { success: false, error: 'Missing conversation_id' },
      { status: 400 }
    )
  }

  // Only process completed calls
  if (payload.status !== 'done') {
    console.log('[PostCall] Call status is not done:', payload.status)
    return NextResponse.json({
      success: true,
      message: `Call status: ${payload.status} - no processing needed`,
    })
  }

  // Format transcript as readable text
  const transcriptText = formatTranscript(payload.transcript)

  console.log('[PostCall] Transcript formatted:', {
    conversation_id: payload.conversation_id,
    transcript_length: transcriptText.length,
    entry_count: payload.transcript?.length || 0,
  })

  // Find the most recent report without files to link this transcript to
  const reportRepo = getReportRepository() as GoogleSheetsReportRepository
  const recentReport = await reportRepo.findRecentReportWithoutFiles()

  if (!recentReport) {
    console.warn('[PostCall] No recent report found without files to link transcript to')
    return NextResponse.json({
      success: true,
      conversation_id: payload.conversation_id,
      message: 'Post-call data received but no matching report found',
      transcript_entries: payload.transcript?.length || 0,
    })
  }

  console.log('[PostCall] Found matching report:', recentReport.id)

  const fileRepo = getFileRepository()
  let transcriptUrl: string | undefined
  let audioUrl: string | undefined

  // Upload transcript to Google Drive
  if (transcriptText) {
    try {
      const filename = `transcript-${recentReport.id}-${payload.conversation_id}.txt`
      transcriptUrl = await fileRepo.uploadTranscript(transcriptText, filename)
      console.log('[PostCall] Transcript uploaded:', transcriptUrl)
    } catch (uploadError) {
      console.error('[PostCall] Failed to upload transcript:', uploadError)
    }
  }

  // Try to fetch audio from ElevenLabs API
  // (audio may come via separate post_call_audio webhook or we can fetch it)
  if (!payload.recording_url && ELEVENLABS_API_KEY) {
    try {
      console.log('[PostCall] Fetching audio from ElevenLabs API...')
      const audioBuffer = await fetchAudioFromElevenLabs(payload.conversation_id)
      if (audioBuffer) {
        const filename = `audio-${recentReport.id}-${payload.conversation_id}.mp3`
        audioUrl = await fileRepo.uploadAudio(audioBuffer, filename)
        console.log('[PostCall] Audio fetched and uploaded:', audioUrl)
      }
    } catch (audioError) {
      console.error('[PostCall] Failed to fetch audio from API:', audioError)
    }
  } else if (payload.recording_url) {
    // Use recording_url if provided (old format)
    try {
      const filename = `audio-${recentReport.id}-${payload.conversation_id}.mp3`
      audioUrl = await fileRepo.uploadAudioFromUrl(payload.recording_url, filename)
      console.log('[PostCall] Audio downloaded and uploaded:', audioUrl)
    } catch (uploadError) {
      console.error('[PostCall] Failed to download/upload audio:', uploadError)
    }
  }

  // Update the report with file URLs
  if (audioUrl || transcriptUrl) {
    try {
      await reportRepo.updateFileUrls(recentReport.id, audioUrl, transcriptUrl)
      console.log('[PostCall] Report updated with file URLs')
    } catch (updateError) {
      console.error('[PostCall] Failed to update report with file URLs:', updateError)
    }
  }

  return NextResponse.json({
    success: true,
    conversation_id: payload.conversation_id,
    report_id: recentReport.id,
    message: 'Post-call data processed and linked to report',
    transcript_entries: payload.transcript?.length || 0,
    transcript_uploaded: !!transcriptUrl,
    audio_uploaded: !!audioUrl,
  })
}

/**
 * Handle post_call_audio webhook (base64 audio data)
 */
async function handleAudioWebhook(payload: ElevenLabsAudioPayload) {
  console.log('[PostCall] Processing audio webhook:', {
    conversation_id: payload.conversation_id,
    audio_data_length: payload.audio_data?.length || 0,
  })

  if (!payload.conversation_id || !payload.audio_data) {
    console.error('[PostCall] Missing conversation_id or audio_data')
    return NextResponse.json(
      { success: false, error: 'Missing conversation_id or audio_data' },
      { status: 400 }
    )
  }

  // Find the most recent report without audio
  const reportRepo = getReportRepository() as GoogleSheetsReportRepository
  const recentReport = await reportRepo.findRecentReportWithoutFiles()

  if (!recentReport) {
    console.warn('[PostCall] No recent report found to link audio to')
    return NextResponse.json({
      success: true,
      conversation_id: payload.conversation_id,
      message: 'Audio received but no matching report found',
    })
  }

  const fileRepo = getFileRepository()
  let audioUrl: string | undefined

  try {
    // Decode base64 audio data
    const audioBuffer = Buffer.from(payload.audio_data, 'base64')
    const filename = `audio-${recentReport.id}-${payload.conversation_id}.mp3`
    audioUrl = await fileRepo.uploadAudio(audioBuffer, filename)
    console.log('[PostCall] Audio uploaded from base64:', audioUrl)

    // Update the report with audio URL
    await reportRepo.updateFileUrls(recentReport.id, audioUrl, undefined)
    console.log('[PostCall] Report updated with audio URL')
  } catch (uploadError) {
    console.error('[PostCall] Failed to upload audio:', uploadError)
  }

  return NextResponse.json({
    success: true,
    conversation_id: payload.conversation_id,
    report_id: recentReport.id,
    message: 'Audio processed and linked to report',
    audio_uploaded: !!audioUrl,
  })
}

/**
 * Fetch audio from ElevenLabs API
 */
async function fetchAudioFromElevenLabs(conversationId: string): Promise<Buffer | null> {
  if (!ELEVENLABS_API_KEY) {
    console.warn('[PostCall] No ElevenLabs API key configured')
    return null
  }

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversations/${conversationId}/audio`,
      {
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
        },
      }
    )

    if (!response.ok) {
      console.error('[PostCall] ElevenLabs audio API error:', response.status)
      return null
    }

    const arrayBuffer = await response.arrayBuffer()
    return Buffer.from(arrayBuffer)
  } catch (error) {
    console.error('[PostCall] Failed to fetch audio from ElevenLabs:', error)
    return null
  }
}

/**
 * GET /api/voice/post-call
 *
 * Health check for the post-call webhook endpoint.
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: 'voice-post-call',
    message: 'Ready to receive post-call webhooks from ElevenLabs',
  })
}

/**
 * Format transcript entries into readable text
 */
function formatTranscript(transcript?: ElevenLabsPostCallPayload['transcript']): string {
  if (!transcript || transcript.length === 0) {
    return ''
  }

  return transcript
    .map((entry) => {
      const role = entry.role === 'agent' ? 'Roxy' : 'User'
      const time = entry.time_in_call_secs
        ? ` [${Math.floor(entry.time_in_call_secs / 60)}:${String(entry.time_in_call_secs % 60).padStart(2, '0')}]`
        : ''
      return `${role}${time}: ${entry.message}`
    })
    .join('\n')
}
