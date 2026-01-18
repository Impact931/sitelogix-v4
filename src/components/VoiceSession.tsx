'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

interface VoiceSessionProps {
  onComplete: (data: ConversationResult) => void
  onError: (error: string) => void
  onCancel: () => void
}

interface ConversationResult {
  transcript?: string
  data?: Record<string, unknown>
}

type SessionState = 'connecting' | 'active' | 'processing' | 'complete' | 'error'

export default function VoiceSession({ onComplete, onError, onCancel }: VoiceSessionProps) {
  const [state, setState] = useState<SessionState>('connecting')
  const [statusMessage, setStatusMessage] = useState('Connecting to Roxy...')
  const conversationRef = useRef<unknown>(null)
  const hasInitializedRef = useRef(false)

  const endConversation = useCallback(async () => {
    if (conversationRef.current) {
      try {
        // @ts-expect-error - ElevenLabs SDK types
        await conversationRef.current.endSession()
      } catch (err) {
        console.error('Error ending conversation:', err)
      }
      conversationRef.current = null
    }
    onCancel()
  }, [onCancel])

  useEffect(() => {
    if (hasInitializedRef.current) return
    hasInitializedRef.current = true

    async function initSession() {
      try {
        // Get signed URL from our API
        const response = await fetch('/api/voice/session', {
          method: 'POST',
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || 'Failed to initialize session')
        }

        const { signedUrl } = await response.json()

        // Dynamically import ElevenLabs SDK (client-side only)
        const { Conversation } = await import('@elevenlabs/client')

        // Request microphone permission
        await navigator.mediaDevices.getUserMedia({ audio: true })

        // Start the conversation
        const conversation = await Conversation.startSession({
          signedUrl,
          onConnect: () => {
            console.log('[ElevenLabs] Connected to Roxy')
            setState('active')
            setStatusMessage('Roxy is listening...')
          },
          onDisconnect: () => {
            console.log('[ElevenLabs] Disconnected - session complete')
            setState('complete')
            setStatusMessage('Report submitted successfully!')
            onComplete({})
          },
          onMessage: (message: { source: string; message: string }) => {
            console.log('[ElevenLabs Message]:', message)
            if (message.source === 'ai') {
              setStatusMessage(message.message.substring(0, 100) + '...')
            }
          },
          onError: (message: string, context?: unknown) => {
            console.error('[ElevenLabs Error]:', message, context)
            setState('error')
            onError(message || 'Voice session error')
          },
        })

        conversationRef.current = conversation
      } catch (err) {
        console.error('Session init error:', err)
        setState('error')

        if (err instanceof Error) {
          if (err.name === 'NotAllowedError') {
            onError('Microphone access denied. Please allow microphone access to use voice reporting.')
          } else {
            onError(err.message)
          }
        } else {
          onError('Failed to start voice session')
        }
      }
    }

    initSession()

    // Cleanup on unmount
    return () => {
      if (conversationRef.current) {
        // @ts-expect-error - ElevenLabs SDK types
        conversationRef.current.endSession?.()
      }
    }
  }, [onComplete, onError])

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Voice Indicator */}
      <div className="relative">
        {state === 'connecting' && (
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-blue-100">
            <div className="h-16 w-16 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
          </div>
        )}

        {state === 'active' && (
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-green-100">
            <div className="relative">
              <div className="h-16 w-16 rounded-full bg-green-500 animate-pulse" />
              <div className="absolute inset-0 h-16 w-16 rounded-full bg-green-400 animate-ping opacity-75" />
            </div>
          </div>
        )}

        {state === 'processing' && (
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-yellow-100">
            <div className="h-16 w-16 animate-spin rounded-full border-4 border-yellow-200 border-t-yellow-600" />
          </div>
        )}

        {state === 'error' && (
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-red-100">
            <svg
              className="h-12 w-12 text-red-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
        )}
      </div>

      {/* Status Message */}
      <div className="text-center">
        <p className="text-lg font-medium text-gray-800">
          {state === 'connecting' && 'Connecting to Roxy...'}
          {state === 'active' && 'Roxy is listening'}
          {state === 'processing' && 'Processing...'}
          {state === 'error' && 'Connection Error'}
        </p>
        <p className="mt-1 text-sm text-gray-600 max-w-xs">
          {statusMessage}
        </p>
      </div>

      {/* Controls */}
      {(state === 'active' || state === 'connecting') && (
        <button
          onClick={endConversation}
          className="flex h-12 items-center justify-center gap-2 rounded-xl border-2 border-red-500 px-6 text-red-600 transition-colors hover:bg-red-50 active:bg-red-100"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
          End Call
        </button>
      )}
    </div>
  )
}
