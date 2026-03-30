import { NextRequest, NextResponse } from 'next/server'
import { DynamoDBReportRepository } from '@/lib/repositories/adapters/dynamodb/report.adapter'

/**
 * GET /api/admin/reports/[id]
 *
 * Get full report details from DynamoDB including transcript
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const repo = new DynamoDBReportRepository()

    // Get raw item to include transcript array
    const item = await repo.getRawItem(id)

    if (!item) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    return NextResponse.json({ report: item })
  } catch (error) {
    console.error('[AdminAPI] Error fetching report:', error)
    return NextResponse.json({ error: 'Failed to fetch report' }, { status: 500 })
  }
}
