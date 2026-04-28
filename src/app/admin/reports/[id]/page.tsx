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
  summary?: string
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
  const [activeTab, setActiveTab] = useState<'daily' | 'payroll' | 'transcript'>('daily')

  const API_BASE = '/api/admin'

  useEffect(() => {
    fetch(`${API_BASE}/reports/${id}`)
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
  const hasSafetyIssues = (report.safety || []).some((s) => s.type !== 'positive')
  const hasDelays = (report.delays || []).length > 0
  const shortageText = report.shortages && report.shortages.toLowerCase() !== 'none' ? report.shortages : null
  const deliveryIssues = (report.deliveries || []).filter((d) => {
    if (!d.notes) return false
    const n = d.notes.toLowerCase()
    return !n.includes('everything was there') && !n.includes('all good') && !n.includes('no issues') && n.trim() !== ''
  })
  const hasAttentionItems = hasSafetyIssues || hasDelays || !!shortageText || deliveryIssues.length > 0

  const submittedDate = new Date(report.submittedAt).toLocaleDateString('en-US', {
    timeZone: report.timezone || 'America/New_York',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const submittedTime = new Date(report.submittedAt).toLocaleTimeString('en-US', {
    timeZone: report.timezone || 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
  })

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Report Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="bg-[#1e3a5f] px-6 py-5 text-white">
          <div className="flex items-start justify-between">
            <div>
              <a href="/admin" className="text-sm text-blue-200 hover:text-white transition-colors">
                &larr; Back to Dashboard
              </a>
              <h2 className="text-2xl font-bold mt-2">Daily Field Report</h2>
              <p className="text-blue-100 mt-1">{submittedDate}</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              {report.jobSite && (
                <span className="bg-white/20 px-3 py-1 rounded-md text-sm font-medium">
                  {report.jobSite}
                </span>
              )}
              <span className="text-xs text-blue-200">Submitted {submittedTime}</span>
            </div>
          </div>
        </div>

        {/* Quick Stats Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-5 divide-x divide-gray-100 border-b border-gray-200">
          <QuickStat label="Crew Size" value={String(report.employees.length)} />
          <QuickStat label="Total Hours" value={String(totalHours)} />
          <QuickStat label="Regular" value={String(totalRegular)} />
          <QuickStat label="Overtime" value={String(totalOT)} accent={totalOT > 0 ? 'amber' : undefined} />
          <QuickStat
            label="Safety"
            value={hasSafetyIssues ? 'Issues' : 'Clear'}
            accent={hasSafetyIssues ? 'red' : 'green'}
          />
        </div>

        {/* File Action Buttons */}
        <div className="flex items-center gap-3 px-6 py-3 bg-gray-50 border-b border-gray-200">
          {report.audioUrl && (
            <a
              href={report.audioUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#1e3a5f] text-white rounded-lg text-sm font-medium hover:bg-[#2a4d7a] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M9 12a3 3 0 106 0 3 3 0 00-6 0z" /></svg>
              Listen to Recording
            </a>
          )}
          {report.transcriptUrl && (
            <a
              href={report.transcriptUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              Download Transcript
            </a>
          )}
          {report.callDurationSecs && (
            <span className="text-sm text-gray-500 ml-auto">
              Call: {Math.floor(report.callDurationSecs / 60)}:{String(report.callDurationSecs % 60).padStart(2, '0')}
            </span>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        <TabButton active={activeTab === 'daily'} onClick={() => setActiveTab('daily')}>
          Daily Report
        </TabButton>
        <TabButton active={activeTab === 'payroll'} onClick={() => setActiveTab('payroll')}>
          Payroll / Hours
        </TabButton>
        {report.transcript && report.transcript.length > 0 && (
          <TabButton active={activeTab === 'transcript'} onClick={() => setActiveTab('transcript')}>
            Transcript
          </TabButton>
        )}
      </div>

      {/* TAB: Daily Field Report (Foreman / Boss view) */}
      {activeTab === 'daily' && (
        <div className="space-y-5">
          {/* Executive Summary */}
          {report.summary && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 bg-[#1e3a5f]/5">
                <h4 className="text-sm font-semibold text-[#1e3a5f] uppercase tracking-wide">Daily Summary</h4>
              </div>
              <div className="px-5 py-4">
                <p className="text-sm text-gray-800 leading-relaxed">{report.summary}</p>
              </div>
            </div>
          )}

          {/* Alerts Banner — Attention Required */}
          {hasAttentionItems && (
            <div className={`rounded-xl border-2 p-5 ${hasSafetyIssues ? 'border-red-400 bg-red-50' : 'border-amber-400 bg-amber-50'}`}>
              <h3 className={`text-sm font-bold uppercase tracking-wide mb-3 ${hasSafetyIssues ? 'text-red-800' : 'text-amber-800'}`}>
                Attention Required
              </h3>
              <div className="space-y-3">
                {report.safety?.filter(s => s.type !== 'positive').map((s, i) => (
                  <div key={i} className="flex items-start gap-3 bg-white/70 rounded-lg p-3">
                    <span className="mt-0.5 inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-100 flex-shrink-0">
                      <span className="w-2 h-2 rounded-full bg-red-500" />
                    </span>
                    <div>
                      <span className="text-sm font-bold text-red-800">
                        {s.type === 'incident' ? 'SAFETY INCIDENT' : s.type === 'near_miss' ? 'NEAR MISS' : 'HAZARD'}
                      </span>
                      <p className="text-sm text-gray-900 mt-0.5">{s.description}</p>
                      {s.actionTaken && <p className="text-xs text-gray-600 mt-1">Action taken: {s.actionTaken}</p>}
                      {s.type === 'incident' && (
                        <p className="text-xs font-bold text-red-700 mt-1.5 bg-red-100 inline-block px-2 py-0.5 rounded">
                          ACTION: File safety incident report
                        </p>
                      )}
                    </div>
                  </div>
                ))}
                {report.delays?.map((d, i) => (
                  <div key={`delay-${i}`} className="flex items-start gap-3 bg-white/70 rounded-lg p-3">
                    <span className="mt-0.5 inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 flex-shrink-0">
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                    </span>
                    <div>
                      <span className="text-sm font-bold text-amber-800">DELAY</span>
                      <p className="text-sm text-gray-900 mt-0.5">{d.reason}{d.duration && `, delayed ${d.duration}`}</p>
                      {d.impact && <p className="text-xs text-gray-600 mt-1">Impact: {d.impact}</p>}
                    </div>
                  </div>
                ))}
                {deliveryIssues.map((d, i) => (
                  <div key={`delivery-${i}`} className="flex items-start gap-3 bg-white/70 rounded-lg p-3">
                    <span className="mt-0.5 inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 flex-shrink-0">
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                    </span>
                    <div>
                      <span className="text-sm font-bold text-amber-800">DELIVERY ISSUE</span>
                      <p className="text-sm text-gray-900 mt-0.5">{d.vendor}: {d.notes}</p>
                    </div>
                  </div>
                ))}
                {shortageText && (
                  <div className="flex items-start gap-3 bg-white/70 rounded-lg p-3">
                    <span className="mt-0.5 inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 flex-shrink-0">
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                    </span>
                    <div>
                      <span className="text-sm font-bold text-amber-800">SHORTAGE / MISSING</span>
                      <p className="text-sm text-gray-900 mt-0.5">{shortageText}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Work Performed */}
            <ReportSection title="Work Performed" icon="W">
              {report.workPerformed && report.workPerformed.length > 0 ? (
                <ul className="space-y-2">
                  {report.workPerformed.map((w, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#1e3a5f] flex-shrink-0" />
                      <div>
                        <span className="text-sm text-gray-800">{w.description}</span>
                        {w.area && <span className="text-xs text-gray-500 ml-1">({w.area})</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-400 italic">No work details recorded</p>
              )}
            </ReportSection>

            {/* Crew Summary (compact for foreman) */}
            <ReportSection title="Crew on Site" icon="C">
              <div className="space-y-1.5">
                {report.employees.map((emp, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-gray-800 font-medium">{emp.normalizedName}</span>
                    <span className="text-gray-500">{emp.totalHours} hrs</span>
                  </div>
                ))}
                <div className="border-t border-gray-200 pt-2 mt-2 flex justify-between text-sm font-bold text-gray-900">
                  <span>Total ({report.employees.length} workers)</span>
                  <span>{totalHours} hrs</span>
                </div>
              </div>
            </ReportSection>

            {/* Weather & Conditions */}
            {(report.weatherConditions || report.weatherImpact) && (
              <ReportSection title="Weather & Conditions" icon="E">
                {report.weatherConditions && (
                  <p className="text-sm text-gray-800">{report.weatherConditions}</p>
                )}
                {report.weatherImpact && (
                  <p className="text-sm text-gray-500 mt-1">Impact: {report.weatherImpact}</p>
                )}
              </ReportSection>
            )}

            {/* Safety */}
            <ReportSection
              title="Safety"
              icon="S"
              accent={hasSafetyIssues ? 'red' : 'green'}
            >
              {report.safety && report.safety.length > 0 ? (
                <div className="space-y-2">
                  {report.safety.map((s, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className={`mt-0.5 text-xs font-bold px-1.5 py-0.5 rounded ${
                        s.type === 'positive' ? 'bg-green-100 text-green-700'
                          : s.type === 'incident' ? 'bg-red-100 text-red-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        {s.type === 'near_miss' ? 'NEAR MISS' : s.type.toUpperCase()}
                      </span>
                      <div>
                        <p className="text-sm text-gray-800">{s.description}</p>
                        {s.actionTaken && <p className="text-xs text-gray-500">Action: {s.actionTaken}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-green-600 font-medium">No safety issues reported</p>
              )}
            </ReportSection>

            {/* Deliveries */}
            {report.deliveries && report.deliveries.length > 0 && (
              <ReportSection title="Deliveries" icon="D">
                <div className="space-y-2">
                  {report.deliveries.map((d, i) => (
                    <div key={i} className="text-sm">
                      <span className="font-medium text-gray-800">{d.vendor}</span>
                      <span className="text-gray-600"> — {d.material}</span>
                      {d.quantity && <span className="text-gray-500"> ({d.quantity})</span>}
                      {d.notes && <p className="text-xs text-gray-500 mt-0.5">{d.notes}</p>}
                    </div>
                  ))}
                </div>
              </ReportSection>
            )}

            {/* Equipment */}
            {report.equipment && report.equipment.length > 0 && (
              <ReportSection title="Equipment" icon="Q">
                <div className="space-y-1.5">
                  {report.equipment.map((e, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-gray-800">{e.name}</span>
                      <span className="text-gray-500">
                        {e.hours && `${e.hours} hrs`}
                        {e.notes && ` — ${e.notes}`}
                      </span>
                    </div>
                  ))}
                </div>
              </ReportSection>
            )}

            {/* Subcontractors */}
            {report.subcontractors && report.subcontractors.length > 0 && (
              <ReportSection title="Subcontractors" icon="B">
                <div className="space-y-2">
                  {report.subcontractors.map((s, i) => (
                    <div key={i} className="text-sm">
                      <span className="font-medium text-gray-800">{s.company}</span>
                      {s.headcount && <span className="text-gray-500"> ({s.headcount} workers)</span>}
                      {s.trade && <span className="text-gray-600"> — {s.trade}</span>}
                      {s.workPerformed && <p className="text-xs text-gray-500 mt-0.5">{s.workPerformed}</p>}
                    </div>
                  ))}
                </div>
              </ReportSection>
            )}

            {/* Notes */}
            {report.notes && (
              <ReportSection title="Additional Notes" icon="N">
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{report.notes}</p>
              </ReportSection>
            )}
          </div>

          {/* Report Footer */}
          <div className="text-xs text-gray-400 text-center pt-4 border-t border-gray-200">
            Report ID: {report.reportId}
            {report.conversationId && <> | Conversation: {report.conversationId}</>}
          </div>
        </div>
      )}

      {/* TAB: Payroll / Hourly Report (Bookkeeper view) */}
      {activeTab === 'payroll' && (
        <div className="space-y-5">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h3 className="font-semibold text-gray-900">Employee Hours — {submittedDate}</h3>
              <p className="text-xs text-gray-500 mt-1">
                {report.jobSite && `Job Site: ${report.jobSite} | `}
                For payroll processing
              </p>
            </div>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">#</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Employee Name</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Regular Hrs</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">OT Hrs</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Total Hrs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {report.employees.map((emp, i) => (
                  <tr key={i} className="hover:bg-blue-50/30">
                    <td className="px-6 py-3 text-sm text-gray-400">{i + 1}</td>
                    <td className="px-6 py-3 text-sm font-medium text-gray-900">
                      {emp.normalizedName}
                      {emp.name !== emp.normalizedName && (
                        <span className="text-xs text-gray-400 ml-2">(reported as &ldquo;{emp.name}&rdquo;)</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-sm text-right text-gray-700">{emp.regularHours}</td>
                    <td className={`px-6 py-3 text-sm text-right ${emp.overtimeHours > 0 ? 'text-amber-600 font-medium' : 'text-gray-700'}`}>
                      {emp.overtimeHours}
                    </td>
                    <td className="px-6 py-3 text-sm text-right font-semibold text-gray-900">{emp.totalHours}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50">
                <tr className="font-bold">
                  <td className="px-6 py-3" colSpan={2}>
                    <span className="text-sm text-gray-900">TOTALS ({report.employees.length} employees)</span>
                  </td>
                  <td className="px-6 py-3 text-sm text-right text-gray-900">{totalRegular}</td>
                  <td className={`px-6 py-3 text-sm text-right ${totalOT > 0 ? 'text-amber-600' : 'text-gray-900'}`}>{totalOT}</td>
                  <td className="px-6 py-3 text-sm text-right text-gray-900">{totalHours}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* TAB: Conversation Transcript */}
      {activeTab === 'transcript' && report.transcript && report.transcript.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900">Conversation Transcript</h3>
            <p className="text-xs text-gray-500 mt-1">
              {report.conversationId && `Conversation: ${report.conversationId}`}
              {report.callDurationSecs && ` | Duration: ${Math.floor(report.callDurationSecs / 60)}:${String(report.callDurationSecs % 60).padStart(2, '0')}`}
            </p>
          </div>
          <div className="px-6 py-4 space-y-3 max-h-[700px] overflow-y-auto">
            {report.transcript.map((entry, i) => (
              <div
                key={i}
                className={`flex ${entry.role === 'agent' ? 'justify-start' : 'justify-end'}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                    entry.role === 'agent'
                      ? 'bg-[#1e3a5f]/10 text-gray-800 rounded-bl-md'
                      : 'bg-gray-100 text-gray-800 rounded-br-md'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-bold ${entry.role === 'agent' ? 'text-[#1e3a5f]' : 'text-gray-600'}`}>
                      {entry.role === 'agent' ? 'Roxy' : 'Field Manager'}
                    </span>
                    {entry.time_in_call_secs !== undefined && (
                      <span className="text-[10px] text-gray-400">
                        {Math.floor(entry.time_in_call_secs / 60)}:{String(Math.round(entry.time_in_call_secs) % 60).padStart(2, '0')}
                      </span>
                    )}
                  </div>
                  <p className="text-sm leading-relaxed">{entry.message}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function QuickStat({ label, value, accent }: { label: string; value: string; accent?: 'red' | 'green' | 'amber' }) {
  const colorMap = {
    red: 'text-red-600',
    green: 'text-green-600',
    amber: 'text-amber-600',
  }
  return (
    <div className="px-4 py-3 text-center">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-xl font-bold mt-0.5 ${accent ? colorMap[accent] : 'text-gray-900'}`}>{value}</p>
    </div>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
        active
          ? 'bg-white text-[#1e3a5f] shadow-sm'
          : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      {children}
    </button>
  )
}

function ReportSection({
  title,
  icon,
  accent,
  children,
}: {
  title: string
  icon: string
  accent?: 'red' | 'green' | 'amber'
  children: React.ReactNode
}) {
  const accentBorder = accent === 'red' ? 'border-l-red-500' : accent === 'green' ? 'border-l-green-500' : accent === 'amber' ? 'border-l-amber-500' : 'border-l-[#1e3a5f]'
  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-200 border-l-4 ${accentBorder} overflow-hidden`}>
      <div className="px-5 py-3 border-b border-gray-100">
        <h4 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">{title}</h4>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  )
}
