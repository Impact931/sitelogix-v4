/**
 * Repository Factory
 *
 * Dual-Persistence Architecture:
 * - System of Record: DynamoDB (rich payloads, transcripts, admin dashboard)
 * - User Mirror: Google Sheets (flattened payroll data for bookkeepers)
 *
 * Both are written to simultaneously on every report submission.
 * Employees still sourced from Google Sheets (reference data).
 */

import type {
  EmployeeRepository,
  ReportRepository,
  FileRepository,
  FileAdapterType,
} from './types'

// Lazy-loaded adapters
let googleEmployeeRepo: EmployeeRepository | null = null
let googleReportRepo: ReportRepository | null = null
let googleFileRepo: FileRepository | null = null
let dynamoReportRepo: ReportRepository | null = null

/**
 * Get Employee Repository
 * Always uses Google Sheets (employee reference lives there)
 */
export function getEmployeeRepository(): EmployeeRepository {
  if (!googleEmployeeRepo) {
    const { GoogleSheetsEmployeeRepository } = require('./adapters/google')
    googleEmployeeRepo = new GoogleSheetsEmployeeRepository()
  }
  return googleEmployeeRepo!
}

/**
 * Get Report Repository (System of Record - DynamoDB)
 * This is the primary store for admin dashboard queries.
 */
export function getReportRepository(): ReportRepository {
  if (!dynamoReportRepo) {
    const { DynamoDBReportRepository } = require('./adapters/dynamodb')
    dynamoReportRepo = new DynamoDBReportRepository()
  }
  return dynamoReportRepo!
}

/**
 * Get Google Sheets Report Repository (User Mirror)
 * Used for dual-write to keep bookkeeper's spreadsheet in sync.
 */
export function getSheetsReportRepository(): ReportRepository {
  if (!googleReportRepo) {
    const { GoogleSheetsReportRepository } = require('./adapters/google')
    googleReportRepo = new GoogleSheetsReportRepository()
  }
  return googleReportRepo!
}

/**
 * Get the configured file adapter type
 */
export function getFileAdapterType(): FileAdapterType {
  const adapter = process.env.FILE_ADAPTER || 'google'
  if (adapter !== 'local' && adapter !== 'google' && adapter !== 's3') {
    throw new Error(`Invalid FILE_ADAPTER: ${adapter}. Must be 'local', 'google', or 's3'`)
  }
  return adapter
}

/**
 * Get File Repository
 * Default: Google Drive
 */
export function getFileRepository(): FileRepository {
  const adapter = getFileAdapterType()

  if (adapter === 's3') {
    throw new Error('S3 adapter not yet implemented')
  }

  if (adapter === 'local') {
    throw new Error('Local file adapter not available in dual-write mode')
  }

  if (!googleFileRepo) {
    const { GoogleDriveFileRepository } = require('./adapters/google')
    googleFileRepo = new GoogleDriveFileRepository()
  }
  return googleFileRepo!
}

/**
 * Get all repositories at once
 */
export function getRepositories() {
  return {
    employees: getEmployeeRepository(),
    reports: getReportRepository(),
    sheets: getSheetsReportRepository(),
    files: getFileRepository(),
  }
}

// Re-export types
export * from './types'
