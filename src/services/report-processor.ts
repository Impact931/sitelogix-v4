/**
 * Report Processing Service
 *
 * Handles the full report processing pipeline:
 * 1. Normalize employee names via fuzzy matching
 * 2. Normalize vendor/subcontractor names (future: fuzzy matching)
 * 3. Calculate total hours
 * 4. Transform webhook data to DailyReport format
 * 5. Save report to repository (Google Sheets)
 */

import {
  getEmployeeRepository,
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
    const employeeRepo = getEmployeeRepository()
    const reportRepo = getReportRepository()

    // Get all active employees for fuzzy matching
    const activeEmployees = await employeeRepo.getAllActive()

    if (activeEmployees.length === 0) {
      warnings.push('No active employees found in reference list. Using original names.')
    }

    // Process employees with fuzzy matching
    const employeeHours: EmployeeHours[] = await Promise.all(
      data.employees.map(async (emp) => {
        const regularHours = Number(emp.regular_hours) || 0
        const overtimeHours = Number(emp.overtime_hours) || 0
        const totalHours = regularHours + overtimeHours

        let normalizedName = emp.name
        let employeeId: string | undefined
        let matched = false

        if (activeEmployees.length > 0) {
          const matchedEmployee = await employeeRepo.fuzzyMatch(emp.name, 0.6)
          if (matchedEmployee) {
            normalizedName = matchedEmployee.name
            employeeId = matchedEmployee.id
            matched = true
          } else {
            warnings.push(`No match found for employee "${emp.name}" - using original name`)
          }
        }

        processedEmployees.push({
          original: emp.name,
          normalized: normalizedName,
          matched,
        })

        return {
          employeeId,
          name: emp.name,
          normalizedName,
          regularHours,
          overtimeHours,
          totalHours,
        }
      })
    )

    // Process deliveries (future: fuzzy match vendors)
    const deliveries: Delivery[] | undefined = data.deliveries?.map((d) => ({
      vendor: d.vendor,
      normalizedVendor: d.vendor, // TODO: Fuzzy match against vendor roster
      material: d.material,
      quantity: d.quantity,
      notes: d.notes,
    }))

    // Process equipment (pass through)
    const equipment: Equipment[] | undefined = data.equipment?.map((e) => ({
      name: e.name,
      hours: e.hours ? Number(e.hours) : undefined,
      notes: e.notes,
    }))

    // Process subcontractors (future: fuzzy match companies)
    const subcontractors: Subcontractor[] | undefined = data.subcontractors?.map((s) => ({
      company: s.company,
      normalizedCompany: s.company, // TODO: Fuzzy match against subcontractor roster
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

      // People
      employees: employeeHours,
      subcontractors,

      // Materials & Equipment
      deliveries,
      equipment,
      shortages: data.shortages,

      // Conditions
      weatherConditions: data.weather_conditions,
      weatherImpact: data.weather_impact,

      // Safety & Issues
      safety,
      delays,

      // Work Summary
      workPerformed,
      notes: data.notes,

      // Files (will be populated later if available)
      audioUrl: data.audioUrl,
      transcriptUrl: undefined,
    }

    // Save to repository
    const reportId = await reportRepo.saveReport(report)

    console.log('[ReportProcessor] Report saved successfully:', {
      reportId,
      employeeCount: employeeHours.length,
      deliveryCount: deliveries?.length || 0,
      subcontractorCount: subcontractors?.length || 0,
      totalMatched: processedEmployees.filter((e) => e.matched).length,
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
  if (!data || typeof data !== 'object') {
    return false
  }

  const d = data as Record<string, unknown>

  // employees is required and must be an array
  if (!Array.isArray(d.employees)) {
    return false
  }

  // Must have at least one employee
  if (d.employees.length === 0) {
    return false
  }

  // Each employee must have a name and hours
  for (const emp of d.employees) {
    if (!emp || typeof emp !== 'object') return false
    const e = emp as Record<string, unknown>
    if (typeof e.name !== 'string' || e.name.trim() === '') return false
    // Hours can be number or string (will be parsed)
    if (e.regular_hours === undefined && e.overtime_hours === undefined) return false
  }

  return true
}
