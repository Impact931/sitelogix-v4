/**
 * Seed initial Cognito users
 *
 * Creates:
 * 1. Jayson (super_admin) - access to all tenants
 * 2. Demo admin for JR Construction
 *
 * Usage: npx tsx scripts/seed-users.ts
 *
 * Prerequisites:
 * - COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID set in environment
 * - AWS credentials configured (CLI or env vars)
 */

const REGION = process.env.COGNITO_REGION || 'us-east-1'
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID

if (!USER_POOL_ID) {
  console.error('COGNITO_USER_POOL_ID is required')
  process.exit(1)
}

interface UserSeed {
  email: string
  tempPassword: string
  tenantId: string
  role: 'super_admin' | 'admin' | 'field_worker'
}

const USERS: UserSeed[] = [
  {
    email: 'jayson@jhr-photography.com',
    tempPassword: 'TempPass123!',
    tenantId: 'parkway',
    role: 'super_admin',
  },
  {
    email: 'demo@jrconstruction.com',
    tempPassword: 'DemoPass123!',
    tenantId: 'jrconstruction',
    role: 'admin',
  },
]

async function cognitoCall(action: string, payload: Record<string, unknown>) {
  const response = await fetch(`https://cognito-idp.${REGION}.amazonaws.com/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': `AWSCognitoIdentityProviderService.${action}`,
    },
    body: JSON.stringify(payload),
  })
  return response.json()
}

async function createUser(user: UserSeed) {
  console.log(`Creating user: ${user.email} (${user.role}, tenant: ${user.tenantId})`)

  const result = await cognitoCall('AdminCreateUser', {
    UserPoolId: USER_POOL_ID,
    Username: user.email,
    TemporaryPassword: user.tempPassword,
    UserAttributes: [
      { Name: 'email', Value: user.email },
      { Name: 'email_verified', Value: 'true' },
      { Name: 'custom:tenantId', Value: user.tenantId },
      { Name: 'custom:role', Value: user.role },
    ],
    MessageAction: 'SUPPRESS', // Don't send welcome email for seed users
  })

  if (result.__type) {
    const errorType = result.__type.split('#').pop()
    if (errorType === 'UsernameExistsException') {
      console.log(`  User already exists, updating attributes...`)
      await cognitoCall('AdminUpdateUserAttributes', {
        UserPoolId: USER_POOL_ID,
        Username: user.email,
        UserAttributes: [
          { Name: 'custom:tenantId', Value: user.tenantId },
          { Name: 'custom:role', Value: user.role },
        ],
      })
      return
    }
    console.error(`  Error: ${result.message}`)
    return
  }

  console.log(`  Created successfully. Temp password: ${user.tempPassword}`)
}

async function seed() {
  console.log('Seeding Cognito users...\n')

  for (const user of USERS) {
    await createUser(user)
  }

  console.log('\nDone! Users will need to change password on first login.')
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
