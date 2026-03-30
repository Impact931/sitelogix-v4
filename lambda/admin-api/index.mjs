/**
 * Admin API Lambda
 *
 * Handles DynamoDB reads for the admin dashboard.
 * Deployed with a Function URL (no API Gateway needed).
 *
 * Routes:
 *   GET /reports          - List recent reports
 *   GET /reports/{id}     - Get full report detail with transcript
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb'

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'sitelogix-v4-reports'

const client = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: 'us-east-1' }),
  { marshallOptions: { removeUndefinedValues: true } }
)

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  }
}

function respond(statusCode, body) {
  return {
    statusCode,
    headers: corsHeaders(),
    body: JSON.stringify(body),
  }
}

async function getRecentReports(limit = 20) {
  const result = await client.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'byDate',
      KeyConditionExpression: 'entityType = :et',
      ExpressionAttributeValues: { ':et': 'REPORT' },
      ScanIndexForward: false,
      Limit: limit,
    })
  )
  return result.Items || []
}

async function getReportById(id) {
  const result = await client.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { reportId: id },
    })
  )
  return result.Item || null
}

export const handler = async (event) => {
  console.log('[AdminAPI]', event.requestContext?.http?.method, event.rawPath)

  // Handle CORS preflight
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return respond(200, {})
  }

  const path = event.rawPath || ''
  const params = event.queryStringParameters || {}

  try {
    // GET /reports
    if (path === '/reports' || path === '/') {
      const limit = Number(params.limit) || 20
      const items = await getRecentReports(limit)

      const reports = items.map((r) => ({
        id: r.reportId,
        submittedAt: r.submittedAt,
        jobSite: r.jobSite,
        employeeCount: r.employees?.length || 0,
        totalHours: (r.employees || []).reduce((h, e) => h + (e.totalHours || 0), 0),
        hasSafetyIncident: (r.safety || []).some((s) => s.type !== 'positive'),
        hasTranscript: !!r.transcriptUrl,
        hasAudio: !!r.audioUrl,
      }))

      const totalEmployees = items.reduce((sum, r) => sum + (r.employees?.length || 0), 0)
      const totalManHours = items.reduce(
        (sum, r) => sum + (r.employees || []).reduce((h, e) => h + (e.totalHours || 0), 0),
        0
      )
      const incidentCount = items.reduce(
        (sum, r) => sum + (r.safety || []).filter((s) => s.type !== 'positive').length,
        0
      )

      return respond(200, {
        reports,
        summary: {
          reportCount: reports.length,
          totalEmployees,
          totalManHours: Math.round(totalManHours * 100) / 100,
          incidentCount,
        },
      })
    }

    // GET /reports/{id}
    const reportMatch = path.match(/^\/reports\/(.+)$/)
    if (reportMatch) {
      const item = await getReportById(reportMatch[1])
      if (!item) return respond(404, { error: 'Report not found' })
      return respond(200, { report: item })
    }

    return respond(404, { error: 'Not found' })
  } catch (error) {
    console.error('[AdminAPI] Error:', error)
    return respond(500, { error: error.message })
  }
}
