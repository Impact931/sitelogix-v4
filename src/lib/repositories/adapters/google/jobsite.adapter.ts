/**
 * Google Sheets Job Site Repository Adapter
 *
 * Reads from "Project Sites" tab for fuzzy matching job site names
 * reported by foremen against the company's official project list.
 *
 * Tab layout: A = Project ID, B = Project Name, C = Location, D = Address, E = Type
 */

import type { JobSite, JobSiteRepository } from '../../types'
import { getSheetsClient, GOOGLE_CONFIG } from './auth'
import Fuse, { IFuseOptions } from 'fuse.js'

const FUSE_OPTIONS: IFuseOptions<JobSite> = {
  keys: ['name'],
  threshold: 0.4,
  distance: 100,
  includeScore: true,
  shouldSort: true,
  minMatchCharLength: 2,
}

export class GoogleSheetsJobSiteRepository implements JobSiteRepository {
  private sheets = getSheetsClient()
  private spreadsheetId = GOOGLE_CONFIG.SHEETS_ID
  private tabName = GOOGLE_CONFIG.TABS.JOB_SITES

  async getAllActive(): Promise<JobSite[]> {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `'${this.tabName}'!A2:E`,
    })

    const rows = response.data.values || []

    return rows
      .map((row) => ({
        id: row[0] || '',       // Column A: Project ID
        name: row[1] || '',     // Column B: Project Name
        active: true,           // No status column — all listed sites are active
      }))
      .filter((site) => site.name.trim() !== '')
  }

  async fuzzyMatch(name: string, threshold = 0.5): Promise<JobSite | null> {
    const sites = await this.getAllActive()

    // Try exact match first (case-insensitive)
    const normalizedSearch = name.toLowerCase().trim()
    const exact = sites.find((s) => s.name.toLowerCase().trim() === normalizedSearch)
    if (exact) return exact

    // Fuzzy match
    const fuse = new Fuse(sites, FUSE_OPTIONS)
    const results = fuse.search(name)

    if (results.length === 0) return null

    const best = results[0]
    const score = best.score !== undefined ? 1 - best.score : 0

    if (score < threshold) return null

    return best.item
  }
}
