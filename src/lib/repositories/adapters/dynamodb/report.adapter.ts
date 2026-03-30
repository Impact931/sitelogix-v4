/**
 * DynamoDB Report Repository Adapter
 *
 * System of Record for SiteLogix-v4.
 * Stores the full report payload including transcript,
 * employee data, and all metadata in a single item per report.
 */

import {
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb'
import type {
  DailyReport,
  ReportRepository,
  ElevenLabsTranscriptEntry,
} from '../../types'
import { getDynamoClient, DYNAMO_CONFIG } from './client'

export interface DynamoReportItem {
  reportId: string
  entityType: 'REPORT'
  submittedAt: string
  jobSite: string
  timezone: string

  // People
  employees: Array<{
    name: string
    normalizedName: string
    regularHours: number
    overtimeHours: number
    totalHours: number
  }>
  subcontractors?: Array<{
    company: string
    normalizedCompany: string
    trade?: string
    headcount?: number
    workPerformed?: string
  }>

  // Materials & Equipment
  deliveries?: Array<{
    vendor: string
    normalizedVendor: string
    material: string
    quantity?: string
    notes?: string
  }>
  equipment?: Array<{
    name: string
    hours?: number
    notes?: string
  }>
  shortages?: string

  // Conditions
  weatherConditions?: string
  weatherImpact?: string

  // Safety & Issues
  safety?: Array<{
    type: string
    description: string
    actionTaken?: string
  }>
  delays?: Array<{
    reason: string
    duration?: string
    impact?: string
  }>

  // Work Summary
  workPerformed?: Array<{
    description: string
    area?: string
  }>
  notes?: string

  // Files
  audioUrl?: string
  transcriptUrl?: string

  // Full transcript (rich data for admin dashboard)
  transcript?: ElevenLabsTranscriptEntry[]
  transcriptText?: string

  // Metadata
  conversationId?: string
  callDurationSecs?: number
  createdAt: string
  updatedAt: string
}

export class DynamoDBReportRepository implements ReportRepository {
  private client = getDynamoClient()
  private tableName = DYNAMO_CONFIG.TABLE_NAME

  async saveReport(report: Omit<DailyReport, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const reportId = `RPT-${Date.now()}`
    const now = new Date().toISOString()

    const item: DynamoReportItem = {
      reportId,
      entityType: 'REPORT',
      submittedAt: report.submittedAt.toISOString(),
      jobSite: report.jobSite || 'Unknown',
      timezone: report.timezone,

      employees: report.employees.map((emp) => ({
        name: emp.name,
        normalizedName: emp.normalizedName,
        regularHours: emp.regularHours,
        overtimeHours: emp.overtimeHours,
        totalHours: emp.totalHours,
      })),

      subcontractors: report.subcontractors?.map((s) => ({
        company: s.company,
        normalizedCompany: s.normalizedCompany,
        trade: s.trade,
        headcount: s.headcount,
        workPerformed: s.workPerformed,
      })),

      deliveries: report.deliveries?.map((d) => ({
        vendor: d.vendor,
        normalizedVendor: d.normalizedVendor,
        material: d.material,
        quantity: d.quantity,
        notes: d.notes,
      })),

      equipment: report.equipment?.map((e) => ({
        name: e.name,
        hours: e.hours,
        notes: e.notes,
      })),

      shortages: report.shortages,
      weatherConditions: report.weatherConditions,
      weatherImpact: report.weatherImpact,

      safety: report.safety?.map((s) => ({
        type: s.type,
        description: s.description,
        actionTaken: s.actionTaken,
      })),

      delays: report.delays?.map((d) => ({
        reason: d.reason,
        duration: d.duration,
        impact: d.impact,
      })),

      workPerformed: report.workPerformed?.map((w) => ({
        description: w.description,
        area: w.area,
      })),

      notes: report.notes,
      audioUrl: report.audioUrl,
      transcriptUrl: report.transcriptUrl,

      createdAt: now,
      updatedAt: now,
    }

    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: item,
      })
    )

    console.log('[DynamoDB] Report saved:', { reportId, employeeCount: item.employees.length })
    return reportId
  }

  async getReportById(id: string): Promise<DailyReport | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { reportId: id },
      })
    )

    if (!result.Item) return null
    return this.mapToDailyReport(result.Item as DynamoReportItem)
  }

  async getReportsByDateRange(start: Date, end: Date): Promise<DailyReport[]> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: DYNAMO_CONFIG.INDEXES.BY_DATE,
        KeyConditionExpression: 'entityType = :et AND submittedAt BETWEEN :start AND :end',
        ExpressionAttributeValues: {
          ':et': 'REPORT',
          ':start': start.toISOString(),
          ':end': end.toISOString(),
        },
        ScanIndexForward: false,
      })
    )

    return (result.Items || []).map((item) =>
      this.mapToDailyReport(item as DynamoReportItem)
    )
  }

  async getRecentReports(limit = 20): Promise<DailyReport[]> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: DYNAMO_CONFIG.INDEXES.BY_DATE,
        KeyConditionExpression: 'entityType = :et',
        ExpressionAttributeValues: {
          ':et': 'REPORT',
        },
        ScanIndexForward: false,
        Limit: limit,
      })
    )

    return (result.Items || []).map((item) =>
      this.mapToDailyReport(item as DynamoReportItem)
    )
  }

  async getReportsBySite(jobSite: string, limit = 20): Promise<DailyReport[]> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: DYNAMO_CONFIG.INDEXES.BY_SITE,
        KeyConditionExpression: 'jobSite = :site',
        ExpressionAttributeValues: {
          ':site': jobSite,
        },
        ScanIndexForward: false,
        Limit: limit,
      })
    )

    return (result.Items || []).map((item) =>
      this.mapToDailyReport(item as DynamoReportItem)
    )
  }

  async updateFileUrls(id: string, audioUrl?: string, transcriptUrl?: string): Promise<void> {
    const updates: string[] = ['#updatedAt = :now']
    const names: Record<string, string> = { '#updatedAt': 'updatedAt' }
    const values: Record<string, string> = { ':now': new Date().toISOString() }

    if (audioUrl) {
      updates.push('#audioUrl = :audioUrl')
      names['#audioUrl'] = 'audioUrl'
      values[':audioUrl'] = audioUrl
    }

    if (transcriptUrl) {
      updates.push('#transcriptUrl = :transcriptUrl')
      names['#transcriptUrl'] = 'transcriptUrl'
      values[':transcriptUrl'] = transcriptUrl
    }

    await this.client.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { reportId: id },
        UpdateExpression: `SET ${updates.join(', ')}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      })
    )

    console.log('[DynamoDB] File URLs updated for report:', id)
  }

  /**
   * Store transcript and conversation metadata on a report
   * Called by post-call webhook after conversation ends
   */
  async updateTranscript(
    id: string,
    transcript: ElevenLabsTranscriptEntry[],
    transcriptText: string,
    conversationId?: string,
    callDurationSecs?: number
  ): Promise<void> {
    const updates: string[] = [
      '#transcript = :transcript',
      '#transcriptText = :transcriptText',
      '#updatedAt = :now',
    ]
    const names: Record<string, string> = {
      '#transcript': 'transcript',
      '#transcriptText': 'transcriptText',
      '#updatedAt': 'updatedAt',
    }
    const values: Record<string, unknown> = {
      ':transcript': transcript,
      ':transcriptText': transcriptText,
      ':now': new Date().toISOString(),
    }

    if (conversationId) {
      updates.push('#conversationId = :conversationId')
      names['#conversationId'] = 'conversationId'
      values[':conversationId'] = conversationId
    }

    if (callDurationSecs !== undefined) {
      updates.push('#callDurationSecs = :callDurationSecs')
      names['#callDurationSecs'] = 'callDurationSecs'
      values[':callDurationSecs'] = callDurationSecs
    }

    await this.client.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { reportId: id },
        UpdateExpression: `SET ${updates.join(', ')}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      })
    )

    console.log('[DynamoDB] Transcript updated for report:', id)
  }

  /**
   * Find the most recent report without transcript/files
   * Used to match post-call webhooks to reports
   */
  async findRecentReportWithoutFiles(): Promise<string | null> {
    const recent = await this.getRecentReports(5)

    for (const report of recent) {
      if (!report.audioUrl && !report.transcriptUrl) {
        return report.id || null
      }
    }

    return null
  }

  /**
   * Get the raw DynamoDB item (includes transcript array for admin dashboard)
   */
  async getRawItem(id: string): Promise<DynamoReportItem | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { reportId: id },
      })
    )

    return (result.Item as DynamoReportItem) || null
  }

  private mapToDailyReport(item: DynamoReportItem): DailyReport {
    return {
      id: item.reportId,
      submittedAt: new Date(item.submittedAt),
      timezone: item.timezone,
      jobSite: item.jobSite,

      employees: item.employees.map((emp) => ({
        name: emp.name,
        normalizedName: emp.normalizedName,
        regularHours: emp.regularHours,
        overtimeHours: emp.overtimeHours,
        totalHours: emp.totalHours,
      })),

      subcontractors: item.subcontractors,
      deliveries: item.deliveries,
      equipment: item.equipment,
      shortages: item.shortages,

      weatherConditions: item.weatherConditions,
      weatherImpact: item.weatherImpact,

      safety: item.safety?.map((s) => ({
        type: s.type as 'incident' | 'near_miss' | 'hazard' | 'positive',
        description: s.description,
        actionTaken: s.actionTaken,
      })),

      delays: item.delays,
      workPerformed: item.workPerformed,
      notes: item.notes,

      audioUrl: item.audioUrl,
      transcriptUrl: item.transcriptUrl,

      createdAt: new Date(item.createdAt),
      updatedAt: new Date(item.updatedAt),
    }
  }
}
