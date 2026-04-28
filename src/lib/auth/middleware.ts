import type { CognitoUser } from './cognito'

interface JwtHeader {
  kid: string
  alg: string
}

interface JwtPayload {
  sub: string
  email: string
  'custom:tenantId': string
  'custom:role': string
  token_use: string
  exp: number
  iss: string
}

let jwksCache: Record<string, JsonWebKey> | null = null

/**
 * Verify a Cognito JWT token and extract user info.
 * Uses the Cognito JWKS endpoint to verify the signature.
 */
export async function verifyToken(idToken: string): Promise<CognitoUser | null> {
  try {
    const parts = idToken.split('.')
    if (parts.length !== 3) return null

    const header: JwtHeader = JSON.parse(atob(parts[0]))
    const payload: JwtPayload = JSON.parse(atob(parts[1]))

    // Check expiration
    if (payload.exp * 1000 < Date.now()) return null

    // Check issuer
    const region = process.env.COGNITO_REGION || 'us-east-1'
    const userPoolId = process.env.COGNITO_USER_POOL_ID || ''
    const expectedIssuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`
    if (payload.iss !== expectedIssuer) return null

    // Check token_use
    if (payload.token_use !== 'id') return null

    // Verify signature using JWKS
    const jwks = await getJwks(expectedIssuer)
    const jwk = jwks[header.kid]
    if (!jwk) return null

    const key = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    )

    const signatureBytes = base64UrlDecode(parts[2])
    const dataBytes = new TextEncoder().encode(`${parts[0]}.${parts[1]}`)

    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      signatureBytes.buffer as ArrayBuffer,
      dataBytes.buffer as ArrayBuffer
    )

    if (!valid) return null

    return {
      sub: payload.sub,
      email: payload.email,
      tenantId: payload['custom:tenantId'] || '',
      role: (payload['custom:role'] || 'field_worker') as CognitoUser['role'],
    }
  } catch {
    return null
  }
}

async function getJwks(issuer: string): Promise<Record<string, JsonWebKey>> {
  if (jwksCache) return jwksCache

  const response = await fetch(`${issuer}/.well-known/jwks.json`)
  const data = await response.json()

  jwksCache = {}
  for (const key of data.keys) {
    jwksCache[key.kid] = key
  }

  return jwksCache
}

function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const binary = atob(base64 + padding)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}
