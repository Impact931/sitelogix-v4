'use client'

interface ErrorMessageProps {
  message: string
  onDismiss?: () => void
  className?: string
}

export default function ErrorMessage({ message, onDismiss, className = '' }: ErrorMessageProps) {
  return (
    <div
      className={`flex w-full items-start gap-3 rounded-xl bg-red-50 p-4 ${className}`}
      role="alert"
    >
      <svg
        className="h-5 w-5 shrink-0 text-red-500"
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
      <div className="flex-1">
        <p className="text-sm text-red-700">{message}</p>
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="shrink-0 text-red-400 hover:text-red-600 transition-colors"
          aria-label="Dismiss error"
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
        </button>
      )}
    </div>
  )
}
