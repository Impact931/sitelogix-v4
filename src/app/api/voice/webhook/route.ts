import { NextRequest, NextResponse } from 'next/server'

/**
 * Expected webhook payload from 11Labs Conversational AI
 * This structure comes from the Roxy agent after conversation completes.
 */
interface ConversationWebhookPayload {
  conversation_id: string
  agent_id: string
  status: 'completed' | 'failed' | 'interrupted'
  transcript?: string
  audio_url?: string
  data?: {
    job_site?: string
    employees?: Array<{
      name: string
      regular_hours: number
      overtime_hours: number
    }>
    deliveries?: string
    incidents?: string
    shortages?: string
  }
  metadata?: {
    duration_seconds?: number
    timestamp?: string
  }
}

/**
 * POST /api/voice/webhook
 *
 * Receives completion data from 11Labs when a conversation ends.
 * This webhook is called by 11Labs to deliver the structured report data.
 */
export async function POST(request: NextRequest) {
  try {
    // Log the raw request for debugging
    const payload = await request.json() as ConversationWebhookPayload

    console.log('[Webhook] Received 11Labs callback:', {
      conversation_id: payload.conversation_id,
      status: payload.status,
      hasTranscript: !!payload.transcript,
      hasAudioUrl: !!payload.audio_url,
      hasData: !!payload.data,
    })

    // Validate the webhook (in production, verify signature)
    // const signature = request.headers.get('x-elevenlabs-signature')
    // TODO: Implement signature verification for production

    if (payload.status === 'failed') {
      console.error('[Webhook] Conversation failed:', payload.conversation_id)
      return NextResponse.json({ received: true, processed: false })
    }

    if (payload.status === 'interrupted') {
      console.log('[Webhook] Conversation interrupted:', payload.conversation_id)
      return NextResponse.json({ received: true, processed: false })
    }

    // Process completed conversation
    if (payload.status === 'completed' && payload.data) {
      console.log('[Webhook] Processing report data:', {
        jobSite: payload.data.job_site,
        employeeCount: payload.data.employees?.length || 0,
      })

      // TODO: Phase 2 - Process and save the report
      // 1. Normalize employee names against reference
      // 2. Calculate total hours
      // 3. Save to repository (Google Sheets or PostgreSQL)
      // 4. Upload audio and transcript files
      // 5. Send email notification

      // For now, just log the data
      console.log('[Webhook] Report data:', JSON.stringify(payload.data, null, 2))
    }

    // Always return 200 to acknowledge receipt
    return NextResponse.json({
      received: true,
      processed: true,
      conversation_id: payload.conversation_id
    })
  } catch (error) {
    console.error('[Webhook] Error processing webhook:', error)

    // Return 200 anyway to prevent 11Labs from retrying
    // Log the error for debugging
    return NextResponse.json({
      received: true,
      processed: false,
      error: 'Processing error'
    })
  }
}

/**
 * GET /api/voice/webhook
 *
 * Health check for the webhook endpoint.
 * 11Labs may ping this to verify the endpoint is active.
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: 'voice-webhook',
    message: 'Ready to receive conversation callbacks',
  })
}
