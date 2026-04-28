import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'

const COGNITO_REGION = process.env.COGNITO_REGION || 'us-east-1'
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || ''

async function cognitoAdminCall(action: string, payload: Record<string, unknown>) {
  const response = await fetch(`https://cognito-idp.${COGNITO_REGION}.amazonaws.com/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': `AWSCognitoIdentityProviderService.${action}`,
    },
    body: JSON.stringify(payload),
  })
  return response.json()
}

/**
 * GET /api/admin/users - List users for current tenant
 */
export async function GET() {
  try {
    const h = await headers()
    const userRole = h.get('x-user-role') || ''
    const tenantSlug = h.get('x-tenant-slug') || ''

    if (userRole !== 'admin' && userRole !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const data = await cognitoAdminCall('ListUsers', {
      UserPoolId: USER_POOL_ID,
      Filter: userRole === 'super_admin' ? undefined : `"custom:tenantId" = "${tenantSlug}"`,
      Limit: 60,
    })

    if (data.__type) {
      return NextResponse.json({ error: 'Failed to list users' }, { status: 500 })
    }

    const users = (data.Users || []).map((u: Record<string, unknown>) => {
      const attrs = u.Attributes as Array<{ Name: string; Value: string }> || []
      const getAttr = (name: string) => attrs.find(a => a.Name === name)?.Value || ''

      return {
        sub: getAttr('sub'),
        email: getAttr('email'),
        role: getAttr('custom:role') || 'field_worker',
        status: u.UserStatus,
        createdAt: u.UserCreateDate,
      }
    })

    return NextResponse.json({ users })
  } catch (error) {
    console.error('[Users] Error listing users:', error)
    return NextResponse.json({ error: 'Failed to list users' }, { status: 500 })
  }
}

/**
 * POST /api/admin/users - Invite a new user
 */
export async function POST(request: NextRequest) {
  try {
    const h = await headers()
    const userRole = h.get('x-user-role') || ''
    const tenantSlug = h.get('x-tenant-slug') || ''

    if (userRole !== 'admin' && userRole !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { email, role } = await request.json()

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    // Whitelist allowed roles - admins can only create admin or field_worker
    const allowedRoles = ['admin', 'field_worker']
    const assignRole = allowedRoles.includes(role) ? role : 'field_worker'

    // super_admin can only be created via CLI
    if (role === 'super_admin') {
      return NextResponse.json({ error: 'Cannot create super_admin via UI' }, { status: 400 })
    }

    const data = await cognitoAdminCall('AdminCreateUser', {
      UserPoolId: USER_POOL_ID,
      Username: email,
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'email_verified', Value: 'true' },
        { Name: 'custom:tenantId', Value: tenantSlug },
        { Name: 'custom:role', Value: assignRole },
      ],
      DesiredDeliveryMediums: ['EMAIL'],
    })

    if (data.__type) {
      const errorType = data.__type?.split('#').pop() || 'Error'
      if (errorType === 'UsernameExistsException') {
        return NextResponse.json({ error: 'User already exists' }, { status: 409 })
      }
      return NextResponse.json({ error: data.message || 'Failed to create user' }, { status: 500 })
    }

    return NextResponse.json({ success: true, user: { email, role: assignRole } })
  } catch (error) {
    console.error('[Users] Error creating user:', error)
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
  }
}
