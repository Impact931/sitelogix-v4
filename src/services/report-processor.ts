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
  getEmployeeRepository,
  getJobSiteRepository,
  getVendorRepository,
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
import { getTenantConfig } from '@/lib/tenant/config'

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
export async function processReport(data: RoxyWebhookData, tenantId: string = 'parkway'): Promise<ProcessingResult> {
  const errors: string[] = []
  const warnings: string[] = []
  const processedEmployees: ProcessingResult['processedEmployees'] = []

  try {
    const reportRepo = getReportRepository(tenantId)
    const employeeRepo = getEmployeeRepository(tenantId)
    const jobSiteRepo = getJobSiteRepository(tenantId)
    const vendorRepo = getVendorRepository(tenantId)

    // Load employee roster for name matching
    let rosterEmployees: Awaited<ReturnType<typeof employeeRepo.getAllActive>> = []
    try {
      rosterEmployees = await employeeRepo.getAllActive()
      console.log(`[ReportProcessor] Loaded ${rosterEmployees.length} employees from roster`)
    } catch (rosterError) {
      warnings.push('Could not load employee roster for name matching')
      console.warn('[ReportProcessor] Failed to load roster:', rosterError)
    }

    // Match job site name against Job Sites tab
    let normalizedJobSite: string | undefined
    if (data.job_site) {
      try {
        const siteMatch = await jobSiteRepo.fuzzyMatch(data.job_site, 0.5)
        if (siteMatch) {
          normalizedJobSite = siteMatch.name
          console.log(`[ReportProcessor] Job site matched: "${data.job_site}" → "${siteMatch.name}"`)
        } else {
          warnings.push(`No job site match for "${data.job_site}" — using as-is`)
          normalizedJobSite = data.job_site
        }
      } catch (siteError) {
        warnings.push('Could not load job sites for matching')
        console.warn('[ReportProcessor] Failed to load job sites:', siteError)
        normalizedJobSite = data.job_site
      }
    }

    // Process employees with name matching against roster
    const employeeHours: EmployeeHours[] = []
    for (const emp of data.employees) {
      const rawRegular = Number(emp.regular_hours) || 0
      const rawOvertime = Number(emp.overtime_hours) || 0

      // Apply lunch deduction and OT split
      const { regularHours, overtimeHours } = applyLunchDeduction(rawRegular, rawOvertime)
      const totalHours = regularHours + overtimeHours

      let normalizedName = emp.name
      let matched = false

      if (rosterEmployees.length > 0) {
        // Try fuzzy match against roster
        const matchResult = await employeeRepo.fuzzyMatch(emp.name, 0.5)
        if (matchResult) {
          normalizedName = matchResult.name
          matched = true
        } else {
          warnings.push(`No roster match for "${emp.name}" — using as-is`)
        }
      }

      processedEmployees.push({
        original: emp.name,
        normalized: normalizedName,
        matched,
      })

      employeeHours.push({
        name: emp.name,
        normalizedName,
        regularHours,
        overtimeHours,
        totalHours,
      })
    }

    // Process deliveries with vendor name matching
    let deliveries: Delivery[] | undefined
    if (data.deliveries && data.deliveries.length > 0) {
      deliveries = []
      for (const d of data.deliveries) {
        let normalizedVendor = d.vendor
        try {
          const vendorMatch = await vendorRepo.fuzzyMatch(d.vendor, 0.5)
          if (vendorMatch) {
            normalizedVendor = vendorMatch.name
            console.log(`[ReportProcessor] Vendor matched: "${d.vendor}" → "${vendorMatch.name}"`)
          } else {
            warnings.push(`No vendor match for "${d.vendor}" — using as-is`)
          }
        } catch (vendorError) {
          warnings.push('Could not load vendors for matching')
          console.warn('[ReportProcessor] Failed to load vendors:', vendorError)
        }
        deliveries.push({
          vendor: d.vendor,
          normalizedVendor,
          material: d.material,
          quantity: d.quantity,
          notes: d.notes,
        })
      }
    }

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
      timezone: getTenantConfig(tenantId)?.timezone || 'America/New_York',
      jobSite: data.job_site,
      normalizedJobSite,
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
      other: data.other,
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
 * Apply lunch deduction and OT split to raw hours from Roxy.
 *
 * Rules:
 * - If the foreman explicitly split regular/OT (overtime_hours > 0), pass through as-is.
 * - If all hours are in regular_hours (overtime_hours = 0), treat as raw total:
 *   1. Deduct 30 minutes for lunch
 *   2. First 8 hours of raw time (7.5 net after lunch) = regular
 *   3. Everything beyond 8 raw hours = overtime (no lunch deduction on OT)
 *
 * Examples:
 * - "worked 8 hours" → 8 raw → 7.5 regular, 0 OT
 * - "worked 10 hours" → 10 raw → 7.5 regular, 2 OT
 * - "7am to 8pm" (13 hrs) → 13 raw → 7.5 regular, 5 OT
 * - "8 regular, 2 overtime" (explicit) → pass through 8 regular, 2 OT
 */
function applyLunchDeduction(
  rawRegular: number,
  rawOvertime: number
): { regularHours: number; overtimeHours: number } {
  // If foreman explicitly split reg/OT, respect that — no adjustment
  if (rawOvertime > 0) {
    return { regularHours: rawRegular, overtimeHours: rawOvertime }
  }

  // All hours in regular_hours — treat as raw total and apply rules
  const rawTotal = rawRegular
  const LUNCH_DEDUCTION = 0.5
  const RAW_REGULAR_CAP = 8 // 8 raw hours = 7.5 net after lunch

  if (rawTotal <= 0) {
    return { regularHours: 0, overtimeHours: 0 }
  }

  if (rawTotal <= RAW_REGULAR_CAP) {
    // All regular time, deduct lunch
    return { regularHours: rawTotal - LUNCH_DEDUCTION, overtimeHours: 0 }
  }

  // Over 8 raw hours: 7.5 regular + remainder as OT
  const regularHours = RAW_REGULAR_CAP - LUNCH_DEDUCTION // 7.5
  const overtimeHours = rawTotal - RAW_REGULAR_CAP
  return { regularHours, overtimeHours }
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
