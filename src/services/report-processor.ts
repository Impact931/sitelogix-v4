/**
 * Report Processing Service
 *
 * Writes to Google Sheets (bookkeeper mirror) from Amplify SSR.
 * DynamoDB write happens in the post-call Lambda after the conversation ends,
 * where the full transcript is available.
 *
 * Pipeline:
 * 1. Normalize employee names
 * 2. Transform webhook data to DailyReport format
 * 3. Save report to Google Sheets
 */

import {
  getReportRepository,
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
    const reportRepo = getReportRepository()

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

    // Process other fields
    const deliveries: Delivery[] | undefined = data.deliveries?.map((d) => ({
      vendor: d.vendor,
      normalizedVendor: d.vendor,
      material: d.material,
      quantity: d.quantity,
      notes: d.notes,
    }))

    const equipment: Equipment[] | undefined = data.equipment?.map((e) => ({
      name: e.name,
      hours: e.hours ? Number(e.hours) : undefined,
      notes: e.notes,
    }))

    const subcontractors: Subcontractor[] | undefined = data.subcontractors?.map((s) => ({
      company: s.company,
      normalizedCompany: s.company,
      trade: s.trade,
      headcount: s.headcount ? Number(s.headcount) : undefined,
      workPerformed: s.work_performed,
    }))

    const safety: SafetyEntry[] | undefined = data.safety?.map((s) => ({
      type: (s.type as SafetyEntry['type']) || 'positive',
      description: s.description,
      actionTaken: s.action_taken,
    }))

    const delays: DelayEntry[] | undefined = data.delays?.map((d) => ({
      reason: d.reason,
      duration: d.duration,
      impact: d.impact,
    }))

    const workPerformed: WorkEntry[] | undefined = data.work_performed?.map((w) => ({
      description: w.description,
      area: w.area,
    }))

    // Build the report
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

    // Save to Google Sheets
    const reportId = await reportRepo.saveReport(report)

    console.log('[ReportProcessor] Report saved to Google Sheets:', {
      reportId,
      employeeCount: employeeHours.length,
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
