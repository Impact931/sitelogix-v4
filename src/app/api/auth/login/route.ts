import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser } from '@/lib/auth/cognito'

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
    }

    const tokens = await authenticateUser(email, password)

    const response = NextResponse.json({ success: true })

    // Set tokens in HttpOnly cookies
    const cookieOptions = {
      httpOnly: true,
      secure: true,
      sameSite: 'strict' as const,
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    }

    response.cookies.set('sitelogix_id_token', tokens.idToken, {
      ...cookieOptions,
      maxAge: 60 * 60, // 1 hour (matches Cognito ID token expiry)
    })
    response.cookies.set('sitelogix_access_token', tokens.accessToken, {
      ...cookieOptions,
      maxAge: 60 * 60,
    })
    response.cookies.set('sitelogix_refresh_token', tokens.refreshToken, cookieOptions)

    return response
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Authentication failed'
    return NextResponse.json({ error: message }, { status: 401 })
  }
}
