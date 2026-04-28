/**
 * Email Notification Service
 *
 * Sends report submission notifications via AWS SES.
 * Triggered after successful dual-write to DynamoDB + Google Sheets.
 */

import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'

const ses = new SESClient({ region: process.env.DYNAMO_REGION || 'us-east-1' })

interface ReportEmailData {
  reportId: string
  jobSite: string
  employeeCount: number
  totalManHours: number
  hasSafetyIncidents: boolean
  submittedAt: Date
  sheetsUrl: string
  dashboardUrl: string
  tenantName?: string
  fromEmail?: string
  toEmails?: string[]
}

export async function sendReportNotification(data: ReportEmailData): Promise<void> {
  const FROM_EMAIL = data.fromEmail || process.env.SES_FROM_EMAIL || 'jayson@impactconsulting931.com'
  const TO_EMAILS = data.toEmails || (process.env.SES_TO_EMAILS || 'jayson@jhr-photography.com').split(',')
  const tenantLabel = data.tenantName || 'Parkway Construction'

  const subject = `SiteLogix Report: ${data.jobSite} — ${data.employeeCount} employees, ${data.totalManHours} hrs`

  const safetyBadge = data.hasSafetyIncidents
    ? '<span style="background:#dc2626;color:white;padding:2px 8px;border-radius:4px;font-size:12px;">SAFETY INCIDENT</span>'
    : '<span style="background:#16a34a;color:white;padding:2px 8px;border-radius:4px;font-size:12px;">ALL CLEAR</span>'

  const timestamp = data.submittedAt.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    dateStyle: 'long',
    timeStyle: 'short',
  })

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:0;background:#f5f5f5;">
  <div style="max-width:600px;margin:0 auto;background:white;border-radius:8px;overflow:hidden;margin-top:20px;">
    <div style="background:#1e3a5f;color:white;padding:20px 24px;">
      <h1 style="margin:0;font-size:20px;">SiteLogix Daily Report</h1>
      <p style="margin:4px 0 0;opacity:0.8;font-size:14px;">${timestamp}</p>
    </div>
    <div style="padding:24px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:8px 0;color:#666;width:140px;">Job Site</td>
          <td style="padding:8px 0;font-weight:600;">${data.jobSite}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#666;">Employees</td>
          <td style="padding:8px 0;font-weight:600;">${data.employeeCount}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#666;">Total Man-Hours</td>
          <td style="padding:8px 0;font-weight:600;">${data.totalManHours}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#666;">Safety Status</td>
          <td style="padding:8px 0;">${safetyBadge}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#666;">Report ID</td>
          <td style="padding:8px 0;font-family:monospace;font-size:13px;">${data.reportId}</td>
        </tr>
      </table>

      <div style="margin-top:24px;display:flex;gap:12px;">
        <a href="${data.sheetsUrl}" style="display:inline-block;background:#16a34a;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;margin-right:12px;">
          View Google Sheet
        </a>
        <a href="${data.dashboardUrl}" style="display:inline-block;background:#1e3a5f;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">
          View Admin Dashboard
        </a>
      </div>
    </div>
    <div style="padding:16px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;">
      Sent by SiteLogix v4 • ${tenantLabel}
    </div>
  </div>
</body>
</html>`

  const textBody = `SiteLogix Daily Report
${timestamp}

Job Site: ${data.jobSite}
Employees: ${data.employeeCount}
Total Man-Hours: ${data.totalManHours}
Safety: ${data.hasSafetyIncidents ? 'INCIDENT REPORTED' : 'All Clear'}
Report ID: ${data.reportId}

Google Sheet: ${data.sheetsUrl}
Admin Dashboard: ${data.dashboardUrl}`

  try {
    await ses.send(
      new SendEmailCommand({
        Source: FROM_EMAIL,
        Destination: {
          ToAddresses: TO_EMAILS,
        },
        Message: {
          Subject: { Data: subject },
          Body: {
            Html: { Data: html },
            Text: { Data: textBody },
          },
        },
      })
    )

    console.log('[Email] Notification sent for report:', data.reportId)
  } catch (error) {
    console.error('[Email] Failed to send notification:', error)
    // Don't throw - email failure should not block report submission
  }
}
