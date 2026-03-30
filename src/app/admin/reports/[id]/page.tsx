'use client'

import { useEffect, useState } from 'react'
import { use } from 'react'

interface TranscriptEntry {
  role: 'user' | 'agent'
  message: string
  time_in_call_secs?: number
}

interface ReportDetail {
  reportId: string
  submittedAt: string
  jobSite: string
  timezone: string
  employees: Array<{
    name: string
    normalizedName: string
    regularHours: number
    overtimeHours: number
    totalHours: number
  }>
  subcontractors?: Array<{
    company: string
    trade?: string
    headcount?: number
    workPerformed?: string
  }>
  deliveries?: Array<{
    vendor: string
    material: string
    quantity?: string
    notes?: string
  }>
  equipment?: Array<{
    name: string
    hours?: number
    notes?: string
  }>
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
  workPerformed?: Array<{
    description: string
    area?: string
  }>
  weatherConditions?: string
  weatherImpact?: string
  shortages?: string
  notes?: string
  audioUrl?: string
  transcriptUrl?: string
  transcript?: TranscriptEntry[]
  transcriptText?: string
  conversationId?: string
  callDurationSecs?: number
  createdAt: string
  updatedAt: string
}

export default function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [report, setReport] = useState<ReportDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/admin/reports/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error('Report not found')
        return res.json()
      })
      .then((d) => {
        setReport(d.report)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [id])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1e3a5f]" />
      </div>
    )
  }

  if (error || !report) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
        {error || 'Report not found'}
      </div>
    )
  }

  const totalHours = report.employees.reduce((sum, e) => sum + e.totalHours, 0)
  const totalRegular = report.employees.reduce((sum, e) => sum + e.regularHours, 0)
  const totalOT = report.employees.reduce((sum, e) => sum + e.overtimeHours, 0)

  const submittedDate = new Date(report.submittedAt).toLocaleString('en-US', {
    timeZone: report.timezone,
    dateStyle: 'long',
    timeStyle: 'short',
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <a href="/admin" className="text-sm text-gray-500 hover:text-gray-700">
            &larr; Back to Dashboard
          </a>
          <h2 className="text-2xl font-bold text-gray-900 mt-2">{report.jobSite}</h2>
          <p className="text-gray-500">{submittedDate}</p>
          <p className="text-xs text-gray-400 font-mono mt-1">{report.reportId}</p>
        </div>
        <div className="flex gap-2">
          {report.audioUrl && (
            <a
              href={report.audioUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-3 py-2 bg-[#1e3a5f] text-white rounded-md text-sm hover:bg-blue-800"
            >
              Listen to Audio
            </a>
          )}
          {report.transcriptUrl && (
            <a
              href={report.transcriptUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-3 py-2 bg-gray-600 text-white rounded-md text-sm hover:bg-gray-700"
            >
              Download Transcript
            </a>
          )}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg p-4 shadow">
          <p className="text-sm text-gray-500">Employees</p>
          <p className="text-2xl font-bold">{report.employees.length}</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow">
          <p className="text-sm text-gray-500">Total Hours</p>
          <p className="text-2xl font-bold">{totalHours}</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow">
          <p className="text-sm text-gray-500">Regular / OT</p>
          <p className="text-2xl font-bold">
            {totalRegular} / {totalOT}
          </p>
        </div>
        {report.callDurationSecs && (
          <div className="bg-white rounded-lg p-4 shadow">
            <p className="text-sm text-gray-500">Call Duration</p>
            <p className="text-2xl font-bold">
              {Math.floor(report.callDurationSecs / 60)}:{String(report.callDurationSecs % 60).padStart(2, '0')}
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Employee Hours */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900">Employee Hours</h3>
          </div>
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-5 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-5 py-2 text-right text-xs font-medium text-gray-500 uppercase">Reg</th>
                <th className="px-5 py-2 text-right text-xs font-medium text-gray-500 uppercase">OT</th>
                <th className="px-5 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {report.employees.map((emp, i) => (
                <tr key={i}>
                  <td className="px-5 py-3 text-sm font-medium text-gray-900">{emp.normalizedName}</td>
                  <td className="px-5 py-3 text-sm text-right text-gray-600">{emp.regularHours}</td>
                  <td className="px-5 py-3 text-sm text-right text-gray-600">{emp.overtimeHours}</td>
                  <td className="px-5 py-3 text-sm text-right font-semibold">{emp.totalHours}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Report Details */}
        <div className="space-y-4">
          {/* Weather */}
          {(report.weatherConditions || report.weatherImpact) && (
            <DetailCard title="Weather">
              {report.weatherConditions && <p>{report.weatherConditions}</p>}
              {report.weatherImpact && <p className="text-gray-500 text-sm">Impact: {report.weatherImpact}</p>}
            </DetailCard>
          )}

          {/* Safety */}
          {report.safety && report.safety.length > 0 && (
            <DetailCard title="Safety" alert={report.safety.some((s) => s.type !== 'positive')}>
              {report.safety.map((s, i) => (
                <div key={i} className="mb-2 last:mb-0">
                  <span
                    className={`inline-block text-xs font-medium px-2 py-0.5 rounded mr-2 ${
                      s.type === 'positive'
                        ? 'bg-green-100 text-green-700'
                        : s.type === 'incident'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}
                  >
                    {s.type}
                  </span>
                  <span className="text-sm">{s.description}</span>
                  {s.actionTaken && <p className="text-xs text-gray-500 ml-1 mt-0.5">Action: {s.actionTaken}</p>}
                </div>
              ))}
            </DetailCard>
          )}

          {/* Deliveries */}
          {report.deliveries && report.deliveries.length > 0 && (
            <DetailCard title="Deliveries">
              {report.deliveries.map((d, i) => (
                <p key={i} className="text-sm">
                  <span className="font-medium">{d.vendor}:</span> {d.material}
                  {d.quantity && ` (${d.quantity})`}
                  {d.notes && ` — ${d.notes}`}
                </p>
              ))}
            </DetailCard>
          )}

          {/* Equipment */}
          {report.equipment && report.equipment.length > 0 && (
            <DetailCard title="Equipment">
              {report.equipment.map((e, i) => (
                <p key={i} className="text-sm">
                  {e.name}
                  {e.hours && ` (${e.hours} hrs)`}
                  {e.notes && ` — ${e.notes}`}
                </p>
              ))}
            </DetailCard>
          )}

          {/* Subcontractors */}
          {report.subcontractors && report.subcontractors.length > 0 && (
            <DetailCard title="Subcontractors">
              {report.subcontractors.map((s, i) => (
                <p key={i} className="text-sm">
                  <span className="font-medium">{s.company}</span>
                  {s.headcount && ` (${s.headcount} workers)`}
                  {s.trade && ` — ${s.trade}`}
                  {s.workPerformed && `: ${s.workPerformed}`}
                </p>
              ))}
            </DetailCard>
          )}

          {/* Delays */}
          {report.delays && report.delays.length > 0 && (
            <DetailCard title="Delays">
              {report.delays.map((d, i) => (
                <p key={i} className="text-sm">
                  {d.reason}
                  {d.duration && ` (${d.duration})`}
                  {d.impact && ` — ${d.impact}`}
                </p>
              ))}
            </DetailCard>
          )}

          {/* Work Performed */}
          {report.workPerformed && report.workPerformed.length > 0 && (
            <DetailCard title="Work Performed">
              {report.workPerformed.map((w, i) => (
                <p key={i} className="text-sm">
                  {w.description}
                  {w.area && ` (${w.area})`}
                </p>
              ))}
            </DetailCard>
          )}

          {/* Notes */}
          {report.notes && (
            <DetailCard title="Notes">
              <p className="text-sm">{report.notes}</p>
            </DetailCard>
          )}

          {/* Shortages */}
          {report.shortages && (
            <DetailCard title="Shortages">
              <p className="text-sm">{report.shortages}</p>
            </DetailCard>
          )}
        </div>
      </div>

      {/* Transcript */}
      {report.transcript && report.transcript.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900">Conversation Transcript</h3>
            {report.conversationId && (
              <p className="text-xs text-gray-400 font-mono mt-1">
                Conversation: {report.conversationId}
              </p>
            )}
          </div>
          <div className="px-5 py-4 space-y-3 max-h-[600px] overflow-y-auto">
            {report.transcript.map((entry, i) => (
              <div
                key={i}
                className={`flex ${entry.role === 'agent' ? 'justify-start' : 'justify-end'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-2 ${
                    entry.role === 'agent'
                      ? 'bg-blue-50 text-gray-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold">
                      {entry.role === 'agent' ? 'Roxy' : 'Field Manager'}
                    </span>
                    {entry.time_in_call_secs !== undefined && (
                      <span className="text-xs text-gray-400">
                        {Math.floor(entry.time_in_call_secs / 60)}:
                        {String(Math.round(entry.time_in_call_secs) % 60).padStart(2, '0')}
                      </span>
                    )}
                  </div>
                  <p className="text-sm">{entry.message}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function DetailCard({
  title,
  alert = false,
  children,
}: {
  title: string
  alert?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={`rounded-lg p-4 shadow ${alert ? 'bg-red-50 border border-red-200' : 'bg-white'}`}>
      <h4 className={`text-sm font-semibold mb-2 ${alert ? 'text-red-700' : 'text-gray-700'}`}>
        {title}
      </h4>
      <div className="text-gray-600">{children}</div>
    </div>
  )
}
