import { getTenantConfig } from './config'
import type { TenantConfig } from './types'

export function getTenantFromHost(hostname: string): TenantConfig | null {
  // Extract subdomain: "parkway.sitelogix.ai" → "parkway"
  // Also handle: "parkway.localhost:3000" for local dev
  const parts = hostname.split('.')

  // Need at least subdomain.domain.tld (or subdomain.localhost)
  if (parts.length < 2) return null

  // Skip www
  if (parts[0] === 'www') return null

  // Skip bare domain (sitelogix.ai)
  if (parts.length === 2 && parts[1] !== 'localhost' && !parts[1].includes(':')) return null

  const slug = parts[0]
  return getTenantConfig(slug)
}

export function getTenantSlugFromHeaders(headers: Headers): string | null {
  return headers.get('x-tenant-slug')
}
