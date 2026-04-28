'use client'

import { useRouter } from 'next/navigation'

export function AdminHeader({
  tenantName,
  accentColor,
  userEmail,
  userRole,
}: {
  tenantName: string
  accentColor: string
  userEmail: string
  userRole: string
}) {
  const router = useRouter()

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  return (
    <header className="text-white shadow-md" style={{ backgroundColor: accentColor }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight">SiteLogix</h1>
            <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">Admin</span>
            <span className="text-xs text-white/60 hidden sm:inline">
              {tenantName}
            </span>
          </div>
          <div className="flex items-center gap-6">
            <nav className="flex items-center gap-6 text-sm">
              <a href="/admin" className="hover:text-blue-200 transition-colors">
                Dashboard
              </a>
              <a href="/admin/users" className="hover:text-blue-200 transition-colors">
                Users
              </a>
            </nav>
            <div className="flex items-center gap-3 border-l border-white/20 pl-4">
              <div className="text-right hidden sm:block">
                <p className="text-xs text-white/80 truncate max-w-[160px]">{userEmail}</p>
                <p className="text-[10px] text-white/50 uppercase tracking-wide">
                  {userRole === 'super_admin' ? 'Super Admin' : userRole === 'admin' ? 'Admin' : 'Field Worker'}
                </p>
              </div>
              <button
                onClick={handleLogout}
                className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-md transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
