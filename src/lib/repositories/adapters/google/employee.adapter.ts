/**
 * Google Sheets Employee Repository Adapter
 *
 * Implements EmployeeRepository interface using Google Sheets API.
 * Reads from "Employee Reference" tab.
 */

import type { Employee, EmployeeRepository } from '../../types'
import { findBestMatch, levenshteinDistance } from '../../utils/fuzzy-match'
import { getSheetsClient, getGoogleConfig } from './auth'

export class GoogleSheetsEmployeeRepository implements EmployeeRepository {
  private sheets = getSheetsClient()
  private spreadsheetId: string
  private tabName: string

  constructor(tenantId: string = 'parkway') {
    const config = getGoogleConfig(tenantId)
    this.spreadsheetId = config.SHEETS_ID
    this.tabName = config.TABS.EMPLOYEES
  }

  async getAllActive(): Promise<Employee[]> {
    const employees = await this.getAll()
    return employees.filter((emp) => emp.active)
  }

  async getAll(): Promise<Employee[]> {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `'${this.tabName}'!A2:D`, // A: ID, B: Full Name, C: Go By Name, D: Position
    })

    const rows = response.data.values || []

    return rows
      .filter((row) => row[0] && row[1]) // Must have ID and name
      .map((row) => ({
        id: row[0] || '',              // Column A: Employee ID
        name: row[1]?.trim() || '',    // Column B: Full Name
        active: true,                   // All listed employees are active
        goByName: row[2]?.trim() || undefined, // Column C: Go By Name (nickname)
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
    // First try exact match on full name
    const exact = await this.findByName(name)
    if (exact) return exact

    const employees = await this.getAllActive()
    const spoken = name.toLowerCase().trim()

    // Check "Go By Name" (nickname) — exact match
    // This handles "Jason" matching roster entry with goByName "Jason" → "Jayson Rivas"
    const goByMatch = employees.find(
      (e) => e.goByName && e.goByName.toLowerCase().trim() === spoken
    )
    if (goByMatch) return goByMatch

    // Fuzzy match on goByName (1-2 letters off)
    const spokenFirst = spoken.split(/\s+/)[0]
    if (!spoken.includes(' ')) {
      let bestGoByMatch: Employee | null = null
      let bestGoByDist = Infinity
      for (const emp of employees) {
        if (!emp.goByName) continue
        const goBy = emp.goByName.toLowerCase().trim()
        const dist = levenshteinDistance(spokenFirst, goBy)
        if (dist <= 2 && dist < bestGoByDist) {
          bestGoByDist = dist
          bestGoByMatch = emp
        }
      }
      if (bestGoByMatch) return bestGoByMatch
    }

    // Try Fuse.js fuzzy matching on full name
    const result = findBestMatch(name, employees, threshold)
    if (result) return result.employee

    // First-name-only fallback on full name
    if (!spoken.includes(' ')) {
      const firstNameMatches = employees.filter(
        (e) => e.name.toLowerCase().split(/\s+/)[0] === spokenFirst
      )
      if (firstNameMatches.length === 1) return firstNameMatches[0]

      // Fuzzy first-name match (1-2 letters off)
      let bestMatch: Employee | null = null
      let bestDist = Infinity
      for (const emp of employees) {
        const rosterFirst = emp.name.toLowerCase().split(/\s+/)[0]
        const dist = levenshteinDistance(spokenFirst, rosterFirst)
        if (dist <= 2 && dist < bestDist) {
          bestDist = dist
          bestMatch = emp
        }
      }
      if (bestMatch) return bestMatch
    }

    return null
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
