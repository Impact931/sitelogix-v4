/**
 * Setup Google Sheet + Drive folders for a new tenant
 *
 * Creates:
 * 1. Google Sheet "SiteLogix - {Tenant Name}" with 3 standard tabs
 * 2. Google Drive folder "SiteLogix - {Tenant Name}" with Audio and Transcripts subfolders
 *
 * Usage: npx tsx scripts/setup-tenant-sheets.ts "JR Construction Co"
 *
 * Outputs the IDs to add to tenant config / env vars.
 */

import { google } from 'googleapis'
import { OAuth2Client } from 'google-auth-library'

const TENANT_NAME = process.argv[2]

if (!TENANT_NAME) {
  console.error('Usage: npx tsx scripts/setup-tenant-sheets.ts "Tenant Name"')
  process.exit(1)
}

function getAuth(): OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const refreshToken = process.env.Google_Refresh_Token

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing Google OAuth credentials in environment')
  }

  const auth = new google.auth.OAuth2(clientId, clientSecret)
  auth.setCredentials({ refresh_token: refreshToken })
  return auth
}

async function setup() {
  console.log(`Setting up Google Workspace for tenant: ${TENANT_NAME}\n`)

  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })
  const drive = google.drive({ version: 'v3', auth })

  // 1. Create Google Sheet
  console.log('Creating Google Sheet...')
  const sheet = await sheets.spreadsheets.create({
    requestBody: {
      properties: {
        title: `SiteLogix - ${TENANT_NAME}`,
      },
      sheets: [
        {
          properties: { title: 'Employee Roster', index: 0 },
          data: [{
            startRow: 0,
            startColumn: 0,
            rowData: [{
              values: [
                { userEnteredValue: { stringValue: 'Name' } },
                { userEnteredValue: { stringValue: 'Status' } },
              ],
            }],
          }],
        },
        {
          properties: { title: 'Main Report Log', index: 1 },
          data: [{
            startRow: 0,
            startColumn: 0,
            rowData: [{
              values: [
                'Timestamp', 'Job Site', 'Employee Name', 'Regular Hours', 'OT Hours',
                'Deliveries', 'Equipment', 'Safety', 'Weather', 'Shortages',
                'Audio Link', 'Transcript Link', 'Delays', 'Notes',
                'Subcontractors', 'Work Performed', 'Report ID',
              ].map(h => ({ userEnteredValue: { stringValue: h } })),
            }],
          }],
        },
        {
          properties: { title: 'Payroll Summary', index: 2 },
          data: [{
            startRow: 0,
            startColumn: 0,
            rowData: [{
              values: [
                'Date', 'Job Site', 'Employee', 'Regular Hours', 'OT Hours', 'Total Hours',
              ].map(h => ({ userEnteredValue: { stringValue: h } })),
            }],
          }],
        },
      ],
    },
  })

  const sheetsId = sheet.data.spreadsheetId!
  console.log(`  Sheet ID: ${sheetsId}`)
  console.log(`  URL: https://docs.google.com/spreadsheets/d/${sheetsId}`)

  // 2. Create Drive folder structure
  console.log('\nCreating Drive folders...')

  const parentFolder = await drive.files.create({
    requestBody: {
      name: `SiteLogix - ${TENANT_NAME}`,
      mimeType: 'application/vnd.google-apps.folder',
    },
    fields: 'id',
  })
  const parentFolderId = parentFolder.data.id!
  console.log(`  Parent Folder ID: ${parentFolderId}`)

  const audioFolder = await drive.files.create({
    requestBody: {
      name: 'Audio Recordings',
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId],
    },
    fields: 'id',
  })
  const audioFolderId = audioFolder.data.id!
  console.log(`  Audio Folder ID: ${audioFolderId}`)

  const transcriptsFolder = await drive.files.create({
    requestBody: {
      name: 'Transcripts',
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId],
    },
    fields: 'id',
  })
  const transcriptsFolderId = transcriptsFolder.data.id!
  console.log(`  Transcripts Folder ID: ${transcriptsFolderId}`)

  // Output summary
  console.log('\n========================================')
  console.log('TENANT SETUP COMPLETE')
  console.log('========================================')
  console.log(`\nAdd these to your tenant config or Amplify env vars:\n`)
  console.log(`SHEETS_ID=${sheetsId}`)
  console.log(`DRIVE_FOLDER_ID=${parentFolderId}`)
  console.log(`DRIVE_AUDIO_FOLDER_ID=${audioFolderId}`)
  console.log(`DRIVE_TRANSCRIPTS_FOLDER_ID=${transcriptsFolderId}`)
}

setup().catch((err) => {
  console.error('Setup failed:', err)
  process.exit(1)
})
