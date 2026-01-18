/**
 * Google Sheets Report Repository Adapter
 *
 * Implements ReportRepository interface using Google Sheets API.
 * Writes to "Main Report Log" and "Payroll Summary" tabs.
 *
 * Main Report Log Columns (matching existing sheet):
 * A: Timestamp | B: Job Site | C: Employee Name | D: Regular Hours | E: OT Hours
 * F: Deliveries | G: Equipment | H: Incidents/Safety | I: Shortages
 * J: Audio Link | K: Transcript Link | L: Weather | M: Delays | N: Notes
 */

import type {
  DailyReport,
  ReportRepository,
  Delivery,
  Equipment,
  SafetyEntry,
  DelayEntry,
  Subcontractor,
  WorkEntry,
} from '../../types'
import { getSheetsClient, GOOGLE_CONFIG } from './auth'

export class GoogleSheetsReportRepository implements ReportRepository {
  private sheets = getSheetsClient()
  private spreadsheetId = GOOGLE_CONFIG.SHEETS_ID
  private mainLogTab = GOOGLE_CONFIG.TABS.MAIN_LOG
  private payrollTab = GOOGLE_CONFIG.TABS.PAYROLL_SUMMARY

  async saveReport(report: Omit<DailyReport, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const reportId = `RPT-${Date.now()}`
    const timestamp = this.formatTimestamp(report.submittedAt, report.timezone)
    const date = this.formatDate(report.submittedAt)

    // Format arrays as human-readable text for Google Sheets
    const deliveriesText = this.formatDeliveries(report.deliveries)
    const equipmentText = this.formatEquipment(report.equipment)
    const safetyText = this.formatSafety(report.safety)
    const delaysText = this.formatDelays(report.delays)
    const subcontractorsText = this.formatSubcontractors(report.subcontractors)
    const workText = this.formatWorkPerformed(report.workPerformed)

    // Combine weather info
    const weatherText = [report.weatherConditions, report.weatherImpact]
      .filter(Boolean)
      .join(' - ') || ''

    // Write to Main Report Log - one row per employee
    const mainLogRows = report.employees.map((emp) => [
      timestamp,                          // A: Timestamp
      report.jobSite || '',               // B: Job Site
      emp.normalizedName,                 // C: Employee Name
      emp.regularHours,                   // D: Regular Hours
      emp.overtimeHours,                  // E: OT Hours
      deliveriesText,                     // F: Deliveries
      equipmentText,                      // G: Equipment
      safetyText,                         // H: Incidents/Safety
      report.shortages || '',             // I: Shortages
      report.audioUrl || '',              // J: Audio Link
      report.transcriptUrl || '',         // K: Transcript Link
      weatherText,                        // L: Weather
      delaysText,                         // M: Delays
      report.notes || '',                 // N: Notes
      subcontractorsText,                 // O: Subcontractors
      workText,                           // P: Work Performed
      reportId,                           // Q: Report ID
    ])

    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: `'${this.mainLogTab}'!A:Q`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: mainLogRows,
      },
    })

    // Write to Payroll Summary - one row per employee
    const payrollRows = report.employees.map((emp) => [
      date,
      report.jobSite || '',
      emp.normalizedName,
      emp.regularHours,
      emp.overtimeHours,
      emp.totalHours,
    ])

    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: `'${this.payrollTab}'!A:F`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: payrollRows,
      },
    })

    return reportId
  }

  // ============================================
  // FORMATTING HELPERS - Human-readable text
  // ============================================

  /**
   * Format deliveries: "Ferguson: pipe (wrong size); ABC Supply: lumber"
   */
  private formatDeliveries(deliveries: Delivery[] | undefined): string {
    if (!deliveries || deliveries.length === 0) return ''
    return deliveries
      .map((d) => {
        let text = `${d.vendor}: ${d.material}`
        if (d.quantity) text += ` (${d.quantity})`
        if (d.notes) text += ` - ${d.notes}`
        return text
      })
      .join('; ')
  }

  /**
   * Format equipment: "Excavator (4 hrs); Crane (2 hrs)"
   */
  private formatEquipment(equipment: Equipment[] | undefined): string {
    if (!equipment || equipment.length === 0) return ''
    return equipment
      .map((e) => {
        let text = e.name
        if (e.hours) text += ` (${e.hours} hrs)`
        if (e.notes) text += ` - ${e.notes}`
        return text
      })
      .join('; ')
  }

  /**
   * Format safety: "No incidents" or "Near miss: worker slipped; Hazard: loose railing"
   */
  private formatSafety(safety: SafetyEntry[] | undefined): string {
    if (!safety || safety.length === 0) return ''

    // Check if it's just a positive report
    const positiveOnly = safety.every((s) => s.type === 'positive')
    if (positiveOnly) {
      return safety.map((s) => s.description).join('; ') || 'No incidents'
    }

    return safety
      .map((s) => {
        const typeLabel = s.type === 'near_miss' ? 'Near miss' :
                         s.type.charAt(0).toUpperCase() + s.type.slice(1)
        let text = `${typeLabel}: ${s.description}`
        if (s.actionTaken) text += ` (Action: ${s.actionTaken})`
        return text
      })
      .join('; ')
  }

  /**
   * Format delays: "Rain delay (2 hrs) - lost productivity; Waiting on materials (1 hr)"
   */
  private formatDelays(delays: DelayEntry[] | undefined): string {
    if (!delays || delays.length === 0) return ''
    return delays
      .map((d) => {
        let text = d.reason
        if (d.duration) text += ` (${d.duration})`
        if (d.impact) text += ` - ${d.impact}`
        return text
      })
      .join('; ')
  }

  /**
   * Format subcontractors: "ABC Electric (3 workers) - wiring; XYZ Plumbing (2 workers)"
   */
  private formatSubcontractors(subs: Subcontractor[] | undefined): string {
    if (!subs || subs.length === 0) return ''
    return subs
      .map((s) => {
        let text = s.company
        if (s.headcount) text += ` (${s.headcount} workers)`
        if (s.trade) text += ` - ${s.trade}`
        if (s.workPerformed) text += `: ${s.workPerformed}`
        return text
      })
      .join('; ')
  }

  /**
   * Format work performed: "Framing (Building A); Electrical rough-in (Building B)"
   */
  private formatWorkPerformed(work: WorkEntry[] | undefined): string {
    if (!work || work.length === 0) return ''
    return work
      .map((w) => {
        let text = w.description
        if (w.area) text += ` (${w.area})`
        return text
      })
      .join('; ')
  }

  // ============================================
  // PARSING HELPERS - For reading back data
  // ============================================

  /**
   * Parse a JSON string back to an array (for backward compatibility)
   */
  private parseArray<T>(json: string): T[] {
    if (!json || json.trim() === '') return []
    try {
      return JSON.parse(json)
    } catch {
      return []
    }
  }

  async getReportById(id: string): Promise<DailyReport | null> {
    // Google Sheets doesn't have a native ID system
    // For production, you might want to add an ID column
    // This is a simplified implementation
    console.warn('getReportById not fully implemented for Google Sheets')
    return null
  }

  async getReportsByDateRange(start: Date, end: Date): Promise<DailyReport[]> {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `'${this.mainLogTab}'!A2:R`,
    })

    const rows = response.data.values || []

    // Group rows by report ID (column R) to reconstruct reports
    const reportMap = new Map<string, DailyReport>()

    for (const row of rows) {
      const timestamp = new Date(row[0])

      if (timestamp < start || timestamp > end) continue

      // Use Report ID (column R, index 17) as grouping key, fallback to timestamp
      const key = row[17] || row[0]

      if (!reportMap.has(key)) {
        reportMap.set(key, {
          id: key,
          submittedAt: timestamp,
          timezone: 'America/New_York',
          jobSite: row[1] || undefined,
          employees: [],
          deliveries: this.parseArray(row[5]),
          equipment: this.parseArray(row[6]),
          subcontractors: this.parseArray(row[7]),
          weatherConditions: row[8] || undefined,
          weatherImpact: row[9] || undefined,
          safety: this.parseArray(row[10]),
          delays: this.parseArray(row[11]),
          workPerformed: this.parseArray(row[12]),
          shortages: row[13] || undefined,
          notes: row[14] || undefined,
          audioUrl: row[15] || undefined,
          transcriptUrl: row[16] || undefined,
        })
      }

      const report = reportMap.get(key)!
      report.employees.push({
        name: row[2],
        normalizedName: row[2],
        regularHours: Number(row[3]) || 0,
        overtimeHours: Number(row[4]) || 0,
        totalHours: (Number(row[3]) || 0) + (Number(row[4]) || 0),
      })
    }

    return Array.from(reportMap.values()).sort(
      (a, b) => b.submittedAt.getTime() - a.submittedAt.getTime()
    )
  }

  async getRecentReports(limit = 10): Promise<DailyReport[]> {
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - 30) // Last 30 days

    const reports = await this.getReportsByDateRange(start, end)
    return reports.slice(0, limit)
  }

  async updateFileUrls(id: string, audioUrl?: string, transcriptUrl?: string): Promise<void> {
    // For Google Sheets, we would need to find and update the specific rows
    // This is complex without a proper ID system
    console.warn('updateFileUrls not fully implemented for Google Sheets')
  }

  /**
   * Format timestamp for Google Sheets display
   * Example: "January 18, 2025, 2:45 PM EST"
   */
  private formatTimestamp(date: Date, timezone: string): string {
    return date.toLocaleString('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short',
    })
  }

  /**
   * Format date for Payroll Summary
   * Example: "2025-01-18"
   */
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0]
  }
}
