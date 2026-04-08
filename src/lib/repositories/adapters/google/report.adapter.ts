/**
 * Google Sheets Report Repository Adapter
 *
 * Implements ReportRepository interface using Google Sheets API.
 * Writes to "Main Report Log" and "Payroll Summary" tabs.
 *
 * Main Report Log Columns (18 columns A-R):
 * A: Timestamp | B: Job Site | C: Employee Name | D: Regular Hours | E: OT Hours
 * F: Work Performed | G: Deliveries | H: Equipment | I: Safety | J: Weather
 * K: Audio Recording | L: Transcripts Link | M: Report ID
 * N: Delays | O: Shortages | P: Subcontractors | Q: Notes | R: Total Hours
 *
 * All text fields use natural language (readable by a foreman, not coded).
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

    // Combine notes and other into a single natural language field
    const notesText = [report.notes, report.other].filter(Boolean).join('. ') || ''

    // Write to Main Report Log - one row per employee
    // Columns A-R (18 columns), all text fields in natural language
    const mainLogRows = report.employees.map((emp) => {
      const empSafetyText = this.getSafetyForEmployee(report.safety, emp.normalizedName, report.employees.length)
      return [
        timestamp,                                          // A: Timestamp
        report.normalizedJobSite || report.jobSite || '',   // B: Job Site
        emp.normalizedName,                                 // C: Employee Name
        emp.regularHours,                                   // D: Regular Hours
        emp.overtimeHours,                                  // E: OT Hours
        workText || 'None reported',                        // F: Work Performed
        deliveriesText || 'None',                           // G: Deliveries
        equipmentText || 'None',                            // H: Equipment
        empSafetyText || 'No issues',                       // I: Safety
        weatherText || 'Not reported',                      // J: Weather
        report.audioUrl || '',                              // K: Audio Recording
        report.transcriptUrl || '',                         // L: Transcripts Link
        reportId,                                           // M: Report ID
        delaysText || 'None',                               // N: Delays
        report.shortages || 'None',                         // O: Shortages
        subcontractorsText || 'None',                       // P: Subcontractors
        notesText,                                          // Q: Notes
        emp.totalHours,                                     // R: Total Hours
      ]
    })

    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: `'${this.mainLogTab}'!A:R`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: mainLogRows,
      },
    })

    // Write to Payroll Summary - one row per employee
    const payrollRows = report.employees.map((emp) => [
      date,
      report.normalizedJobSite || report.jobSite || '',
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
   * Format deliveries as natural language.
   * "Ferguson delivered fittings. Missing connectors for the drains."
   */
  private formatDeliveries(deliveries: Delivery[] | undefined): string {
    if (!deliveries || deliveries.length === 0) return ''
    return deliveries
      .map((d) => {
        let text = `${d.vendor} delivered ${d.material}`
        if (d.quantity) text += ` (${d.quantity})`
        if (d.notes) text += `. ${d.notes}`
        return text
      })
      .join('. ')
  }

  /**
   * Format equipment as natural language.
   * "Excavator on site for 4 hours. Crane used for steel placement."
   */
  private formatEquipment(equipment: Equipment[] | undefined): string {
    if (!equipment || equipment.length === 0) return ''
    return equipment
      .map((e) => {
        let text = e.name
        if (e.hours) text += ` on site for ${e.hours} hours`
        if (e.notes) text += ` — ${e.notes}`
        return text
      })
      .join('. ')
  }

  /**
   * Format safety as natural language.
   * "No incidents reported" or "INCIDENT: Corey fell off a small ladder — file incident report"
   */
  private formatSafety(safety: SafetyEntry[] | undefined): string {
    if (!safety || safety.length === 0) return ''

    const positiveOnly = safety.every((s) => s.type === 'positive')
    if (positiveOnly) {
      return 'No incidents reported'
    }

    return safety
      .map((s) => {
        if (s.type === 'positive') return s.description
        const label = s.type === 'near_miss' ? 'NEAR MISS' :
                     s.type === 'hazard' ? 'HAZARD' : 'INCIDENT'
        let text = `${label}: ${s.description}`
        if (s.actionTaken) text += `. Action taken: ${s.actionTaken}`
        if (s.type === 'incident') text += '. FILE INCIDENT REPORT.'
        return text
      })
      .join('. ')
  }

  /**
   * Get safety text for a specific employee.
   * Matches safety entries to employees by name mention in description.
   * Unmatched non-positive entries are shown on ALL employee rows
   * (a safety incident affects the whole crew, not just one person).
   */
  private getSafetyForEmployee(safety: SafetyEntry[] | undefined, employeeName: string, totalEmployees: number): string {
    if (!safety || safety.length === 0) return ''

    const positiveOnly = safety.every((s) => s.type === 'positive')
    if (positiveOnly) return ''

    const nameParts = employeeName.toLowerCase().split(/\s+/)
    const firstName = nameParts[0]

    // Split into entries that mention this employee and entries that don't mention anyone
    const mentionsThisEmployee: SafetyEntry[] = []
    const mentionsNoOne: SafetyEntry[] = []

    for (const s of safety) {
      if (s.type === 'positive') continue
      const desc = s.description.toLowerCase()
      if (desc.includes(employeeName.toLowerCase()) || desc.includes(firstName)) {
        mentionsThisEmployee.push(s)
      } else {
        // Check if it mentions ANY other employee — if not, it's unmatched
        // For simplicity, treat all non-positive entries as relevant to all employees
        mentionsNoOne.push(s)
      }
    }

    // Combine: entries that mention this employee + unmatched entries (crew-wide)
    const relevant = [...mentionsThisEmployee, ...mentionsNoOne]
    if (relevant.length === 0) return ''

    return this.formatSafety(relevant)
  }

  /**
   * Format delays as natural language.
   * "Missing connectors from delivery caused a two-week delay."
   */
  private formatDelays(delays: DelayEntry[] | undefined): string {
    if (!delays || delays.length === 0) return ''
    return delays
      .map((d) => {
        let text = d.reason
        if (d.duration) text += `, delayed ${d.duration}`
        if (d.impact) text += `. ${d.impact}`
        return text
      })
      .join('. ')
  }

  /**
   * Format subcontractors as natural language.
   * "ABC Electric had 3 workers on site doing rough-in wiring."
   */
  private formatSubcontractors(subs: Subcontractor[] | undefined): string {
    if (!subs || subs.length === 0) return ''
    return subs
      .map((s) => {
        let text = s.company
        if (s.headcount) text += ` had ${s.headcount} workers on site`
        if (s.trade) text += ` doing ${s.trade}`
        if (s.workPerformed) text += ` — ${s.workPerformed}`
        return text
      })
      .join('. ')
  }

  /**
   * Format work performed as natural language.
   * "Completed framing on Building A. Electrical rough-in on Building B."
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

    // Group rows by report ID (column Q) to reconstruct reports
    const reportMap = new Map<string, DailyReport>()

    for (const row of rows) {
      const timestamp = new Date(row[0])

      if (timestamp < start || timestamp > end) continue

      // Use Report ID (column Q, index 16) as grouping key, fallback to timestamp
      const key = row[16] || row[0]

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
    // Find all rows with this report ID and update them
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `'${this.mainLogTab}'!A:R`,
    })

    const rows = response.data.values || []
    if (rows.length <= 1) {
      console.warn('[ReportAdapter] No data rows found')
      return
    }

    // Find rows with matching report ID (column M, index 12)
    const matchingRowIndices: number[] = []
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]
      if (row[12] === id) {
        matchingRowIndices.push(i + 1) // +1 because Sheets is 1-indexed
      }
    }

    if (matchingRowIndices.length === 0) {
      console.warn(`[ReportAdapter] No rows found with report ID: ${id}`)
      return
    }

    // Update each matching row
    const updates: Array<{ range: string; values: string[][] }> = []

    for (const rowIndex of matchingRowIndices) {
      // Update column K (Audio Link)
      if (audioUrl) {
        updates.push({
          range: `'${this.mainLogTab}'!K${rowIndex}`,
          values: [[audioUrl]],
        })
      }
      // Update column L (Transcript Link)
      if (transcriptUrl) {
        updates.push({
          range: `'${this.mainLogTab}'!L${rowIndex}`,
          values: [[transcriptUrl]],
        })
      }
    }

    if (updates.length > 0) {
      await this.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: {
          valueInputOption: 'USER_ENTERED',
          data: updates,
        },
      })

      console.log(`[ReportAdapter] Updated file URLs for ${matchingRowIndices.length} rows with report ID: ${id}`)
    }
  }

  /**
   * Find the most recent report that doesn't have file URLs yet
   * Used to match post-call webhook data to reports
   */
  async findRecentReportWithoutFiles(): Promise<{ id: string; rowIndices: number[] } | null> {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `'${this.mainLogTab}'!A:R`,
    })

    const rows = response.data.values || []
    if (rows.length <= 1) return null

    // Group rows by report ID and find the most recent without files
    const reportGroups = new Map<string, { timestamp: Date; rowIndices: number[]; hasFiles: boolean }>()

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]
      const reportId = row[12] // Column M
      const audioUrl = row[10]  // Column K
      const transcriptUrl = row[11] // Column L
      const timestamp = new Date(row[0]) // Column A

      if (!reportId) continue

      if (!reportGroups.has(reportId)) {
        reportGroups.set(reportId, {
          timestamp,
          rowIndices: [],
          hasFiles: !!(audioUrl || transcriptUrl),
        })
      }

      const group = reportGroups.get(reportId)!
      group.rowIndices.push(i + 1) // 1-indexed
      if (audioUrl || transcriptUrl) {
        group.hasFiles = true
      }
    }

    // Find the most recent report without files
    let mostRecent: { id: string; timestamp: Date; rowIndices: number[] } | null = null

    for (const [id, group] of reportGroups) {
      if (group.hasFiles) continue
      if (!mostRecent || group.timestamp > mostRecent.timestamp) {
        mostRecent = { id, timestamp: group.timestamp, rowIndices: group.rowIndices }
      }
    }

    return mostRecent ? { id: mostRecent.id, rowIndices: mostRecent.rowIndices } : null
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
