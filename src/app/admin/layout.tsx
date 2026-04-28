import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { getTenantConfig } from '@/lib/tenant/config'
import { AdminHeader } from './AdminHeader'

export const metadata: Metadata = {
  title: 'SiteLogix Admin',
  description: 'Admin dashboard for SiteLogix daily reports',
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const h = await headers()
  const tenantSlug = h.get('x-tenant-slug') || 'parkway'
  const userEmail = h.get('x-user-email') || ''
  const userRole = h.get('x-user-role') || ''
  const tenant = getTenantConfig(tenantSlug)

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminHeader
        tenantName={tenant?.name || 'SiteLogix'}
        accentColor={tenant?.accentColor || '#1e3a5f'}
        userEmail={userEmail}
        userRole={userRole}
      />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</main>
    </div>
  )
}
