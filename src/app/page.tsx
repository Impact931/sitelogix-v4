'use client'

import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import ErrorMessage from '@/components/ErrorMessage'

const VoiceSession = dynamic(() => import('@/components/VoiceSession'), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center gap-4">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-amber-200 border-t-amber-600" />
      <p className="text-gray-300">Loading voice module...</p>
    </div>
  ),
})

type AppState = 'idle' | 'voice' | 'complete' | 'error'

interface ReportPreview {
  reportId: string
  jobSite: string
  summary?: string
  employees: Array<{ name: string; normalizedName: string; totalHours: number; regularHours: number; overtimeHours: number }>
  workPerformed?: Array<{ description: string; area?: string }>
  safety?: Array<{ type: string; description: string; actionTaken?: string }>
  deliveries?: Array<{ vendor: string; material: string }>
  weatherConditions?: string
  transcript?: Array<{ role: string; message: string; time_in_call_secs?: number }>
}

const ADMIN_API = process.env.NEXT_PUBLIC_ADMIN_API_URL || 'https://dor3wzjhjja3zwzshurzjt4laq0uiztn.lambda-url.us-east-1.on.aws'

const CHECKLIST = [
  { icon: 'users', label: 'Personnel on site' },
  { icon: 'clock', label: 'Hours per person' },
  { icon: 'site', label: 'Job site name' },
  { icon: 'truck', label: 'Deliveries received' },
  { icon: 'alert', label: 'Delays or issues' },
  { icon: 'shield', label: 'Safety incidents' },
  { icon: 'cloud', label: 'Weather conditions' },
]

export default function Home() {
  const [state, setState] = useState<AppState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [report, setReport] = useState<ReportPreview | null>(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [showView, setShowView] = useState<'none' | 'report' | 'transcript'>('none')

  const handleStartReport = async () => {
    setError(null)
    setReport(null)
    setShowView('none')
    setConversationId(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach(track => track.stop())
      setState('voice')
    } catch (err) {
      console.error('Microphone permission error:', err)
      if (err instanceof Error && err.name === 'NotAllowedError') {
        setError('Microphone access denied. Please allow microphone access in your browser settings.')
      } else {
        setError('Could not access microphone. Please check your device settings.')
      }
      setState('error')
    }
  }

  const handleVoiceComplete = (data: { conversationId?: string }) => {
    setConversationId(data.conversationId || null)
    setState('complete')
  }

  const handleVoiceError = (msg: string) => {
    setError(msg)
    setState('error')
  }

  const handleVoiceCancel = () => setState('idle')

  const handleDismissError = () => {
    setError(null)
    setState('idle')
  }

  // Poll for report data once we have a conversation ID
  const fetchReport = useCallback(async () => {
    if (!conversationId || report) return
    setReportLoading(true)
    try {
      const res = await fetch(`${ADMIN_API}/reports?conversationId=${conversationId}`)
      if (res.ok) {
        const data = await res.json()
        if (data.report) setReport(data.report)
      }
    } catch { /* will retry */ }
    setReportLoading(false)
  }, [conversationId, report])

  useEffect(() => {
    if (state !== 'complete' || !conversationId || report) return
    // Poll every 5s for up to 60s
    const interval = setInterval(fetchReport, 5000)
    fetchReport() // immediate first try
    const timeout = setTimeout(() => clearInterval(interval), 60000)
    return () => { clearInterval(interval); clearTimeout(timeout) }
  }, [state, conversationId, report, fetchReport])

  return (
    <div className="flex min-h-screen flex-col bg-[#1a1a2e] safe-area-inset">

      {/* ─── IDLE: Parkway Landing Page ─── */}
      {state === 'idle' && (
        <div className="flex flex-1 flex-col">
          {/* Header */}
          <div className="px-6 pt-10 pb-6 text-center">
            <div className="inline-flex items-center gap-2 mb-4">
              <div className="w-10 h-10 rounded-lg bg-amber-500 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2 22l2-6 8-8 4 4-8 8-6 2z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 6l4-4 4 4-4 4" />
                </svg>
              </div>
              <span className="text-lg font-bold text-white tracking-wide">PARKWAY</span>
            </div>
            <h1 className="text-3xl font-extrabold text-white leading-tight">
              Daily Field Report
            </h1>
            <p className="mt-2 text-gray-400 text-sm">
              Call Roxy to submit your end-of-day report
            </p>
          </div>

          {/* Checklist Card */}
          <div className="mx-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-white/10">
              <p className="text-xs font-semibold text-amber-400 uppercase tracking-widest">Have Ready</p>
            </div>
            <div className="px-5 py-4 space-y-3.5">
              {CHECKLIST.map((item) => (
                <div key={item.label} className="flex items-center gap-3">
                  <ChecklistIcon type={item.icon} />
                  <span className="text-sm text-gray-200">{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="mx-4 mt-4">
              <ErrorMessage message={error} onDismiss={handleDismissError} />
            </div>
          )}

          {/* CTA */}
          <div className="flex-1" />
          <div className="px-4 pb-8 pt-6">
            <button
              onClick={handleStartReport}
              className="relative w-full h-16 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 text-white font-bold text-lg shadow-lg shadow-amber-500/25 transition-all active:scale-[0.97] hover:shadow-amber-500/40"
            >
              <span className="flex items-center justify-center gap-3">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                Call Roxy
              </span>
            </button>
            <p className="text-center text-xs text-gray-500 mt-3">
              Roxy will walk you through the report
            </p>
          </div>

          <footer className="pb-4 text-center text-[11px] text-gray-600">
            Parkway Construction &middot; SiteLogix
          </footer>
        </div>
      )}

      {/* ─── VOICE: Active Call ─── */}
      {state === 'voice' && (
        <div className="flex flex-1 flex-col items-center justify-center px-4">
          <div className="w-full max-w-sm">
            <div className="text-center mb-6">
              <p className="text-xs font-semibold text-amber-400 uppercase tracking-widest">Live Call</p>
            </div>
            <div className="rounded-2xl bg-white/5 border border-white/10 p-8">
              <VoiceSession
                onComplete={handleVoiceComplete}
                onError={handleVoiceError}
                onCancel={handleVoiceCancel}
              />
            </div>
          </div>
        </div>
      )}

      {/* ─── COMPLETE: Thank You Screen ─── */}
      {state === 'complete' && showView === 'none' && (
        <div className="flex flex-1 flex-col items-center justify-center px-4">
          <div className="w-full max-w-sm text-center space-y-6">
            {/* Success icon */}
            <div className="relative inline-block">
              <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
                <svg className="w-10 h-10 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="absolute inset-0 w-20 h-20 rounded-full bg-green-400/20 animate-ping mx-auto" style={{ animationDuration: '2s' }} />
            </div>

            <div>
              <h2 className="text-2xl font-bold text-white">Report Submitted</h2>
              <p className="mt-2 text-gray-400 text-sm">
                Your daily report has been saved. Audio and transcript are being processed.
              </p>
            </div>

            {/* Progress bar */}
            <ProgressTracker reportReady={!!report} />

            {/* Action buttons */}
            <div className="space-y-3">
              <button
                onClick={() => { fetchReport(); setShowView('report') }}
                disabled={reportLoading && !report}
                className="w-full h-14 rounded-2xl bg-white/10 border border-white/20 text-white font-semibold text-sm transition-all hover:bg-white/15 active:scale-[0.97] flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                View Report Summary
              </button>

              <button
                onClick={() => { fetchReport(); setShowView('transcript') }}
                disabled={reportLoading && !report}
                className="w-full h-14 rounded-2xl bg-white/5 border border-white/10 text-gray-300 font-semibold text-sm transition-all hover:bg-white/10 active:scale-[0.97] flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
                Review Transcript
              </button>

              <button
                onClick={() => setState('idle')}
                className="w-full h-14 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 text-white font-bold text-sm shadow-lg shadow-amber-500/25 transition-all active:scale-[0.97] flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Submit Another Report
              </button>
            </div>

            <p className="text-xs text-gray-600">
              You&apos;re all set for today.
            </p>
          </div>
        </div>
      )}

      {/* ─── REPORT SUMMARY VIEW ─── */}
      {state === 'complete' && showView === 'report' && (
        <div className="flex flex-1 flex-col px-4 pt-6 pb-8">
          <button onClick={() => setShowView('none')} className="flex items-center gap-1 text-sm text-amber-400 mb-4 self-start">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>

          {!report ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-200 border-t-amber-500" />
              <p className="text-gray-400 text-sm">Loading report...</p>
            </div>
          ) : (
            <div className="space-y-4 max-w-lg mx-auto w-full">
              <div className="rounded-xl bg-white/5 border border-white/10 overflow-hidden">
                <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
                  <h3 className="font-bold text-white">Daily Report</h3>
                  <span className="text-xs text-amber-400 font-semibold">{report.jobSite}</span>
                </div>

                {/* Summary */}
                {report.summary && (
                  <div className="px-5 py-4 border-b border-white/5">
                    <p className="text-sm text-gray-300 leading-relaxed">{report.summary}</p>
                  </div>
                )}

                {/* Work Performed */}
                {report.workPerformed && report.workPerformed.length > 0 && (
                  <ReportBlock title="Work Performed">
                    {report.workPerformed.map((w, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                        <span className="text-sm text-gray-300">{w.description}{w.area ? ` (${w.area})` : ''}</span>
                      </div>
                    ))}
                  </ReportBlock>
                )}

                {/* Crew */}
                <ReportBlock title="Crew">
                  <div className="space-y-1.5">
                    {report.employees.map((e, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="text-gray-300">{e.normalizedName || e.name}</span>
                        <span className="text-gray-500">
                          {e.totalHours} hrs
                          {e.overtimeHours > 0 && <span className="text-amber-400 ml-1">({e.overtimeHours} OT)</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                </ReportBlock>

                {/* Safety */}
                {report.safety && report.safety.length > 0 && (
                  <ReportBlock title="Safety">
                    {report.safety.map((s, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className={`mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          s.type === 'incident' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'
                        }`}>
                          {s.type === 'near_miss' ? 'NEAR MISS' : s.type.toUpperCase()}
                        </span>
                        <div>
                          <p className="text-sm text-gray-300">{s.description}</p>
                          {s.actionTaken && <p className="text-xs text-gray-500 mt-0.5">Action: {s.actionTaken}</p>}
                        </div>
                      </div>
                    ))}
                  </ReportBlock>
                )}

                {/* Deliveries */}
                {report.deliveries && report.deliveries.length > 0 && (
                  <ReportBlock title="Deliveries">
                    {report.deliveries.map((d, i) => (
                      <p key={i} className="text-sm text-gray-300">
                        <span className="text-white font-medium">{d.vendor}</span> — {d.material}
                      </p>
                    ))}
                  </ReportBlock>
                )}

                {/* Weather */}
                {report.weatherConditions && (
                  <ReportBlock title="Weather">
                    <p className="text-sm text-gray-300">{report.weatherConditions}</p>
                  </ReportBlock>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── TRANSCRIPT VIEW ─── */}
      {state === 'complete' && showView === 'transcript' && (
        <div className="flex flex-1 flex-col px-4 pt-6 pb-8">
          <button onClick={() => setShowView('none')} className="flex items-center gap-1 text-sm text-amber-400 mb-4 self-start">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>

          {!report?.transcript ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-200 border-t-amber-500" />
              <p className="text-gray-400 text-sm">Loading transcript...</p>
            </div>
          ) : (
            <div className="space-y-3 max-w-lg mx-auto w-full">
              <h3 className="font-bold text-white text-sm">Conversation Transcript</h3>
              <div className="space-y-2.5 pb-4">
                {report.transcript
                  .filter(e => e.message)
                  .map((entry, i) => (
                  <div key={i} className={`flex ${entry.role === 'agent' ? 'justify-start' : 'justify-end'}`}>
                    <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                      entry.role === 'agent'
                        ? 'bg-white/10 rounded-bl-md'
                        : 'bg-amber-500/20 rounded-br-md'
                    }`}>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`text-[10px] font-bold ${entry.role === 'agent' ? 'text-amber-400' : 'text-gray-400'}`}>
                          {entry.role === 'agent' ? 'Roxy' : 'You'}
                        </span>
                        {entry.time_in_call_secs !== undefined && (
                          <span className="text-[10px] text-gray-600">
                            {Math.floor(entry.time_in_call_secs / 60)}:{String(Math.round(entry.time_in_call_secs) % 60).padStart(2, '0')}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-200 leading-relaxed">{entry.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── ERROR STATE ─── */}
      {state === 'error' && (
        <div className="flex flex-1 flex-col items-center justify-center px-4">
          {error && <ErrorMessage message={error} onDismiss={handleDismissError} />}
          {!error && (
            <div className="text-center space-y-4">
              <p className="text-gray-400">Something went wrong.</p>
              <button onClick={() => setState('idle')} className="text-amber-400 hover:underline text-sm">
                Try Again
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ProgressTracker({ reportReady }: { reportReady: boolean }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (reportReady) return
    const interval = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => clearInterval(interval)
  }, [reportReady])

  const steps = [
    { label: 'Report data saved', done: true },
    { label: 'Hours logged to payroll', done: true },
    { label: 'Audio uploading', done: elapsed > 8 || reportReady },
    { label: 'Transcript processing', done: reportReady },
  ]

  const completedCount = steps.filter(s => s.done).length
  const progress = reportReady ? 100 : Math.min(95, (completedCount / steps.length) * 100 + (elapsed * 1.5))

  return (
    <div className="rounded-xl bg-white/5 border border-white/10 overflow-hidden text-left">
      {/* Progress bar */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Processing</span>
          <span className="text-xs text-gray-500">{Math.round(progress)}%</span>
        </div>
        <div className="h-2 bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-1000 ease-out"
            style={{
              width: `${progress}%`,
              background: reportReady
                ? 'linear-gradient(90deg, #22c55e, #4ade80)'
                : 'linear-gradient(90deg, #f59e0b, #fbbf24)',
            }}
          />
        </div>
      </div>

      {/* Step checklist */}
      <div className="px-4 py-3 space-y-2.5">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center gap-3">
            {step.done ? (
              <svg className="h-4 w-4 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-amber-200/30 border-t-amber-400 flex-shrink-0" />
            )}
            <span className={`text-sm ${step.done ? 'text-gray-300' : 'text-gray-500'}`}>{step.label}</span>
          </div>
        ))}
      </div>

      {reportReady && (
        <div className="px-4 py-2 border-t border-white/5">
          <p className="text-xs text-green-400 text-center font-medium">Report ready to view</p>
        </div>
      )}
    </div>
  )
}

function ReportBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-5 py-3 border-b border-white/5 last:border-0">
      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

function ChecklistIcon({ type }: { type: string }) {
  const base = "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
  const iconClass = "w-4 h-4"

  switch (type) {
    case 'users':
      return (
        <div className={`${base} bg-blue-500/15`}>
          <svg className={`${iconClass} text-blue-400`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
      )
    case 'clock':
      return (
        <div className={`${base} bg-purple-500/15`}>
          <svg className={`${iconClass} text-purple-400`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
      )
    case 'site':
      return (
        <div className={`${base} bg-emerald-500/15`}>
          <svg className={`${iconClass} text-emerald-400`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
      )
    case 'truck':
      return (
        <div className={`${base} bg-amber-500/15`}>
          <svg className={`${iconClass} text-amber-400`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
          </svg>
        </div>
      )
    case 'alert':
      return (
        <div className={`${base} bg-orange-500/15`}>
          <svg className={`${iconClass} text-orange-400`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
      )
    case 'shield':
      return (
        <div className={`${base} bg-red-500/15`}>
          <svg className={`${iconClass} text-red-400`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
      )
    case 'cloud':
      return (
        <div className={`${base} bg-cyan-500/15`}>
          <svg className={`${iconClass} text-cyan-400`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
          </svg>
        </div>
      )
    default:
      return <div className={`${base} bg-gray-500/15`} />
  }
}
