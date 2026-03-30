import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'SiteLogix Admin',
  description: 'Admin dashboard for SiteLogix daily reports',
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#1e3a5f] text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold tracking-tight">SiteLogix</h1>
              <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">Admin</span>
            </div>
            <nav className="flex items-center gap-6 text-sm">
              <a href="/admin" className="hover:text-blue-200 transition-colors">
                Dashboard
              </a>
              <a href="/admin/reports" className="hover:text-blue-200 transition-colors">
                Reports
              </a>
            </nav>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</main>
    </div>
  )
}
