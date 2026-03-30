import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { getFileRepository, getReportRepository, getSheetsReportRepository } from '@/lib/repositories'
import type { ElevenLabsPostCallPayload } from '@/lib/repositories'
import { DynamoDBReportRepository } from '@/lib/repositories/adapters/dynamodb/report.adapter'
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
  agent_id: string
  conversation_id: string
  full_audio: string // base64 encoded MP3 (ElevenLabs field name)
}

/**
 * Format date as "DD-MMM-YY HHMMhrs" in Central Time
 */
function formatDateForFilename(date: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const centralTime = new Date(date.toLocaleString('en-US', { timeZone: 'America/Chicago' }))
  const day = String(centralTime.getDate()).padStart(2, '0')
  const month = months[centralTime.getMonth()]
  const year = String(centralTime.getFullYear()).slice(-2)
  const hours = String(centralTime.getHours()).padStart(2, '0')
  const minutes = String(centralTime.getMinutes()).padStart(2, '0')
  return `${day}-${month}-${year} ${hours}${minutes}hrs`
}

function generateFilename(date: Date, extension: string): string {
  const dateStr = formatDateForFilename(date)
  return `Daily Report ${dateStr}.${extension}`
}

function verifySignature(payload: string, signature: string | null): boolean {
  if (!WEBHOOK_SECRET || !signature) return false
  try {
    const parts = signature.split(',')
    const timestamp = parts.find(p => p.startsWith('t='))?.slice(2)
    const hash = parts.find(p => p.startsWith('v0='))?.slice(3)
    if (!timestamp || !hash) return false
    const signedPayload = `${timestamp}.${payload}`
    const expectedHash = createHmac('sha256', WEBHOOK_SECRET).update(signedPayload).digest('hex')
    return hash === expectedHash
  } catch {
    return false
  }
}

/**
 * POST /api/voice/post-call
 *
 * Receives post-call webhook from ElevenLabs after a conversation ends.
 * Stores transcript in DynamoDB and uploads files to Google Drive.
 */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text()
    const signature = request.headers.get('elevenlabs-signature')

    console.log('[PostCall] Webhook received:', {
      hasSignature: !!signature,
      bodyLength: rawBody.length,
    })

    const signatureValid = !WEBHOOK_SECRET || verifySignature(rawBody, signature)
    if (!signatureValid) {
      console.warn('[PostCall] Signature verification failed - processing anyway for debugging')
    }

    const rawPayload = JSON.parse(rawBody)
    const isWrappedFormat = rawPayload.type && rawPayload.data

    if (isWrappedFormat) {
      const event = rawPayload as ElevenLabsWebhookEvent
      if (event.type === 'post_call_audio') {
        return handleAudioWebhook(event.data as ElevenLabsAudioPayload)
      } else if (event.type === 'post_call_transcription') {
        return handleTranscriptionWebhook(event.data as ElevenLabsPostCallPayload)
      } else {
        return NextResponse.json({ success: true, message: `Unknown event type: ${event.type}` })
      }
    }

    return handleTranscriptionWebhook(rawPayload as ElevenLabsPostCallPayload)
  } catch (error) {
    console.error('[PostCall] Error processing webhook:', error)
    return NextResponse.json({ success: false, error: 'Failed to process post-call data' }, { status: 500 })
  }
}

/**
 * Handle post_call_transcription webhook
 * Writes transcript to DynamoDB and uploads file to Google Drive
 */
async function handleTranscriptionWebhook(payload: ElevenLabsPostCallPayload) {
  console.log('[PostCall] Processing transcription:', {
    conversation_id: payload.conversation_id,
    status: payload.status,
    has_transcript: !!payload.transcript?.length,
  })

  if (!payload.conversation_id) {
    return NextResponse.json({ success: false, error: 'Missing conversation_id' }, { status: 400 })
  }

  if (payload.status !== 'done') {
    return NextResponse.json({ success: true, message: `Call status: ${payload.status}` })
  }

  const transcriptText = formatTranscript(payload.transcript)

  // Get repositories
  const dynamoRepo = getReportRepository() as DynamoDBReportRepository
  const sheetsRepo = getSheetsReportRepository() as GoogleSheetsReportRepository
  const fileRepo = getFileRepository()

  // Find matching report in DynamoDB
  const recentReportId = await dynamoRepo.findRecentReportWithoutFiles()

  // Also find in Sheets for dual-update
  const sheetsReport = await sheetsRepo.findRecentReportWithoutFiles()

  if (!recentReportId) {
    console.warn('[PostCall] No recent report found in DynamoDB')
    return NextResponse.json({
      success: true,
      conversation_id: payload.conversation_id,
      message: 'Post-call data received but no matching report found',
    })
  }

  console.log('[PostCall] Found matching report:', recentReportId)

  const submitTime = new Date()
  let transcriptUrl: string | undefined
  let audioUrl: string | undefined

  // Upload transcript to Google Drive
  if (transcriptText) {
    try {
      const filename = generateFilename(submitTime, 'txt')
      transcriptUrl = await fileRepo.uploadTranscript(transcriptText, filename)
      console.log('[PostCall] Transcript uploaded:', { filename, url: transcriptUrl })
    } catch (uploadError) {
      console.error('[PostCall] Failed to upload transcript:', uploadError)
    }
  }

  // Fetch audio from ElevenLabs API
  if (!payload.recording_url && ELEVENLABS_API_KEY) {
    try {
      const audioBuffer = await fetchAudioFromElevenLabs(payload.conversation_id)
      if (audioBuffer) {
        const filename = generateFilename(submitTime, 'mp3')
        audioUrl = await fileRepo.uploadAudio(audioBuffer, filename)
        console.log('[PostCall] Audio uploaded:', { filename, url: audioUrl })
      }
    } catch (audioError) {
      console.error('[PostCall] Failed to fetch audio:', audioError)
    }
  } else if (payload.recording_url) {
    try {
      const filename = generateFilename(submitTime, 'mp3')
      audioUrl = await fileRepo.uploadAudioFromUrl(payload.recording_url, filename)
      console.log('[PostCall] Audio downloaded and uploaded:', { filename, url: audioUrl })
    } catch (uploadError) {
      console.error('[PostCall] Failed to upload audio:', uploadError)
    }
  }

  // Update DynamoDB with transcript + file URLs
  try {
    if (payload.transcript) {
      await dynamoRepo.updateTranscript(
        recentReportId,
        payload.transcript,
        transcriptText,
        payload.conversation_id,
        payload.call_duration_secs
      )
    }
    if (audioUrl || transcriptUrl) {
      await dynamoRepo.updateFileUrls(recentReportId, audioUrl, transcriptUrl)
    }
    console.log('[PostCall] DynamoDB updated with transcript + files')
  } catch (dynamoError) {
    console.error('[PostCall] Failed to update DynamoDB:', dynamoError)
  }

  // Update Google Sheets with file URLs
  if (sheetsReport && (audioUrl || transcriptUrl)) {
    try {
      await sheetsRepo.updateFileUrls(sheetsReport.id, audioUrl, transcriptUrl)
      console.log('[PostCall] Google Sheets updated with file URLs')
    } catch (sheetsError) {
      console.error('[PostCall] Failed to update Sheets:', sheetsError)
    }
  }

  return NextResponse.json({
    success: true,
    conversation_id: payload.conversation_id,
    report_id: recentReportId,
    message: 'Post-call data processed - dual write complete',
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
    full_audio_length: payload.full_audio?.length || 0,
  })

  if (!payload.conversation_id || !payload.full_audio) {
    return NextResponse.json({ success: false, error: 'Missing data' }, { status: 400 })
  }

  const dynamoRepo = getReportRepository() as DynamoDBReportRepository
  const sheetsRepo = getSheetsReportRepository() as GoogleSheetsReportRepository
  const fileRepo = getFileRepository()

  const recentReportId = await dynamoRepo.findRecentReportWithoutFiles()
  const sheetsReport = await sheetsRepo.findRecentReportWithoutFiles()

  if (!recentReportId) {
    return NextResponse.json({
      success: true,
      conversation_id: payload.conversation_id,
      message: 'Audio received but no matching report found',
    })
  }

  let audioUrl: string | undefined

  try {
    const audioBuffer = Buffer.from(payload.full_audio, 'base64')
    const filename = generateFilename(new Date(), 'mp3')
    audioUrl = await fileRepo.uploadAudio(audioBuffer, filename)

    // Update DynamoDB
    await dynamoRepo.updateFileUrls(recentReportId, audioUrl, undefined)

    // Update Google Sheets
    if (sheetsReport) {
      await sheetsRepo.updateFileUrls(sheetsReport.id, audioUrl, undefined)
    }

    console.log('[PostCall] Audio uploaded and dual-written:', { filename, url: audioUrl })
  } catch (uploadError) {
    console.error('[PostCall] Failed to upload audio:', uploadError)
  }

  return NextResponse.json({
    success: true,
    conversation_id: payload.conversation_id,
    report_id: recentReportId,
    audio_uploaded: !!audioUrl,
  })
}

async function fetchAudioFromElevenLabs(conversationId: string): Promise<Buffer | null> {
  if (!ELEVENLABS_API_KEY) return null
  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversations/${conversationId}/audio`,
      { headers: { 'xi-api-key': ELEVENLABS_API_KEY } }
    )
    if (!response.ok) return null
    const arrayBuffer = await response.arrayBuffer()
    return Buffer.from(arrayBuffer)
  } catch {
    return null
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: 'voice-post-call',
    message: 'Ready to receive post-call webhooks from ElevenLabs',
  })
}

function formatTranscript(transcript?: ElevenLabsPostCallPayload['transcript']): string {
  if (!transcript || transcript.length === 0) return ''
  return transcript
    .map((entry) => {
      const role = entry.role === 'agent' ? 'Roxy' : 'User'
      const time = entry.time_in_call_secs
        ? ` [${Math.floor(entry.time_in_call_secs / 60)}:${String(Math.round(entry.time_in_call_secs) % 60).padStart(2, '0')}]`
        : ''
      return `${role}${time}: ${entry.message}`
    })
    .join('\n')
}
