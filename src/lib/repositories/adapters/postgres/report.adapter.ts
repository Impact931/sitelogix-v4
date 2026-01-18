/**
 * PostgreSQL Report Repository Adapter
 *
 * Implements ReportRepository interface using Prisma/PostgreSQL.
 * Used for local development.
 */

import type { DailyReport, EmployeeHours, ReportRepository } from '../../types'
import prisma from './prisma'

export class PostgresReportRepository implements ReportRepository {
  async saveReport(report: Omit<DailyReport, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const created = await prisma.report.create({
      data: {
        submittedAt: report.submittedAt,
        timezone: report.timezone,
        jobSite: report.jobSite,
        deliveries: report.deliveries,
        incidents: report.incidents,
        shortages: report.shortages,
        audioUrl: report.audioUrl,
        transcriptUrl: report.transcriptUrl,
        employees: {
          create: report.employees.map((emp) => ({
            employeeId: emp.employeeId || '',
            name: emp.name,
            normalizedName: emp.normalizedName,
            regularHours: emp.regularHours,
            overtimeHours: emp.overtimeHours,
            totalHours: emp.totalHours,
          })),
        },
      },
    })

    return created.id
  }

  async getReportById(id: string): Promise<DailyReport | null> {
    const report = await prisma.report.findUnique({
      where: { id },
      include: {
        employees: true,
      },
    })

    return report ? this.mapToReport(report) : null
  }

  async getReportsByDateRange(start: Date, end: Date): Promise<DailyReport[]> {
    const reports = await prisma.report.findMany({
      where: {
        submittedAt: {
          gte: start,
          lte: end,
        },
      },
      include: {
        employees: true,
      },
      orderBy: { submittedAt: 'desc' },
    })

    return reports.map(this.mapToReport)
  }

  async getRecentReports(limit = 10): Promise<DailyReport[]> {
    const reports = await prisma.report.findMany({
      take: limit,
      include: {
        employees: true,
      },
      orderBy: { submittedAt: 'desc' },
    })

    return reports.map(this.mapToReport)
  }

  async updateFileUrls(id: string, audioUrl?: string, transcriptUrl?: string): Promise<void> {
    await prisma.report.update({
      where: { id },
      data: {
        ...(audioUrl && { audioUrl }),
        ...(transcriptUrl && { transcriptUrl }),
      },
    })
  }

  /**
   * Map Prisma model to domain type
   */
  private mapToReport(prismaReport: {
    id: string
    submittedAt: Date
    timezone: string
    jobSite: string | null
    deliveries: string | null
    incidents: string | null
    shortages: string | null
    audioUrl: string | null
    transcriptUrl: string | null
    createdAt: Date
    updatedAt: Date
    employees: Array<{
      id: string
      employeeId: string
      name: string
      normalizedName: string
      regularHours: unknown
      overtimeHours: unknown
      totalHours: unknown
    }>
  }): DailyReport {
    return {
      id: prismaReport.id,
      submittedAt: prismaReport.submittedAt,
      timezone: prismaReport.timezone,
      jobSite: prismaReport.jobSite ?? undefined,
      deliveries: prismaReport.deliveries ?? undefined,
      incidents: prismaReport.incidents ?? undefined,
      shortages: prismaReport.shortages ?? undefined,
      audioUrl: prismaReport.audioUrl ?? undefined,
      transcriptUrl: prismaReport.transcriptUrl ?? undefined,
      createdAt: prismaReport.createdAt,
      updatedAt: prismaReport.updatedAt,
      employees: prismaReport.employees.map(this.mapToEmployeeHours),
    }
  }

  private mapToEmployeeHours(prismaEntry: {
    employeeId: string
    name: string
    normalizedName: string
    regularHours: unknown
    overtimeHours: unknown
    totalHours: unknown
  }): EmployeeHours {
    return {
      employeeId: prismaEntry.employeeId,
      name: prismaEntry.name,
      normalizedName: prismaEntry.normalizedName,
      regularHours: Number(prismaEntry.regularHours),
      overtimeHours: Number(prismaEntry.overtimeHours),
      totalHours: Number(prismaEntry.totalHours),
    }
  }
}
