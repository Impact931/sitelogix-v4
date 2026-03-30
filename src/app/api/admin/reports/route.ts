import { NextRequest, NextResponse } from 'next/server'
import { getReportRepository } from '@/lib/repositories'

/**
 * GET /api/admin/reports
 *
 * List recent reports from DynamoDB (System of Record)
 * Supports ?limit= and ?site= query params
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = Number(searchParams.get('limit')) || 20
    const site = searchParams.get('site')

    const repo = getReportRepository()

    let reports
    if (site) {
      const { DynamoDBReportRepository } = await import('@/lib/repositories/adapters/dynamodb/report.adapter')
      const dynamoRepo = repo as InstanceType<typeof DynamoDBReportRepository>
      reports = await dynamoRepo.getReportsBySite(site, limit)
    } else {
      reports = await repo.getRecentReports(limit)
    }

    // Calculate summary stats
    const totalEmployees = reports.reduce((sum, r) => sum + r.employees.length, 0)
    const totalManHours = reports.reduce(
      (sum, r) => sum + r.employees.reduce((h, e) => h + e.totalHours, 0),
      0
    )
    const incidentCount = reports.reduce(
      (sum, r) => sum + (r.safety?.filter((s) => s.type !== 'positive').length || 0),
      0
    )

    return NextResponse.json({
      reports: reports.map((r) => ({
        id: r.id,
        submittedAt: r.submittedAt,
        jobSite: r.jobSite,
        employeeCount: r.employees.length,
        totalHours: r.employees.reduce((h, e) => h + e.totalHours, 0),
        hasSafetyIncident: r.safety?.some((s) => s.type !== 'positive') || false,
        hasTranscript: !!r.transcriptUrl,
        hasAudio: !!r.audioUrl,
      })),
      summary: {
        reportCount: reports.length,
        totalEmployees,
        totalManHours: Math.round(totalManHours * 100) / 100,
        incidentCount,
      },
    })
  } catch (error) {
    console.error('[AdminAPI] Error fetching reports:', error)
    return NextResponse.json({ error: 'Failed to fetch reports' }, { status: 500 })
  }
}
