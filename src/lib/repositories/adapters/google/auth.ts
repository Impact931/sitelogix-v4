/**
 * Google API Authentication
 *
 * Handles OAuth2 authentication for Google Sheets and Drive APIs.
 * Uses refresh token to get new access tokens automatically.
 * Supports multi-tenant: each tenant has its own Sheet/Drive IDs.
 */

import { google } from 'googleapis'
import { OAuth2Client } from 'google-auth-library'
import { getTenantConfig } from '@/lib/tenant/config'

let oauth2Client: OAuth2Client | null = null

/**
 * Get authenticated OAuth2 client for Google APIs
 * Currently shared across all tenants (Impact Consulting creds)
 */
export function getGoogleAuth(): OAuth2Client {
  if (oauth2Client) {
    return oauth2Client
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const refreshToken = process.env.Google_Refresh_Token

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Missing Google OAuth credentials. Ensure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and Google_Refresh_Token are set.'
    )
  }

  oauth2Client = new google.auth.OAuth2(clientId, clientSecret)

  oauth2Client.setCredentials({
    refresh_token: refreshToken,
  })

  return oauth2Client
}

/**
 * Get Google Sheets API client
 */
export function getSheetsClient() {
  const auth = getGoogleAuth()
  return google.sheets({ version: 'v4', auth })
}

/**
 * Get Google Drive API client
 */
export function getDriveClient() {
  const auth = getGoogleAuth()
  return google.drive({ version: 'v3', auth })
}

/**
 * Tab names in the spreadsheet (standardized across all tenants)
 */
export const GOOGLE_TABS = {
  EMPLOYEES: 'Employee Roster',
  JOB_SITES: 'Project Sites',
  VENDORS: 'Suppliers',
  MAIN_LOG: 'Main Report Log',
  PAYROLL_SUMMARY: 'Payroll Summary',
}

/**
 * Get tenant-specific Google configuration
 */
export function getGoogleConfig(tenantId: string) {
  const tenant = getTenantConfig(tenantId)
  if (!tenant) {
    throw new Error(`Unknown tenant: ${tenantId}`)
  }

  return {
    SHEETS_ID: tenant.googleSheetsId,
    TABS: GOOGLE_TABS,
    DRIVE_FOLDER_ID: tenant.googleDriveFolderId,
    DRIVE_FOLDERS: {
      AUDIO: tenant.googleDriveAudioFolderId,
      TRANSCRIPTS: tenant.googleDriveTranscriptsFolderId,
    },
  }
}

/**
 * Legacy: default config for backwards compatibility
 * @deprecated Use getGoogleConfig(tenantId) instead
 */
export const GOOGLE_CONFIG = {
  SHEETS_ID: process.env.GOOGLE_SHEETS_ID || '1lb8nmFjvKdWmoqSLaowEKWEzGzNUPw7CuTTZ7k1FIg4',
  TABS: GOOGLE_TABS,
  DRIVE_FOLDER_ID: process.env.GOOGLE_DRIVE_FOLDER_ID || '1UFwgLhlBdgdK8As2EmzW-nHNreHsYeqm',
  DRIVE_FOLDERS: {
    AUDIO: process.env.GOOGLE_DRIVE_AUDIO_FOLDER_ID || '1QfnjfPbsGCJDSDH04o7nqwl0TiRosXD7',
    TRANSCRIPTS: process.env.GOOGLE_DRIVE_TRANSCRIPTS_FOLDER_ID || '1mTBMlD7ksiJSu9Qh-vnjjPB6hGIiaArf',
  },
}
