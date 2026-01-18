/**
 * Google Sheets Employee Repository Adapter
 *
 * Implements EmployeeRepository interface using Google Sheets API.
 * Reads from "Employee Reference" tab.
 */

import type { Employee, EmployeeRepository } from '../../types'
import { findBestMatch } from '../../utils/fuzzy-match'
import { getSheetsClient, GOOGLE_CONFIG } from './auth'

export class GoogleSheetsEmployeeRepository implements EmployeeRepository {
  private sheets = getSheetsClient()
  private spreadsheetId = GOOGLE_CONFIG.SHEETS_ID
  private tabName = GOOGLE_CONFIG.TABS.EMPLOYEES

  async getAllActive(): Promise<Employee[]> {
    const employees = await this.getAll()
    return employees.filter((emp) => emp.active)
  }

  async getAll(): Promise<Employee[]> {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `'${this.tabName}'!A2:B`, // Skip header row
    })

    const rows = response.data.values || []

    return rows.map((row, index) => ({
      id: `emp-${index + 1}`, // Generate ID based on row number
      name: row[0] || '',
      active: row[1]?.toLowerCase() !== 'false' && row[1]?.toLowerCase() !== 'inactive',
    }))
  }

  async findByName(name: string): Promise<Employee | null> {
    const employees = await this.getAll()
    const normalizedSearch = name.toLowerCase().trim()

    return (
      employees.find((emp) => emp.name.toLowerCase().trim() === normalizedSearch) ?? null
    )
  }

  async fuzzyMatch(name: string, threshold = 0.6): Promise<Employee | null> {
    // First try exact match
    const exact = await this.findByName(name)
    if (exact) return exact

    // Fall back to fuzzy matching
    const employees = await this.getAllActive()
    const result = findBestMatch(name, employees, threshold)

    return result?.employee ?? null
  }

  async create(data: Omit<Employee, 'id' | 'createdAt' | 'updatedAt'>): Promise<Employee> {
    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: `'${this.tabName}'!A:B`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[data.name, data.active ? 'Active' : 'Inactive']],
      },
    })

    // Return the created employee with generated ID
    const allEmployees = await this.getAll()
    const created = allEmployees.find((emp) => emp.name === data.name)

    return (
      created ?? {
        id: `emp-${Date.now()}`,
        name: data.name,
        active: data.active,
      }
    )
  }

  async update(id: string, data: Partial<Employee>): Promise<Employee> {
    // For Google Sheets, we need to find the row and update it
    // This is a simplified implementation - in production you might want row tracking
    const employees = await this.getAll()
    const index = employees.findIndex((emp) => emp.id === id)

    if (index === -1) {
      throw new Error(`Employee not found: ${id}`)
    }

    const rowNumber = index + 2 // +2 for header row and 1-based index

    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `'${this.tabName}'!A${rowNumber}:B${rowNumber}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [
          [
            data.name ?? employees[index].name,
            data.active !== undefined
              ? data.active
                ? 'Active'
                : 'Inactive'
              : employees[index].active
                ? 'Active'
                : 'Inactive',
          ],
        ],
      },
    })

    return {
      ...employees[index],
      ...data,
    }
  }
}
