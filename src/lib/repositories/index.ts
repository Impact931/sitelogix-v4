/**
 * Repository Factory
 *
 * Creates repository instances based on environment configuration.
 * This is the main entry point for data operations in the application.
 *
 * Usage:
 *   const employeeRepo = getEmployeeRepository()
 *   const employees = await employeeRepo.getAllActive()
 */

import type {
  EmployeeRepository,
  ReportRepository,
  FileRepository,
  DataAdapterType,
  FileAdapterType,
} from './types'

// Lazy-loaded adapters to avoid importing unused code
let postgresEmployeeRepo: EmployeeRepository | null = null
let postgresReportRepo: ReportRepository | null = null
let localFileRepo: FileRepository | null = null
let googleEmployeeRepo: EmployeeRepository | null = null
let googleReportRepo: ReportRepository | null = null
let googleFileRepo: FileRepository | null = null

/**
 * Get the configured data adapter type
 */
export function getDataAdapterType(): DataAdapterType {
  const adapter = process.env.DATA_ADAPTER || 'google'
  if (adapter !== 'postgres' && adapter !== 'google') {
    throw new Error(`Invalid DATA_ADAPTER: ${adapter}. Must be 'postgres' or 'google'`)
  }
  return adapter
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
 * Get Employee Repository
 *
 * Returns PostgreSQL adapter when DATA_ADAPTER=postgres
 * Returns Google Sheets adapter when DATA_ADAPTER=google
 */
export function getEmployeeRepository(): EmployeeRepository {
  const adapter = getDataAdapterType()

  if (adapter === 'postgres') {
    if (!postgresEmployeeRepo) {
      const { PostgresEmployeeRepository } = require('./adapters/postgres')
      postgresEmployeeRepo = new PostgresEmployeeRepository()
    }
    return postgresEmployeeRepo
  }

  // Default to Google
  if (!googleEmployeeRepo) {
    const { GoogleSheetsEmployeeRepository } = require('./adapters/google')
    googleEmployeeRepo = new GoogleSheetsEmployeeRepository()
  }
  return googleEmployeeRepo
}

/**
 * Get Report Repository
 *
 * Returns PostgreSQL adapter when DATA_ADAPTER=postgres
 * Returns Google Sheets adapter when DATA_ADAPTER=google
 */
export function getReportRepository(): ReportRepository {
  const adapter = getDataAdapterType()

  if (adapter === 'postgres') {
    if (!postgresReportRepo) {
      const { PostgresReportRepository } = require('./adapters/postgres')
      postgresReportRepo = new PostgresReportRepository()
    }
    return postgresReportRepo
  }

  // Default to Google
  if (!googleReportRepo) {
    const { GoogleSheetsReportRepository } = require('./adapters/google')
    googleReportRepo = new GoogleSheetsReportRepository()
  }
  return googleReportRepo
}

/**
 * Get File Repository
 *
 * Returns Local adapter when FILE_ADAPTER=local
 * Returns Google Drive adapter when FILE_ADAPTER=google
 * Returns S3 adapter when FILE_ADAPTER=s3 (not yet implemented)
 */
export function getFileRepository(): FileRepository {
  const adapter = getFileAdapterType()

  if (adapter === 'local') {
    if (!localFileRepo) {
      const { LocalFileRepository } = require('./adapters/postgres')
      localFileRepo = new LocalFileRepository()
    }
    return localFileRepo
  }

  if (adapter === 's3') {
    // TODO: Implement S3 adapter for future SaaS deployment
    throw new Error('S3 adapter not yet implemented')
  }

  // Default to Google Drive
  if (!googleFileRepo) {
    const { GoogleDriveFileRepository } = require('./adapters/google')
    googleFileRepo = new GoogleDriveFileRepository()
  }
  return googleFileRepo
}

/**
 * Get all repositories at once
 * Useful for dependency injection in services
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
