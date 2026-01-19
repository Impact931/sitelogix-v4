/**
 * Google API Authentication
 *
 * Handles OAuth2 authentication for Google Sheets and Drive APIs.
 * Uses refresh token to get new access tokens automatically.
 */

import { google } from 'googleapis'
import { OAuth2Client } from 'google-auth-library'

let oauth2Client: OAuth2Client | null = null

/**
 * Get authenticated OAuth2 client for Google APIs
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
 * Configuration for Google Workspace resources
 */
export const GOOGLE_CONFIG = {
  // Parkway Reporting Database
  SHEETS_ID: process.env.GOOGLE_SHEETS_ID || '1lb8nmFjvKdWmoqSLaowEKWEzGzNUPw7CuTTZ7k1FIg4',

  // Tab names in the spreadsheet
  TABS: {
    EMPLOYEES: 'Employee Reference',
    MAIN_LOG: 'Main Report Log',
    PAYROLL_SUMMARY: 'Payroll Summary',
  },

  // Parkway Database Drive Folder
  DRIVE_FOLDER_ID: process.env.GOOGLE_DRIVE_FOLDER_ID || '1UFwgLhlBdgdK8As2EmzW-nHNreHsYeqm',

  // Specific subfolder IDs (pre-created in Google Drive)
  DRIVE_FOLDERS: {
    AUDIO: process.env.GOOGLE_DRIVE_AUDIO_FOLDER_ID || '1QfnjfPbsGCJDSDH04o7nqwl0TiRosXD7',
    TRANSCRIPTS: process.env.GOOGLE_DRIVE_TRANSCRIPTS_FOLDER_ID || '1mTBMlD7ksiJSu9Qh-vnjjPB6hGIiaArf',
  },
}
