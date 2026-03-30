import { NextResponse } from 'next/server'

/**
 * GET /api/debug/env
 * Diagnostic: show which AWS credential sources are available
 * REMOVE THIS AFTER DEBUGGING
 */
export async function GET() {
  // Check ALL env vars with AWS or credential-related prefixes
  const credentialVars = Object.entries(process.env)
    .filter(([k]) =>
      k.startsWith('AWS_') ||
      k.includes('CREDENTIAL') ||
      k.includes('ROLE') ||
      k.includes('TOKEN') ||
      k.includes('IDENTITY') ||
      k.startsWith('AMPLIFY_') ||
      k.startsWith('_AWS') ||
      k === 'DYNAMODB_TABLE_NAME' ||
      k === 'DYNAMO_REGION' ||
      k === 'DATA_ADAPTER'
    )
    .map(([k, v]) => {
      // Mask secret values
      if (k.includes('SECRET') || k.includes('KEY') || k.includes('TOKEN') || k.includes('CREDENTIAL')) {
        return [k, v ? `***${v.slice(-4)}` : 'undefined']
      }
      return [k, v]
    })

  return NextResponse.json({
    credentialVars: Object.fromEntries(credentialVars),
  })
}
