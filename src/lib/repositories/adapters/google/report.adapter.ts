/**
 * Google Sheets Report Repository Adapter
 *
 * Implements ReportRepository interface using Google Sheets API.
 * Writes to "Main Report Log" and "Payroll Summary" tabs.
 *
 * Main Report Log Columns:
 * A: Timestamp | B: Job Site | C: Employee | D: Regular Hours | E: Overtime Hours
 * F: Deliveries (JSON) | G: Equipment (JSON) | H: Subcontractors (JSON)
 * I: Weather | J: Weather Impact | K: Safety (JSON) | L: Delays (JSON)
 * M: Work Performed (JSON) | N: Shortages | O: Notes
 * P: Audio URL | Q: Transcript URL | R: Report ID
 */

import type { DailyReport, ReportRepository } from '../../types'
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

    // Serialize arrays to JSON for storage
    const deliveriesJson = this.serializeArray(report.deliveries)
    const equipmentJson = this.serializeArray(report.equipment)
    const subcontractorsJson = this.serializeArray(report.subcontractors)
    const safetyJson = this.serializeArray(report.safety)
    const delaysJson = this.serializeArray(report.delays)
    const workPerformedJson = this.serializeArray(report.workPerformed)

    // Write to Main Report Log - one row per employee
    // Report-level data is repeated for each employee row
    const mainLogRows = report.employees.map((emp) => [
      timestamp,                          // A: Timestamp
      report.jobSite || '',               // B: Job Site
      emp.normalizedName,                 // C: Employee Name
      emp.regularHours,                   // D: Regular Hours
      emp.overtimeHours,                  // E: Overtime Hours
      deliveriesJson,                     // F: Deliveries (JSON)
      equipmentJson,                      // G: Equipment (JSON)
      subcontractorsJson,                 // H: Subcontractors (JSON)
      report.weatherConditions || '',     // I: Weather Conditions
      report.weatherImpact || '',         // J: Weather Impact
      safetyJson,                         // K: Safety (JSON)
      delaysJson,                         // L: Delays (JSON)
      workPerformedJson,                  // M: Work Performed (JSON)
      report.shortages || '',             // N: Shortages
      report.notes || '',                 // O: Notes
      report.audioUrl || '',              // P: Audio URL
      report.transcriptUrl || '',         // Q: Transcript URL
      reportId,                           // R: Report ID
    ])

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

  /**
   * Serialize an array to JSON string for storage
   * Returns empty string if array is undefined or empty
   */
  private serializeArray<T>(arr: T[] | undefined): string {
    if (!arr || arr.length === 0) return ''
    return JSON.stringify(arr)
  }

  /**
   * Parse a JSON string back to an array
   * Returns empty array if string is empty or invalid
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
