'use client'

import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import ErrorMessage from '@/components/ErrorMessage'

const VoiceSession = dynamic(() => import('@/components/VoiceSession'), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center gap-4 py-12">
      <div className="h-10 w-10 animate-spin rounded-full border-3 border-yellow-400/30 border-t-yellow-400" />
      <p className="text-neutral-400 text-sm">Connecting...</p>
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

const CHECKLIST_ITEMS = [
  'Personnel on site',
  'Hours per person',
  'Job site name',
  'Deliveries received',
  'Delays or issues',
  'Safety incidents',
  'Weather conditions',
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
    const interval = setInterval(fetchReport, 5000)
    fetchReport()
    const timeout = setTimeout(() => clearInterval(interval), 60000)
    return () => { clearInterval(interval); clearTimeout(timeout) }
  }, [state, conversationId, report, fetchReport])

  return (
    <div className="flex min-h-screen flex-col bg-neutral-950 safe-area-inset">

      {/* ═══════════════════════════════════════════
          IDLE — Landing Page
          ═══════════════════════════════════════════ */}
      {state === 'idle' && (
        <div className="flex flex-1 flex-col">
          {/* Top bar accent */}
          <div className="h-1 bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-400" />

          {/* Logo + Title */}
          <div className="flex flex-col items-center pt-12 pb-8 px-6">
            <Image
              src="/parkway-logo.png"
              alt="Parkway Construction Services"
              width={80}
              height={80}
              className="rounded-2xl shadow-2xl shadow-yellow-400/10 mb-5"
            />
            <h1 className="text-2xl font-extrabold text-white tracking-tight">
              Daily Field Report
            </h1>
            <p className="mt-1.5 text-neutral-500 text-sm">
              Call Roxy to submit your end-of-day report
            </p>
          </div>

          {/* Checklist */}
          <div className="mx-5 rounded-2xl bg-neutral-900 border border-neutral-800 overflow-hidden">
            <div className="px-5 py-3 border-b border-neutral-800 flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
              <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-[0.15em]">Have Ready</p>
            </div>
            <div className="px-5 py-4">
              {CHECKLIST_ITEMS.map((item, i) => (
                <div key={item} className={`flex items-center gap-3.5 py-2.5 ${i < CHECKLIST_ITEMS.length - 1 ? 'border-b border-neutral-800/60' : ''}`}>
                  <div className="w-5 h-5 rounded border-2 border-neutral-700 flex items-center justify-center flex-shrink-0">
                    <div className="w-2 h-2 rounded-sm bg-yellow-400/0" />
                  </div>
                  <span className="text-[13px] text-neutral-300">{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="mx-5 mt-4">
              <ErrorMessage message={error} onDismiss={handleDismissError} />
            </div>
          )}

          {/* CTA area */}
          <div className="flex-1 min-h-[60px]" />
          <div className="px-5 pb-6">
            <button
              onClick={handleStartReport}
              className="w-full h-[56px] rounded-xl bg-yellow-400 text-black font-bold text-[15px] tracking-wide shadow-lg shadow-yellow-400/20 transition-all active:scale-[0.98] active:shadow-yellow-400/10 hover:bg-yellow-300 flex items-center justify-center gap-2.5"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              Call Roxy
            </button>
            <p className="text-center text-[11px] text-neutral-600 mt-3">
              Roxy will walk you through the report
            </p>
          </div>

          <footer className="pb-5 text-center">
            <span className="text-[10px] text-neutral-700 tracking-wider uppercase">Parkway Construction Services</span>
          </footer>
        </div>
      )}

      {/* ═══════════════════════════════════════════
          VOICE — Active Call
          ═══════════════════════════════════════════ */}
      {state === 'voice' && (
        <div className="flex flex-1 flex-col">
          <div className="h-1 bg-gradient-to-r from-green-400 via-green-500 to-green-400" />
          <div className="flex flex-1 flex-col items-center justify-center px-5">
            <div className="w-full max-w-sm">
              <div className="flex items-center justify-center gap-2 mb-5">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-[11px] font-bold text-green-400 uppercase tracking-[0.15em]">Live Call</span>
              </div>
              <div className="rounded-2xl bg-neutral-900 border border-neutral-800 p-6">
                <VoiceSession
                  onComplete={handleVoiceComplete}
                  onError={handleVoiceError}
                  onCancel={handleVoiceCancel}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════
          COMPLETE — Thank You + Progress
          ═══════════════════════════════════════════ */}
      {state === 'complete' && showView === 'none' && (
        <div className="flex flex-1 flex-col">
          <div className="h-1 bg-gradient-to-r from-green-400 via-emerald-500 to-green-400" />
          <div className="flex flex-1 flex-col items-center justify-center px-5">
            <div className="w-full max-w-sm space-y-6">
              {/* Success */}
              <div className="text-center pt-2">
                <div className="inline-flex w-16 h-16 rounded-full bg-green-500/15 items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-white">Report Submitted</h2>
                <p className="mt-1.5 text-neutral-500 text-sm">Audio and transcript are being processed</p>
              </div>

              {/* Progress bar */}
              <ProgressTracker reportReady={!!report} />

              {/* Actions */}
              <div className="space-y-2.5 pt-1">
                <button
                  onClick={() => { fetchReport(); setShowView('report') }}
                  disabled={reportLoading && !report}
                  className="w-full h-[48px] rounded-xl bg-neutral-900 border border-neutral-800 text-white font-semibold text-[13px] transition-all hover:bg-neutral-800 active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  View Report Summary
                </button>

                <button
                  onClick={() => { fetchReport(); setShowView('transcript') }}
                  disabled={reportLoading && !report}
                  className="w-full h-[48px] rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-400 font-semibold text-[13px] transition-all hover:bg-neutral-800 active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                  Review Transcript
                </button>

                <button
                  onClick={() => setState('idle')}
                  className="w-full h-[48px] rounded-xl bg-yellow-400 text-black font-bold text-[13px] shadow-lg shadow-yellow-400/15 transition-all active:scale-[0.98] hover:bg-yellow-300 flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Submit Another Report
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════
          REPORT SUMMARY VIEW
          ═══════════════════════════════════════════ */}
      {state === 'complete' && showView === 'report' && (
        <div className="flex flex-1 flex-col">
          <div className="h-1 bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-400" />
          <div className="px-5 pt-5 pb-8 overflow-y-auto flex-1">
            <button onClick={() => setShowView('none')} className="flex items-center gap-1 text-sm text-yellow-400 mb-5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>

            {!report ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-yellow-400/30 border-t-yellow-400" />
                <p className="text-neutral-500 text-sm">Loading report...</p>
              </div>
            ) : (
              <div className="max-w-lg mx-auto w-full space-y-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-white text-lg">Daily Report</h3>
                  <span className="text-xs font-bold text-yellow-400 bg-yellow-400/10 px-2.5 py-1 rounded-md">{report.jobSite}</span>
                </div>

                {/* Summary */}
                {report.summary && (
                  <div className="rounded-xl bg-neutral-900 border border-neutral-800 px-4 py-3.5">
                    <p className="text-[13px] text-neutral-300 leading-relaxed">{report.summary}</p>
                  </div>
                )}

                {/* Sections */}
                <div className="space-y-3">
                  {report.workPerformed && report.workPerformed.length > 0 && (
                    <DetailCard title="Work Performed">
                      {report.workPerformed.map((w, i) => (
                        <div key={i} className="flex items-start gap-2.5">
                          <div className="mt-1.5 w-1 h-1 rounded-full bg-yellow-400 flex-shrink-0" />
                          <span className="text-[13px] text-neutral-300">{w.description}{w.area ? ` (${w.area})` : ''}</span>
                        </div>
                      ))}
                    </DetailCard>
                  )}

                  <DetailCard title="Crew">
                    {report.employees.map((e, i) => (
                      <div key={i} className="flex justify-between text-[13px] py-0.5">
                        <span className="text-neutral-300">{e.normalizedName || e.name}</span>
                        <span className="text-neutral-500 tabular-nums">
                          {e.totalHours}h
                          {e.overtimeHours > 0 && <span className="text-yellow-400 ml-1">+{e.overtimeHours} OT</span>}
                        </span>
                      </div>
                    ))}
                  </DetailCard>

                  {report.safety && report.safety.length > 0 && (
                    <DetailCard title="Safety" accent="red">
                      {report.safety.map((s, i) => (
                        <div key={i}>
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              s.type === 'incident' ? 'bg-red-500/15 text-red-400' : 'bg-yellow-500/15 text-yellow-400'
                            }`}>
                              {s.type === 'near_miss' ? 'NEAR MISS' : s.type.toUpperCase()}
                            </span>
                            <span className="text-[13px] text-neutral-300">{s.description}</span>
                          </div>
                          {s.actionTaken && <p className="text-[11px] text-neutral-500 mt-1 ml-0.5">Action: {s.actionTaken}</p>}
                        </div>
                      ))}
                    </DetailCard>
                  )}

                  {report.deliveries && report.deliveries.length > 0 && (
                    <DetailCard title="Deliveries">
                      {report.deliveries.map((d, i) => (
                        <p key={i} className="text-[13px] text-neutral-300">
                          <span className="text-white font-medium">{d.vendor}</span>
                          <span className="text-neutral-600 mx-1.5">&middot;</span>
                          {d.material}
                        </p>
                      ))}
                    </DetailCard>
                  )}

                  {report.weatherConditions && (
                    <DetailCard title="Weather">
                      <p className="text-[13px] text-neutral-300">{report.weatherConditions}</p>
                    </DetailCard>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════
          TRANSCRIPT VIEW
          ═══════════════════════════════════════════ */}
      {state === 'complete' && showView === 'transcript' && (
        <div className="flex flex-1 flex-col">
          <div className="h-1 bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-400" />
          <div className="px-5 pt-5 pb-8 overflow-y-auto flex-1">
            <button onClick={() => setShowView('none')} className="flex items-center gap-1 text-sm text-yellow-400 mb-5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>

            {!report?.transcript ? (
              <div className="flex flex-col items-center justify-center gap-3 py-20">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-yellow-400/30 border-t-yellow-400" />
                <p className="text-neutral-500 text-sm">Loading transcript...</p>
              </div>
            ) : (
              <div className="max-w-lg mx-auto w-full">
                <h3 className="font-bold text-white text-sm mb-4">Conversation Transcript</h3>
                <div className="space-y-2">
                  {report.transcript
                    .filter(e => e.message)
                    .map((entry, i) => (
                    <div key={i} className={`flex ${entry.role === 'agent' ? 'justify-start' : 'justify-end'}`}>
                      <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${
                        entry.role === 'agent'
                          ? 'bg-neutral-900 border border-neutral-800 rounded-bl-md'
                          : 'bg-yellow-400/10 border border-yellow-400/20 rounded-br-md'
                      }`}>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={`text-[10px] font-bold ${entry.role === 'agent' ? 'text-yellow-400' : 'text-neutral-500'}`}>
                            {entry.role === 'agent' ? 'Roxy' : 'You'}
                          </span>
                          {entry.time_in_call_secs !== undefined && (
                            <span className="text-[10px] text-neutral-700 tabular-nums">
                              {Math.floor(entry.time_in_call_secs / 60)}:{String(Math.round(entry.time_in_call_secs) % 60).padStart(2, '0')}
                            </span>
                          )}
                        </div>
                        <p className="text-[13px] text-neutral-300 leading-relaxed">{entry.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════
          ERROR STATE
          ═══════════════════════════════════════════ */}
      {state === 'error' && (
        <div className="flex flex-1 flex-col items-center justify-center px-5">
          {error ? (
            <ErrorMessage message={error} onDismiss={handleDismissError} />
          ) : (
            <div className="text-center space-y-4">
              <p className="text-neutral-400">Something went wrong.</p>
              <button onClick={() => setState('idle')} className="text-yellow-400 hover:underline text-sm font-medium">
                Try Again
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────
   Progress Tracker Component
   ───────────────────────────────────────── */
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
    <div className="rounded-xl bg-neutral-900 border border-neutral-800 overflow-hidden">
      {/* Bar */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-[0.12em]">Processing</span>
          <span className="text-[10px] text-neutral-600 tabular-nums">{Math.round(progress)}%</span>
        </div>
        <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-1000 ease-out"
            style={{
              width: `${progress}%`,
              background: reportReady
                ? 'linear-gradient(90deg, #22c55e, #4ade80)'
                : 'linear-gradient(90deg, #eab308, #facc15)',
            }}
          />
        </div>
      </div>

      {/* Steps */}
      <div className="px-4 py-3 space-y-2">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center gap-2.5">
            {step.done ? (
              <svg className="h-3.5 w-3.5 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-neutral-700 border-t-yellow-400 flex-shrink-0" />
            )}
            <span className={`text-[12px] ${step.done ? 'text-neutral-400' : 'text-neutral-600'}`}>{step.label}</span>
          </div>
        ))}
      </div>

      {reportReady && (
        <div className="px-4 py-2 border-t border-neutral-800">
          <p className="text-[11px] text-green-400 text-center font-medium">Ready to view</p>
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────
   Detail Card Component
   ───────────────────────────────────────── */
function DetailCard({ title, accent, children }: { title: string; accent?: 'red'; children: React.ReactNode }) {
  return (
    <div className={`rounded-xl bg-neutral-900 border overflow-hidden ${accent === 'red' ? 'border-red-500/30' : 'border-neutral-800'}`}>
      <div className={`px-4 py-2.5 border-b ${accent === 'red' ? 'border-red-500/20 bg-red-500/5' : 'border-neutral-800'}`}>
        <p className={`text-[10px] font-bold uppercase tracking-[0.12em] ${accent === 'red' ? 'text-red-400' : 'text-neutral-500'}`}>{title}</p>
      </div>
      <div className="px-4 py-3 space-y-1.5">{children}</div>
    </div>
  )
}
