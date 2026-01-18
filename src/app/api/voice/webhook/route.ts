import { NextRequest, NextResponse } from 'next/server'
import { processReport, validateWebhookData } from '@/services/report-processor'
import type { RoxyWebhookData } from '@/lib/repositories'

/**
 * Expected webhook payload from ElevenLabs Conversational AI
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
 * Transform ElevenLabs payload to RoxyWebhookData format
 */
function transformPayload(payload: ConversationWebhookPayload): RoxyWebhookData | null {
  if (!payload.data?.employees || payload.data.employees.length === 0) {
    return null
  }

  return {
    jobSite: payload.data.job_site,
    employees: payload.data.employees.map((emp) => ({
      name: emp.name,
      regularHours: emp.regular_hours,
      overtimeHours: emp.overtime_hours,
    })),
    deliveries: payload.data.deliveries,
    incidents: payload.data.incidents,
    shortages: payload.data.shortages,
    timestamp: payload.metadata?.timestamp || new Date().toISOString(),
    audioUrl: payload.audio_url,
    transcript: payload.transcript,
  }
}

/**
 * POST /api/voice/webhook
 *
 * Receives completion data from ElevenLabs when a conversation ends.
 * This webhook is called by ElevenLabs to deliver the structured report data.
 */
export async function POST(request: NextRequest) {
  try {
    // Log the raw request for debugging
    const payload = await request.json() as ConversationWebhookPayload

    console.log('[Webhook] Received ElevenLabs callback:', {
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

      // Transform payload to our format
      const reportData = transformPayload(payload)

      if (!reportData || !validateWebhookData(reportData)) {
        console.error('[Webhook] Invalid report data - missing employees')
        return NextResponse.json({
          received: true,
          processed: false,
          error: 'Invalid report data',
        })
      }

      // Process and save the report
      const result = await processReport(reportData)

      if (!result.success) {
        console.error('[Webhook] Report processing failed:', result.errors)
        return NextResponse.json({
          received: true,
          processed: false,
          errors: result.errors,
        })
      }

      console.log('[Webhook] Report saved successfully:', {
        reportId: result.reportId,
        warnings: result.warnings,
        employees: result.processedEmployees,
      })

      return NextResponse.json({
        received: true,
        processed: true,
        conversation_id: payload.conversation_id,
        reportId: result.reportId,
        warnings: result.warnings,
      })
    }

    // Completed but no data
    return NextResponse.json({
      received: true,
      processed: false,
      conversation_id: payload.conversation_id,
      message: 'No report data to process',
    })
  } catch (error) {
    console.error('[Webhook] Error processing webhook:', error)

    // Return 200 anyway to prevent ElevenLabs from retrying
    // Log the error for debugging
    return NextResponse.json({
      received: true,
      processed: false,
      error: 'Processing error',
    })
  }
}

/**
 * GET /api/voice/webhook
 *
 * Health check for the webhook endpoint.
 * ElevenLabs may ping this to verify the endpoint is active.
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: 'voice-webhook',
    message: 'Ready to receive conversation callbacks',
  })
}
