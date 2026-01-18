import { NextRequest, NextResponse } from 'next/server'
import { processReport, validateWebhookData } from '@/services/report-processor'
import type { RoxyWebhookData } from '@/lib/repositories'

/**
 * POST /api/voice/webhook
 *
 * Receives report data from ElevenLabs Roxy agent.
 * This is called as a "tool" during the conversation when Roxy
 * has collected all the report information.
 *
 * The payload matches the submit_daily_report tool schema.
 */
export async function POST(request: NextRequest) {
  try {
    const payload = await request.json()

    console.log('[Webhook] Received payload:', JSON.stringify(payload, null, 2))

    // The payload comes directly from the ElevenLabs tool call
    // It matches our RoxyWebhookData interface (snake_case from ElevenLabs)
    const reportData: RoxyWebhookData = {
      job_site: payload.job_site,
      employees: payload.employees || [],
      deliveries: payload.deliveries,
      equipment: payload.equipment,
      subcontractors: payload.subcontractors,
      weather_conditions: payload.weather_conditions,
      weather_impact: payload.weather_impact,
      safety: payload.safety,
      delays: payload.delays,
      work_performed: payload.work_performed,
      shortages: payload.shortages,
      notes: payload.notes,
      timestamp: new Date().toISOString(),
    }

    // Validate required fields
    if (!validateWebhookData(reportData)) {
      console.error('[Webhook] Invalid report data - validation failed')
      return NextResponse.json({
        success: false,
        error: 'Invalid report data - employees array is required',
      })
    }

    console.log('[Webhook] Processing report:', {
      jobSite: reportData.job_site,
      employeeCount: reportData.employees.length,
      deliveryCount: reportData.deliveries?.length || 0,
      hasWeather: !!reportData.weather_conditions,
      safetyCount: reportData.safety?.length || 0,
    })

    // Process and save the report
    const result = await processReport(reportData)

    if (!result.success) {
      console.error('[Webhook] Report processing failed:', result.errors)
      return NextResponse.json({
        success: false,
        errors: result.errors,
        message: 'Failed to save report',
      })
    }

    console.log('[Webhook] Report saved successfully:', {
      reportId: result.reportId,
      warnings: result.warnings,
    })

    // Return success message for Roxy to read back
    return NextResponse.json({
      success: true,
      reportId: result.reportId,
      message: `Report submitted successfully for ${reportData.job_site || 'the job site'}. ${reportData.employees.length} employees recorded.`,
      warnings: result.warnings,
    })
  } catch (error) {
    console.error('[Webhook] Error processing webhook:', error)

    return NextResponse.json({
      success: false,
      error: 'Failed to process report',
      message: 'There was an error saving your report. Please try again.',
    })
  }
}

/**
 * GET /api/voice/webhook
 *
 * Health check for the webhook endpoint.
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: 'voice-webhook',
    message: 'Ready to receive daily reports from Roxy',
  })
}
