/**
 * Repository Factory
 *
 * Architecture:
 * - Amplify SSR writes to Google Sheets (bookkeeper mirror)
 * - Lambda writes to DynamoDB (system of record) + file uploads
 * - Admin dashboard reads from DynamoDB via Lambda Function URL
 *
 * Amplify SSR cannot use AWS SDK (no credentials in managed compute),
 * so all AWS service calls go through standalone Lambdas.
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

/**
 * Get Employee Repository (Google Sheets)
 */
export function getEmployeeRepository(): EmployeeRepository {
  if (!googleEmployeeRepo) {
    const { GoogleSheetsEmployeeRepository } = require('./adapters/google')
    googleEmployeeRepo = new GoogleSheetsEmployeeRepository()
  }
  return googleEmployeeRepo!
}

/**
 * Get Report Repository (Google Sheets)
 * Used by Amplify SSR for report writes.
 * DynamoDB writes happen in the post-call Lambda.
 */
export function getReportRepository(): ReportRepository {
  if (!googleReportRepo) {
    const { GoogleSheetsReportRepository } = require('./adapters/google')
    googleReportRepo = new GoogleSheetsReportRepository()
  }
  return googleReportRepo!
}

/**
 * Alias for backwards compatibility
 */
export function getSheetsReportRepository(): ReportRepository {
  return getReportRepository()
}

/**
 * Get File Repository (Google Drive)
 */
export function getFileRepository(): FileRepository {
  const adapter = (process.env.FILE_ADAPTER || 'google') as FileAdapterType

  if (adapter === 's3') {
    throw new Error('S3 adapter not yet implemented')
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
    files: getFileRepository(),
  }
}

// Re-export types
export * from './types'
