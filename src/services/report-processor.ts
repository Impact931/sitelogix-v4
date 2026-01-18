/**
 * Report Processing Service
 *
 * Handles the full report processing pipeline:
 * 1. Normalize employee names via fuzzy matching
 * 2. Calculate total hours
 * 3. Save report to repository (Google Sheets)
 * 4. Upload audio/transcript files (if provided)
 */

import {
  getEmployeeRepository,
  getReportRepository,
  type DailyReport,
  type EmployeeHours,
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

    // Process each employee from the webhook data
    const employeeHours: EmployeeHours[] = await Promise.all(
      data.employees.map(async (emp) => {
        const regularHours = Number(emp.regularHours) || 0
        const overtimeHours = Number(emp.overtimeHours) || 0
        const totalHours = regularHours + overtimeHours

        // Try to fuzzy match the name
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

    // Build the report object
    const report: Omit<DailyReport, 'id' | 'createdAt' | 'updatedAt'> = {
      submittedAt: new Date(data.timestamp || Date.now()),
      timezone: 'America/New_York',
      jobSite: data.jobSite,
      employees: employeeHours,
      deliveries: data.deliveries,
      incidents: data.incidents,
      shortages: data.shortages,
      audioUrl: data.audioUrl,
      transcriptUrl: undefined, // Will be set after transcript upload
    }

    // Save to repository
    const reportId = await reportRepo.saveReport(report)

    console.log('[ReportProcessor] Report saved successfully:', {
      reportId,
      employeeCount: employeeHours.length,
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

  // Each employee must have a name and hours
  for (const emp of d.employees) {
    if (!emp || typeof emp !== 'object') return false
    const e = emp as Record<string, unknown>
    if (typeof e.name !== 'string' || e.name.trim() === '') return false
    if (typeof e.regularHours !== 'number' && typeof e.regularHours !== 'string') return false
  }

  return true
}
