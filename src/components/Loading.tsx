'use client'

interface LoadingProps {
  size?: 'small' | 'medium' | 'large'
  className?: string
}

export default function Loading({ size = 'medium', className = '' }: LoadingProps) {
  const sizeClasses = {
    small: 'h-5 w-5 border-2',
    medium: 'h-8 w-8 border-3',
    large: 'h-12 w-12 border-4',
  }

  return (
    <div
      className={`animate-spin rounded-full border-blue-200 border-t-blue-600 ${sizeClasses[size]} ${className}`}
      role="status"
      aria-label="Loading"
    >
      <span className="sr-only">Loading...</span>
    </div>
  )
}
