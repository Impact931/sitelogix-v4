/**
 * Google Workspace Adapters for Production
 *
 * These adapters use Google Sheets and Drive APIs.
 * Used when DATA_ADAPTER=google in environment.
 */

export { GoogleSheetsEmployeeRepository } from './employee.adapter'
export { GoogleSheetsJobSiteRepository } from './jobsite.adapter'
export { GoogleSheetsVendorRepository } from './vendor.adapter'
export { GoogleSheetsReportRepository } from './report.adapter'
export { GoogleDriveFileRepository } from './file.adapter'
