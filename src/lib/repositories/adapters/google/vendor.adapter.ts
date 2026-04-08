/**
 * Google Sheets Vendor Repository Adapter
 *
 * Reads from "Suppliers" tab for fuzzy matching vendor/supplier names
 * reported by foremen against the company's known supplier list.
 *
 * Tab layout: A = Supplier ID, B = Company Name, C = Contact Name, D = Phone, E = Email
 */

import type { Vendor, VendorRepository } from '../../types'
import { getSheetsClient, GOOGLE_CONFIG } from './auth'
import Fuse, { IFuseOptions } from 'fuse.js'

const FUSE_OPTIONS: IFuseOptions<Vendor> = {
  keys: ['name'],
  threshold: 0.4,
  distance: 100,
  includeScore: true,
  shouldSort: true,
  minMatchCharLength: 2,
}

export class GoogleSheetsVendorRepository implements VendorRepository {
  private sheets = getSheetsClient()
  private spreadsheetId = GOOGLE_CONFIG.SHEETS_ID
  private tabName = GOOGLE_CONFIG.TABS.VENDORS

  async getAllActive(): Promise<Vendor[]> {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `'${this.tabName}'!A2:E`,
    })

    const rows = response.data.values || []

    return rows
      .map((row) => ({
        id: row[0] || '',       // Column A: Supplier ID
        name: row[1] || '',     // Column B: Company Name
        active: true,           // No status column — all listed suppliers are active
      }))
      .filter((v) => v.name.trim() !== '')
  }

  async fuzzyMatch(name: string, threshold = 0.5): Promise<Vendor | null> {
    const vendors = await this.getAllActive()

    // Try exact match first (case-insensitive)
    const normalizedSearch = name.toLowerCase().trim()
    const exact = vendors.find((v) => v.name.toLowerCase().trim() === normalizedSearch)
    if (exact) return exact

    // Fuzzy match
    const fuse = new Fuse(vendors, FUSE_OPTIONS)
    const results = fuse.search(name)

    if (results.length === 0) return null

    const best = results[0]
    const score = best.score !== undefined ? 1 - best.score : 0

    if (score < threshold) return null

    return best.item
  }
}
