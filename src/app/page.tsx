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
          <div className="flex flex-col items-center gap-6">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
              <svg
                className="h-10 w-10 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Report Submitted!</h2>
            <p className="text-gray-600">
              Your daily report has been saved.
            </p>
            <button
              onClick={() => setState('idle')}
              className="flex h-12 items-center justify-center rounded-xl bg-blue-600 px-8 text-white transition-colors hover:bg-blue-700 active:bg-blue-800"
            >
              Start New Report
            </button>
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
