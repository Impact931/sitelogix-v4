/**
 * Google Sheets Report Repository Adapter
 *
 * Implements ReportRepository interface using Google Sheets API.
 * Writes to "Main Report Log" and "Payroll Summary" tabs.
 */

import type { DailyReport, EmployeeHours, ReportRepository } from '../../types'
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

    // Write to Main Report Log - one row per employee
    const mainLogRows = report.employees.map((emp) => [
      timestamp,
      report.jobSite || '',
      emp.normalizedName,
      emp.regularHours,
      emp.overtimeHours,
      report.deliveries || '',
      report.incidents || '',
      report.shortages || '',
      report.audioUrl || '',
      report.transcriptUrl || '',
    ])

    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: `'${this.mainLogTab}'!A:J`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: mainLogRows,
      },
    })

    // Write to Payroll Summary - one row per employee
    const payrollRows = report.employees.map((emp) => [
      date,
      emp.normalizedName,
      emp.regularHours,
      emp.overtimeHours,
      emp.totalHours,
    ])

    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: `'${this.payrollTab}'!A:E`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: payrollRows,
      },
    })

    return reportId
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
      range: `'${this.mainLogTab}'!A2:J`,
    })

    const rows = response.data.values || []

    // Group rows by timestamp to reconstruct reports
    const reportMap = new Map<string, DailyReport>()

    for (const row of rows) {
      const timestamp = new Date(row[0])

      if (timestamp < start || timestamp > end) continue

      const key = row[0] // Use timestamp as grouping key

      if (!reportMap.has(key)) {
        reportMap.set(key, {
          id: key,
          submittedAt: timestamp,
          timezone: 'America/New_York', // Default
          jobSite: row[1] || undefined,
          employees: [],
          deliveries: row[5] || undefined,
          incidents: row[6] || undefined,
          shortages: row[7] || undefined,
          audioUrl: row[8] || undefined,
          transcriptUrl: row[9] || undefined,
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
