/**
 * Seed DynamoDB from Google Sheets
 *
 * Reads existing data from Google Sheets (Main Report Log + Employee Reference)
 * and writes it to DynamoDB as the System of Record.
 *
 * Usage: npx tsx scripts/seed-dynamodb.ts
 *
 * Requires env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, Google_Refresh_Token
 */

import { google } from 'googleapis'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb'

// Config
const SHEETS_ID = process.env.GOOGLE_SHEETS_ID || '1lb8nmFjvKdWmoqSLaowEKWEzGzNUPw7CuTTZ7k1FIg4'
const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'sitelogix-v4-reports'
const REGION = process.env.DYNAMO_REGION || 'us-east-1'

// Google Auth
function getGoogleAuth() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const refreshToken = process.env.Google_Refresh_Token

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing Google OAuth credentials in env vars')
  }

  const auth = new google.auth.OAuth2(clientId, clientSecret)
  auth.setCredentials({ refresh_token: refreshToken })
  return auth
}

// DynamoDB client
const dynamoClient = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: REGION }),
  { marshallOptions: { removeUndefinedValues: true } }
)

async function main() {
  console.log('Starting DynamoDB seed from Google Sheets...\n')

  const auth = getGoogleAuth()
  const sheets = google.sheets({ version: 'v4', auth })

  // ─── Read Employee Reference ───
  console.log('Reading Employee Reference tab...')
  const empResponse = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEETS_ID,
    range: "'Employee Roster'!A2:B",
  })
  const empRows = empResponse.data.values || []
  console.log(`  Found ${empRows.length} employees`)

  for (const row of empRows) {
    console.log(`  - ${row[0]} (${row[1] || 'Active'})`)
  }

  // ─── Read Main Report Log ───
  console.log('\nReading Main Report Log tab...')
  const reportResponse = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEETS_ID,
    range: "'Main Report Log'!A2:Q",
  })
  const reportRows = reportResponse.data.values || []
  console.log(`  Found ${reportRows.length} report rows`)

  if (reportRows.length === 0) {
    console.log('No reports to seed. Done.')
    return
  }

  // Group rows by Report ID (column Q, index 16)
  const reportGroups = new Map<string, typeof reportRows>()

  for (const row of reportRows) {
    const reportId = row[16] || `RPT-SEED-${row[0]}`
    if (!reportGroups.has(reportId)) {
      reportGroups.set(reportId, [])
    }
    reportGroups.get(reportId)!.push(row)
  }

  console.log(`  Grouped into ${reportGroups.size} reports\n`)

  // ─── Write to DynamoDB ───
  let seeded = 0
  let errors = 0

  for (const [reportId, rows] of reportGroups) {
    const firstRow = rows[0]

    // Parse timestamp
    let submittedAt: string
    try {
      submittedAt = new Date(firstRow[0]).toISOString()
    } catch {
      submittedAt = new Date().toISOString()
    }

    // Build employees array from all rows in this group
    const employees = rows.map((row) => ({
      name: row[2] || 'Unknown',
      normalizedName: row[2] || 'Unknown',
      regularHours: Number(row[3]) || 0,
      overtimeHours: Number(row[4]) || 0,
      totalHours: (Number(row[3]) || 0) + (Number(row[4]) || 0),
    }))

    // Column mapping (from report.adapter.ts):
    // A:0 Timestamp | B:1 Job Site | C:2 Employee | D:3 Reg Hours | E:4 OT Hours
    // F:5 Deliveries | G:6 Equipment | H:7 Safety | I:8 Weather | J:9 Shortages
    // K:10 Audio Link | L:11 Transcript Link | M:12 Delays | N:13 Notes
    // O:14 Subcontractors | P:15 Work Performed | Q:16 Report ID

    const item = {
      reportId,
      entityType: 'REPORT',
      submittedAt,
      jobSite: firstRow[1] || 'Unknown',
      timezone: 'America/New_York',

      employees,

      // Text fields from Sheets (already human-readable, store as-is)
      deliveriesText: firstRow[5] || undefined,
      equipmentText: firstRow[6] || undefined,
      safetyText: firstRow[7] || undefined,
      weatherConditions: firstRow[8] || undefined,
      shortages: firstRow[9] || undefined,
      audioUrl: firstRow[10] || undefined,
      transcriptUrl: firstRow[11] || undefined,
      delaysText: firstRow[12] || undefined,
      notes: firstRow[13] || undefined,
      subcontractorsText: firstRow[14] || undefined,
      workPerformedText: firstRow[15] || undefined,

      // Metadata
      createdAt: submittedAt,
      updatedAt: new Date().toISOString(),
      seedSource: 'google-sheets',
    }

    try {
      await dynamoClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: item,
        })
      )
      seeded++
      console.log(`  ✓ ${reportId} — ${item.jobSite} — ${employees.length} employees`)
    } catch (err) {
      errors++
      console.error(`  ✗ ${reportId} — ${err}`)
    }
  }

  console.log(`\n═══════════════════════════════════`)
  console.log(`Seed complete: ${seeded} reports written, ${errors} errors`)
  console.log(`Table: ${TABLE_NAME}`)
  console.log(`═══════════════════════════════════`)
}

main().catch(console.error)
