import { NextRequest, NextResponse } from 'next/server'
import { getFileRepository, getReportRepository } from '@/lib/repositories'
import type { ElevenLabsPostCallPayload } from '@/lib/repositories'
import { GoogleSheetsReportRepository } from '@/lib/repositories/adapters/google/report.adapter'

/**
 * POST /api/voice/post-call
 *
 * Receives post-call webhook from ElevenLabs after a conversation ends.
 * Contains transcript data and optionally audio recording URL.
 *
 * This endpoint is called by ElevenLabs, not the frontend.
 * Configure this URL in ElevenLabs agent settings under webhooks.
 */
export async function POST(request: NextRequest) {
  try {
    const payload: ElevenLabsPostCallPayload = await request.json()

    console.log('[PostCall] Received webhook:', {
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

    // Download audio from ElevenLabs and upload to Google Drive
    if (payload.recording_url) {
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
