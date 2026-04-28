'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { useTenant } from '@/lib/tenant/context'
import { useSearchParams, useRouter } from 'next/navigation'

export default function LoginPage() {
  const tenant = useTenant()
  const searchParams = useSearchParams()
  const router = useRouter()
  const redirect = searchParams.get('redirect') || '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Login failed')
        setLoading(false)
        return
      }

      router.push(redirect)
    } catch {
      setError('Network error. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-neutral-950 safe-area-inset">
      <div className="flex flex-1 flex-col w-full max-w-[430px] mx-auto">
        {/* Top accent bar */}
        <div
          className="h-1"
          style={{
            background: `linear-gradient(90deg, ${tenant.primaryColor}, ${tenant.primaryColor}cc, ${tenant.primaryColor})`,
          }}
        />

        <div className="flex flex-1 flex-col items-center justify-center px-8">
          {/* Logo + branding */}
          <div
            className="transition-all duration-700 ease-out"
            style={{
              opacity: mounted ? 1 : 0,
              transform: mounted ? 'translateY(0)' : 'translateY(12px)',
            }}
          >
            <Image
              src={tenant.logo}
              alt={tenant.name}
              width={80}
              height={80}
              className="rounded-2xl shadow-2xl mx-auto mb-6"
              style={{
                boxShadow: `0 25px 50px -12px ${tenant.primaryColor}15`,
              }}
              priority
            />
          </div>

          <div
            className="transition-all duration-700 ease-out delay-100"
            style={{
              opacity: mounted ? 1 : 0,
              transform: mounted ? 'translateY(0)' : 'translateY(12px)',
            }}
          >
            <h1 className="text-[22px] font-extrabold text-white tracking-tight text-center">
              Sign in to SiteLogix
            </h1>
            <p className="mt-1.5 text-neutral-500 text-[13px] text-center">
              {tenant.name}
            </p>
          </div>

          {/* Login form */}
          <form
            onSubmit={handleSubmit}
            className="w-full mt-8 space-y-4 transition-all duration-700 ease-out delay-200"
            style={{
              opacity: mounted ? 1 : 0,
              transform: mounted ? 'translateY(0)' : 'translateY(12px)',
            }}
          >
            <div>
              <label htmlFor="email" className="block text-[11px] font-bold text-neutral-500 uppercase tracking-[0.12em] mb-2">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-[50px] rounded-xl bg-neutral-900 border border-neutral-800 px-4 text-[14px] text-white placeholder-neutral-600 outline-none transition-all focus:border-neutral-600 focus:ring-1 focus:ring-neutral-700"
                style={{
                  // @ts-expect-error CSS custom property
                  '--tw-ring-color': `${tenant.primaryColor}40`,
                }}
                placeholder="you@company.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-[11px] font-bold text-neutral-500 uppercase tracking-[0.12em] mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-[50px] rounded-xl bg-neutral-900 border border-neutral-800 px-4 text-[14px] text-white placeholder-neutral-600 outline-none transition-all focus:border-neutral-600 focus:ring-1 focus:ring-neutral-700"
                placeholder="Enter password"
                minLength={8}
              />
            </div>

            {error && (
              <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3">
                <p className="text-[13px] text-red-400">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-[52px] rounded-xl font-extrabold text-[14px] tracking-wide shadow-xl transition-all active:scale-[0.97] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{
                backgroundColor: tenant.primaryColor,
                color: tenant.accentColor,
                boxShadow: `0 20px 40px -12px ${tenant.primaryColor}30`,
              }}
            >
              {loading ? (
                <div
                  className="h-5 w-5 animate-spin rounded-full border-2 border-t-transparent"
                  style={{ borderColor: `${tenant.accentColor}40`, borderTopColor: tenant.accentColor }}
                />
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                  </svg>
                  Sign In
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="px-5 pb-8">
          <footer className="text-center">
            <span className="text-[10px] text-neutral-700 tracking-widest uppercase">
              SiteLogix Field Reporting
            </span>
          </footer>
        </div>
      </div>
    </div>
  )
}
