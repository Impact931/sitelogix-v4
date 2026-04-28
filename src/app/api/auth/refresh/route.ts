import { NextRequest, NextResponse } from 'next/server'
import { refreshTokens } from '@/lib/auth/cognito'

export async function POST(request: NextRequest) {
  try {
    const refreshToken = request.cookies.get('sitelogix_refresh_token')?.value

    if (!refreshToken) {
      return NextResponse.json({ error: 'No refresh token' }, { status: 401 })
    }

    const tokens = await refreshTokens(refreshToken)

    const response = NextResponse.json({ success: true })

    const cookieOptions = {
      httpOnly: true,
      secure: true,
      sameSite: 'strict' as const,
      path: '/',
      maxAge: 60 * 60, // 1 hour
    }

    response.cookies.set('sitelogix_id_token', tokens.idToken, cookieOptions)
    response.cookies.set('sitelogix_access_token', tokens.accessToken, cookieOptions)

    return response
  } catch {
    const response = NextResponse.json({ error: 'Token refresh failed' }, { status: 401 })
    response.cookies.delete('sitelogix_id_token')
    response.cookies.delete('sitelogix_access_token')
    response.cookies.delete('sitelogix_refresh_token')
    return response
  }
}
