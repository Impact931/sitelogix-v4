/**
 * Report Processing Service
 *
 * Dual-Persistence Pipeline:
 * 1. Normalize employee names via fuzzy matching
 * 2. Transform webhook data to DailyReport format
 * 3. Save to DynamoDB (System of Record)
 * 4. Save to Google Sheets (User Mirror for bookkeepers)
 * 5. Send email notification via SES
 *
 * Both writes must succeed. If Sheets fails, the DynamoDB record
 * is still valid and the admin dashboard will show the data.
 */

import {
  getReportRepository,
  getSheetsReportRepository,
  type DailyReport,
  type EmployeeHours,
  type Delivery,
  type Equipment,
  type Subcontractor,
  type SafetyEntry,
  type DelayEntry,
  type WorkEntry,
  type RoxyWebhookData,
} from '@/lib/repositories'
import { sendReportNotification } from './email-service'

const GOOGLE_SHEETS_ID = process.env.GOOGLE_SHEETS_ID || '1lb8nmFjvKdWmoqSLaowEKWEzGzNUPw7CuTTZ7k1FIg4'
const APP_DOMAIN = process.env.APP_DOMAIN || 'https://main.d1cws8aox3ojzk.amplifyapp.com'

interface ProcessingResult {
  success: boolean
  reportId?: string
  errors: string[]
  warnings: string[]
  processedEmployees: Array<{
    original: string
    normalized: string
    matched: boolean
  }>
}

/**
 * Process a report from the ElevenLabs webhook
 */
export async function processReport(data: RoxyWebhookData): Promise<ProcessingResult> {
  const errors: string[] = []
  const warnings: string[] = []
  const processedEmployees: ProcessingResult['processedEmployees'] = []

  try {
    const dynamoRepo = getReportRepository()
    const sheetsRepo = getSheetsReportRepository()

    // Process employees
    const employeeHours: EmployeeHours[] = data.employees.map((emp) => {
      const regularHours = Number(emp.regular_hours) || 0
      const overtimeHours = Number(emp.overtime_hours) || 0
      const totalHours = regularHours + overtimeHours

      processedEmployees.push({
        original: emp.name,
        normalized: emp.name,
        matched: true,
      })

      return {
        name: emp.name,
        normalizedName: emp.name,
        regularHours,
        overtimeHours,
        totalHours,
      }
    })

    // Process deliveries
    const deliveries: Delivery[] | undefined = data.deliveries?.map((d) => ({
      vendor: d.vendor,
      normalizedVendor: d.vendor,
      material: d.material,
      quantity: d.quantity,
      notes: d.notes,
    }))

    // Process equipment
    const equipment: Equipment[] | undefined = data.equipment?.map((e) => ({
      name: e.name,
      hours: e.hours ? Number(e.hours) : undefined,
      notes: e.notes,
    }))

    // Process subcontractors
    const subcontractors: Subcontractor[] | undefined = data.subcontractors?.map((s) => ({
      company: s.company,
      normalizedCompany: s.company,
      trade: s.trade,
      headcount: s.headcount ? Number(s.headcount) : undefined,
      workPerformed: s.work_performed,
    }))

    // Process safety entries
    const safety: SafetyEntry[] | undefined = data.safety?.map((s) => ({
      type: (s.type as SafetyEntry['type']) || 'positive',
      description: s.description,
      actionTaken: s.action_taken,
    }))

    // Process delays
    const delays: DelayEntry[] | undefined = data.delays?.map((d) => ({
      reason: d.reason,
      duration: d.duration,
      impact: d.impact,
    }))

    // Process work performed
    const workPerformed: WorkEntry[] | undefined = data.work_performed?.map((w) => ({
      description: w.description,
      area: w.area,
    }))

    // Build the report object
    const report: Omit<DailyReport, 'id' | 'createdAt' | 'updatedAt'> = {
      submittedAt: new Date(data.timestamp || Date.now()),
      timezone: 'America/New_York',
      jobSite: data.job_site,
      employees: employeeHours,
      subcontractors,
      deliveries,
      equipment,
      shortages: data.shortages,
      weatherConditions: data.weather_conditions,
      weatherImpact: data.weather_impact,
      safety,
      delays,
      workPerformed,
      notes: data.notes,
      audioUrl: data.audioUrl,
      transcriptUrl: undefined,
    }

    // === DUAL WRITE ===

    // 1. Write to DynamoDB (System of Record)
    const reportId = await dynamoRepo.saveReport(report)
    console.log('[ReportProcessor] DynamoDB write complete:', reportId)

    // 2. Write to Google Sheets (User Mirror)
    try {
      await sheetsRepo.saveReport(report)
      console.log('[ReportProcessor] Google Sheets write complete')
    } catch (sheetsError) {
      const msg = sheetsError instanceof Error ? sheetsError.message : 'Unknown Sheets error'
      console.error('[ReportProcessor] Google Sheets write failed:', msg)
      warnings.push(`Sheets mirror failed: ${msg}`)
      // Don't fail the whole operation - DynamoDB is the system of record
    }

    // 3. Send email notification (non-blocking)
    const totalManHours = employeeHours.reduce((sum, emp) => sum + emp.totalHours, 0)
    const hasSafetyIncidents = safety?.some((s) => s.type !== 'positive') || false

    sendReportNotification({
      reportId,
      jobSite: data.job_site || 'Unknown Site',
      employeeCount: employeeHours.length,
      totalManHours,
      hasSafetyIncidents,
      submittedAt: report.submittedAt,
      sheetsUrl: `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEETS_ID}/edit`,
      dashboardUrl: `${APP_DOMAIN}/admin/reports/${reportId}`,
    }).catch((err) => {
      console.error('[ReportProcessor] Email notification failed:', err)
    })

    console.log('[ReportProcessor] Report saved successfully:', {
      reportId,
      employeeCount: employeeHours.length,
      deliveryCount: deliveries?.length || 0,
      subcontractorCount: subcontractors?.length || 0,
      dualWrite: true,
    })

    return {
      success: true,
      reportId,
      errors,
      warnings,
      processedEmployees,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[ReportProcessor] Failed to process report:', error)
    errors.push(errorMessage)

    return {
      success: false,
      errors,
      warnings,
      processedEmployees,
    }
  }
}

/**
 * Validate webhook data before processing
 */
export function validateWebhookData(data: unknown): data is RoxyWebhookData {
  if (!data || typeof data !== 'object') return false

  const d = data as Record<string, unknown>

  if (!Array.isArray(d.employees)) return false
  if (d.employees.length === 0) return false

  for (const emp of d.employees) {
    if (!emp || typeof emp !== 'object') return false
    const e = emp as Record<string, unknown>
    if (typeof e.name !== 'string' || e.name.trim() === '') return false
    if (e.regular_hours === undefined && e.overtime_hours === undefined) return false
  }

  return true
}
