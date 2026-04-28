const COGNITO_CONFIG = {
  userPoolId: process.env.COGNITO_USER_POOL_ID || '',
  clientId: process.env.COGNITO_CLIENT_ID || '',
  region: process.env.COGNITO_REGION || 'us-east-1',
}

export function getCognitoConfig() {
  return COGNITO_CONFIG
}

export interface CognitoUser {
  sub: string
  email: string
  tenantId: string
  role: 'super_admin' | 'admin' | 'field_worker'
}

export interface AuthTokens {
  idToken: string
  accessToken: string
  refreshToken: string
  expiresAt: number
}

/**
 * Exchange username/password for Cognito tokens via InitiateAuth API
 */
export async function authenticateUser(email: string, password: string): Promise<AuthTokens> {
  const { clientId, region } = COGNITO_CONFIG

  const response = await fetch(`https://cognito-idp.${region}.amazonaws.com/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
    },
    body: JSON.stringify({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: clientId,
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password,
      },
    }),
  })

  const data = await response.json()

  if (data.__type || data.message) {
    const errorType = data.__type?.split('#').pop() || 'AuthError'
    if (errorType === 'NotAuthorizedException') {
      throw new Error('Invalid email or password')
    }
    if (errorType === 'UserNotFoundException') {
      throw new Error('Invalid email or password')
    }
    if (errorType === 'NewPasswordRequiredException') {
      throw new Error('Password change required. Contact your administrator.')
    }
    throw new Error(data.message || 'Authentication failed')
  }

  const result = data.AuthenticationResult
  if (!result) throw new Error('Authentication failed')

  return {
    idToken: result.IdToken,
    accessToken: result.AccessToken,
    refreshToken: result.RefreshToken,
    expiresAt: Date.now() + (result.ExpiresIn * 1000),
  }
}

/**
 * Refresh tokens using refresh token
 */
export async function refreshTokens(refreshToken: string): Promise<Omit<AuthTokens, 'refreshToken'>> {
  const { clientId, region } = COGNITO_CONFIG

  const response = await fetch(`https://cognito-idp.${region}.amazonaws.com/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
    },
    body: JSON.stringify({
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      ClientId: clientId,
      AuthParameters: {
        REFRESH_TOKEN: refreshToken,
      },
    }),
  })

  const data = await response.json()
  if (data.__type || !data.AuthenticationResult) {
    throw new Error('Token refresh failed')
  }

  const result = data.AuthenticationResult
  return {
    idToken: result.IdToken,
    accessToken: result.AccessToken,
    expiresAt: Date.now() + (result.ExpiresIn * 1000),
  }
}
