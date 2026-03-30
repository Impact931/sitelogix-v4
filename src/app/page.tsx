'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import ErrorMessage from '@/components/ErrorMessage'

// Dynamically import VoiceSession to avoid SSR issues with audio APIs
const VoiceSession = dynamic(() => import('@/components/VoiceSession'), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center gap-4">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
      <p className="text-gray-600">Loading voice module...</p>
    </div>
  ),
})

type AppState = 'idle' | 'voice' | 'complete' | 'error'

export default function Home() {
  const [state, setState] = useState<AppState>('idle')
  const [error, setError] = useState<string | null>(null)

  const handleStartReport = async () => {
    setError(null)

    // Request microphone permission on user gesture (required for iOS)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      // Stop the stream immediately - we just needed permission
      stream.getTracks().forEach(track => track.stop())
      setState('voice')
    } catch (err) {
      console.error('Microphone permission error:', err)
      if (err instanceof Error && err.name === 'NotAllowedError') {
        setError('Microphone access denied. Please allow microphone access in your browser settings to use voice reporting.')
      } else {
        setError('Could not access microphone. Please check your device settings.')
      }
      setState('error')
    }
  }

  const handleVoiceComplete = () => {
    setState('complete')
  }

  const handleVoiceError = (errorMessage: string) => {
    setError(errorMessage)
    setState('error')
  }

  const handleVoiceCancel = () => {
    setState('idle')
  }

  const handleDismissError = () => {
    setError(null)
    setState('idle')
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-blue-50 to-white px-4 safe-area-inset">
      <main className="flex w-full max-w-md flex-col items-center gap-8 text-center">
        {/* Logo/Brand */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg">
            <svg
              className="h-8 w-8"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
              />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">SiteLogix</h1>
          <p className="text-gray-600">Voice-First Daily Reporting</p>
        </div>

        {/* Error Display */}
        {error && (
          <ErrorMessage message={error} onDismiss={handleDismissError} />
        )}

        {/* Main Content Based on State */}
        {state === 'idle' && (
          <div className="flex flex-col items-center gap-6">
            <p className="text-lg text-gray-700">
              Tap the button below to start your daily report with Roxy.
            </p>
            <button
              onClick={handleStartReport}
              className="flex h-16 w-full max-w-xs items-center justify-center gap-3 rounded-2xl bg-blue-600 px-8 text-lg font-semibold text-white shadow-lg transition-all hover:bg-blue-700 active:scale-95 active:bg-blue-800"
            >
              <svg
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                />
              </svg>
              Start Daily Report
            </button>
          </div>
        )}

        {state === 'voice' && (
          <VoiceSession
            onComplete={handleVoiceComplete}
            onError={handleVoiceError}
            onCancel={handleVoiceCancel}
          />
        )}

        {state === 'complete' && (
          <div className="flex flex-col items-center gap-6 animate-in fade-in">
            {/* Animated checkmark */}
            <div className="relative">
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-green-100 shadow-lg shadow-green-100/50">
                <svg
                  className="h-12 w-12 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <div className="absolute inset-0 h-24 w-24 rounded-full bg-green-200 animate-ping opacity-20" />
            </div>

            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold text-gray-900">Report Submitted!</h2>
              <p className="text-gray-600 max-w-xs">
                Your daily report has been saved to the system. Audio recording and transcript are being processed.
              </p>
            </div>

            {/* Processing status */}
            <div className="w-full max-w-xs bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 space-y-2.5">
                <StatusRow icon="check" label="Report data saved" done />
                <StatusRow icon="check" label="Hours logged to payroll" done />
                <StatusRow icon="spinner" label="Recording uploading..." />
                <StatusRow icon="spinner" label="Transcript processing..." />
              </div>
              <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-100">
                <p className="text-xs text-gray-500 text-center">
                  Files will be available in the admin dashboard shortly
                </p>
              </div>
            </div>

            <div className="flex flex-col items-center gap-3 w-full max-w-xs">
              <button
                onClick={() => setState('idle')}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-8 text-lg font-semibold text-white shadow-lg transition-all hover:bg-blue-700 active:scale-95 active:bg-blue-800"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Submit Another Report
              </button>
              <p className="text-xs text-gray-400">
                You&apos;re all set for today. See you tomorrow!
              </p>
            </div>
          </div>
        )}

        {state === 'error' && !error && (
          <div className="flex flex-col items-center gap-4">
            <p className="text-gray-600">Something went wrong.</p>
            <button
              onClick={() => setState('idle')}
              className="text-blue-600 hover:underline"
            >
              Try Again
            </button>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="absolute bottom-4 text-sm text-gray-400">
        Parkway Construction
      </footer>
    </div>
  )
}

function StatusRow({ icon, label, done = false }: { icon: 'check' | 'spinner'; label: string; done?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      {done ? (
        <svg className="h-4 w-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600 flex-shrink-0" />
      )}
      <span className={`text-sm ${done ? 'text-gray-700' : 'text-gray-500'}`}>{label}</span>
    </div>
  )
}
