/**
 * Google Sheets Report Repository Adapter
 *
 * Implements ReportRepository interface using Google Sheets API.
 * Writes to "Main Report Log" and "Payroll Summary" tabs.
 *
 * Main Report Log Columns (17 columns A-Q):
 * A: Timestamp | B: Job Site | C: Employee Name | D: Regular Hours | E: OT Hours
 * F: Deliveries | G: Equipment | H: Safety | I: Weather | J: Shortages
 * K: Audio Link | L: Transcript Link | M: Delays | N: Notes
 * O: Subcontractors | P: Work Performed | Q: Report ID
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
    // Columns: A-Q (17 columns)
    const mainLogRows = report.employees.map((emp) => [
      timestamp,                          // A: Timestamp
      report.jobSite || '',               // B: Job Site
      emp.normalizedName,                 // C: Employee Name
      emp.regularHours,                   // D: Regular Hours
      emp.overtimeHours,                  // E: OT Hours
      deliveriesText,                     // F: Deliveries
      equipmentText,                      // G: Equipment
      safetyText,                         // H: Safety
      weatherText,                        // I: Weather
      report.shortages || '',             // J: Shortages
      report.audioUrl || '',              // K: Audio Link
      report.transcriptUrl || '',         // L: Transcript Link
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
      range: `'${this.mainLogTab}'!A2:Q`,
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
    console.log('[ReportAdapter] updateFileUrls called:', {
      id,
      audioUrl: audioUrl?.substring(0, 50),
      transcriptUrl: transcriptUrl?.substring(0, 50),
    })

    // Find all rows with this report ID and update them
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `'${this.mainLogTab}'!A:Q`,
    })

    const rows = response.data.values || []
    console.log('[ReportAdapter] Retrieved rows:', {
      totalRows: rows.length,
      spreadsheetId: this.spreadsheetId,
      tab: this.mainLogTab,
    })

    if (rows.length <= 1) {
      console.warn('[ReportAdapter] No data rows found')
      return
    }

    // Find rows with matching report ID (column Q, index 16)
    const matchingRowIndices: number[] = []
    const allReportIds: string[] = []

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]
      const rowReportId = row[16]
      if (rowReportId) {
        allReportIds.push(rowReportId)
      }
      if (rowReportId === id) {
        matchingRowIndices.push(i + 1) // +1 because Sheets is 1-indexed
        console.log(`[ReportAdapter] Found matching row ${i + 1} with ID: ${rowReportId}`)
      }
    }

    console.log('[ReportAdapter] Search results:', {
      searchingFor: id,
      foundRows: matchingRowIndices.length,
      lastFiveReportIds: allReportIds.slice(-5),
    })

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

    console.log('[ReportAdapter] Prepared updates:', {
      updateCount: updates.length,
      ranges: updates.map(u => u.range),
    })

    if (updates.length > 0) {
      const result = await this.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: {
          valueInputOption: 'USER_ENTERED',
          data: updates,
        },
      })

      console.log('[ReportAdapter] Batch update result:', {
        updatedCells: result.data.totalUpdatedCells,
        updatedRows: result.data.totalUpdatedRows,
        responses: result.data.responses?.length,
      })

      console.log(`[ReportAdapter] Updated file URLs for ${matchingRowIndices.length} rows with report ID: ${id}`)
    }
  }

  /**
   * Find the most recent report that doesn't have file URLs yet
   * Used to match post-call webhook data to reports
   */
  async findRecentReportWithoutFiles(): Promise<{ id: string; rowIndices: number[] } | null> {
    console.log('[ReportAdapter] findRecentReportWithoutFiles called')

    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `'${this.mainLogTab}'!A:Q`,
    })

    const rows = response.data.values || []
    console.log('[ReportAdapter] Retrieved rows for matching:', {
      totalRows: rows.length,
      spreadsheetId: this.spreadsheetId,
    })

    if (rows.length <= 1) {
      console.warn('[ReportAdapter] No data rows found')
      return null
    }

    // Group rows by report ID and find the most recent without files
    const reportGroups = new Map<string, { timestamp: Date; rowIndices: number[]; hasFiles: boolean }>()

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]
      const reportId = row[16] // Column Q
      const audioUrl = row[10]  // Column K
      const transcriptUrl = row[11] // Column L
      const timestamp = new Date(row[0]) // Column A

      if (!reportId) {
        console.log(`[ReportAdapter] Row ${i + 1} has no report ID, skipping`)
        continue
      }

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

    console.log('[ReportAdapter] Report groups found:', {
      totalGroups: reportGroups.size,
      groupsWithFiles: Array.from(reportGroups.values()).filter(g => g.hasFiles).length,
      groupsWithoutFiles: Array.from(reportGroups.values()).filter(g => !g.hasFiles).length,
    })

    // Find the most recent report without files
    let mostRecent: { id: string; timestamp: Date; rowIndices: number[] } | null = null

    for (const [id, group] of reportGroups) {
      if (group.hasFiles) continue
      if (!mostRecent || group.timestamp > mostRecent.timestamp) {
        mostRecent = { id, timestamp: group.timestamp, rowIndices: group.rowIndices }
      }
    }

    if (mostRecent) {
      console.log('[ReportAdapter] Found most recent report without files:', {
        id: mostRecent.id,
        timestamp: mostRecent.timestamp.toISOString(),
        rowIndices: mostRecent.rowIndices,
      })
    } else {
      console.log('[ReportAdapter] No reports found without files')
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
