import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { DynamoDBReportRepository } from '@/lib/repositories/adapters/dynamodb/report.adapter'

/**
 * GET /api/admin/reports/[id]
 *
 * Get full report details from DynamoDB including transcript.
 * Verifies the report belongs to the current tenant (returns 404 otherwise).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const h = await headers()
    const tenantId = h.get('x-tenant-slug') || 'parkway'
    const userRole = h.get('x-user-role') || ''

    const { id } = await params
    const repo = new DynamoDBReportRepository(tenantId)

    // Get raw item to include transcript array
    const item = await repo.getRawItem(id)

    if (!item) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    // Tenant isolation: verify report belongs to this tenant (super_admin bypasses)
    if (item.tenantId && item.tenantId !== tenantId && userRole !== 'super_admin') {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    return NextResponse.json({ report: item })
  } catch (error) {
    console.error('[AdminAPI] Error fetching report:', error)
    return NextResponse.json({ error: 'Failed to fetch report' }, { status: 500 })
  }
}
