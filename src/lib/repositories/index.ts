/**
 * Repository Factory
 *
 * Architecture:
 * - Amplify SSR writes to Google Sheets (bookkeeper mirror)
 * - Lambda writes to DynamoDB (system of record) + file uploads
 * - Admin dashboard reads from DynamoDB via Lambda Function URL
 *
 * Multi-tenant: All factory functions accept tenantId to scope
 * data access to the correct Google Sheet / Drive folders.
 */

import type {
  EmployeeRepository,
  JobSiteRepository,
  VendorRepository,
  ReportRepository,
  FileRepository,
  FileAdapterType,
} from './types'

// Per-tenant adapter cache
const employeeRepoCache = new Map<string, EmployeeRepository>()
const jobSiteRepoCache = new Map<string, JobSiteRepository>()
const vendorRepoCache = new Map<string, VendorRepository>()
const reportRepoCache = new Map<string, ReportRepository>()
const fileRepoCache = new Map<string, FileRepository>()

/**
 * Get Employee Repository (Google Sheets) for a specific tenant
 */
export function getEmployeeRepository(tenantId: string = 'parkway'): EmployeeRepository {
  if (!employeeRepoCache.has(tenantId)) {
    const { GoogleSheetsEmployeeRepository } = require('./adapters/google')
    employeeRepoCache.set(tenantId, new GoogleSheetsEmployeeRepository(tenantId))
  }
  return employeeRepoCache.get(tenantId)!
}

/**
 * Get Job Site Repository (Google Sheets) for a specific tenant
 */
export function getJobSiteRepository(tenantId: string = 'parkway'): JobSiteRepository {
  if (!jobSiteRepoCache.has(tenantId)) {
    const { GoogleSheetsJobSiteRepository } = require('./adapters/google')
    jobSiteRepoCache.set(tenantId, new GoogleSheetsJobSiteRepository(tenantId))
  }
  return jobSiteRepoCache.get(tenantId)!
}

/**
 * Get Vendor Repository (Google Sheets) for a specific tenant
 */
export function getVendorRepository(tenantId: string = 'parkway'): VendorRepository {
  if (!vendorRepoCache.has(tenantId)) {
    const { GoogleSheetsVendorRepository } = require('./adapters/google')
    vendorRepoCache.set(tenantId, new GoogleSheetsVendorRepository(tenantId))
  }
  return vendorRepoCache.get(tenantId)!
}

/**
 * Get Report Repository (Google Sheets) for a specific tenant
 * Used by Amplify SSR for report writes.
 * DynamoDB writes happen in the post-call Lambda.
 */
export function getReportRepository(tenantId: string = 'parkway'): ReportRepository {
  if (!reportRepoCache.has(tenantId)) {
    const { GoogleSheetsReportRepository } = require('./adapters/google')
    reportRepoCache.set(tenantId, new GoogleSheetsReportRepository(tenantId))
  }
  return reportRepoCache.get(tenantId)!
}

/**
 * Alias for backwards compatibility
 */
export function getSheetsReportRepository(tenantId: string = 'parkway'): ReportRepository {
  return getReportRepository(tenantId)
}

/**
 * Get File Repository (Google Drive) for a specific tenant
 */
export function getFileRepository(tenantId: string = 'parkway'): FileRepository {
  const adapter = (process.env.FILE_ADAPTER || 'google') as FileAdapterType

  if (adapter === 's3') {
    throw new Error('S3 adapter not yet implemented')
  }

  if (!fileRepoCache.has(tenantId)) {
    const { GoogleDriveFileRepository } = require('./adapters/google')
    fileRepoCache.set(tenantId, new GoogleDriveFileRepository(tenantId))
  }
  return fileRepoCache.get(tenantId)!
}

/**
 * Get all repositories for a specific tenant
 */
export function getRepositories(tenantId: string = 'parkway') {
  return {
    employees: getEmployeeRepository(tenantId),
    jobSites: getJobSiteRepository(tenantId),
    vendors: getVendorRepository(tenantId),
    reports: getReportRepository(tenantId),
    files: getFileRepository(tenantId),
  }
}

// Re-export types
export * from './types'
