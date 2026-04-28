import { NextRequest, NextResponse } from 'next/server'
import { getTenantFromHost } from '@/lib/tenant/utils'
import { verifyToken } from '@/lib/auth/middleware'

const PUBLIC_PATHS = ['/login', '/api/auth', '/_next', '/favicon.ico', '/manifest.json', '/icons']
const PUBLIC_API_PATHS = ['/api/voice/webhook', '/api/voice/post-call']

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(p => pathname.startsWith(p)) ||
    PUBLIC_API_PATHS.some(p => pathname.startsWith(p)) ||
    pathname.startsWith('/tenants/') ||
    /\.(png|jpg|jpeg|svg|ico|css|js|woff|woff2)$/.test(pathname)
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const hostname = request.headers.get('host') || ''

  // --- Tenant Resolution ---
  const tenant = getTenantFromHost(hostname)

  // If no tenant found on subdomain and it's not the apex domain, 404
  if (!tenant) {
    const isApex = hostname === 'sitelogix.ai' ||
      hostname === 'www.sitelogix.ai' ||
      hostname.endsWith('.amplifyapp.com') ||
      hostname === 'localhost:3000'

    if (!isApex) {
      return new NextResponse('Not Found', { status: 404 })
    }

    // Apex domain: default to parkway for now (future: marketing page)
    const defaultTenant = 'parkway'
    const headers = new Headers(request.headers)
    headers.set('x-tenant-slug', defaultTenant)

    if (isPublicPath(pathname)) {
      return NextResponse.next({ request: { headers } })
    }

    // Auth check for non-public paths
    return await checkAuth(request, headers, defaultTenant)
  }

  // Set tenant header
  const headers = new Headers(request.headers)
  headers.set('x-tenant-slug', tenant.slug)

  // Public paths bypass auth
  if (isPublicPath(pathname)) {
    return NextResponse.next({ request: { headers } })
  }

  // Auth check
  return await checkAuth(request, headers, tenant.slug)
}

async function checkAuth(
  request: NextRequest,
  headers: Headers,
  tenantSlug: string
): Promise<NextResponse> {
  const idToken = request.cookies.get('sitelogix_id_token')?.value

  if (!idToken) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', request.nextUrl.pathname)
    return NextResponse.redirect(loginUrl)
  }

  const user = await verifyToken(idToken)

  if (!user) {
    // Token invalid or expired — redirect to login
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', request.nextUrl.pathname)
    const response = NextResponse.redirect(loginUrl)
    response.cookies.delete('sitelogix_id_token')
    response.cookies.delete('sitelogix_access_token')
    response.cookies.delete('sitelogix_refresh_token')
    return response
  }

  // Tenant isolation: user must belong to this tenant (super_admin bypasses)
  if (user.role !== 'super_admin' && user.tenantId !== tenantSlug) {
    return new NextResponse('Not Found', { status: 404 })
  }

  // Inject user info into headers for downstream use
  headers.set('x-user-sub', user.sub)
  headers.set('x-user-email', user.email)
  headers.set('x-user-role', user.role)
  headers.set('x-user-tenant', user.tenantId)

  return NextResponse.next({ request: { headers } })
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image).*)',
  ],
}
