import { NextResponse } from 'next/server'

/**
 * GET /api/debug/env
 * Diagnostic: show which AWS credential sources are available
 * REMOVE THIS AFTER DEBUGGING
 */
export async function GET() {
  return NextResponse.json({
    hasAccessKey: !!process.env.AWS_ACCESS_KEY_ID,
    hasSecretKey: !!process.env.AWS_SECRET_ACCESS_KEY,
    hasSessionToken: !!process.env.AWS_SESSION_TOKEN,
    hasRegion: !!process.env.AWS_REGION,
    hasDynamoRegion: !!process.env.DYNAMO_REGION,
    dynamoTable: process.env.DYNAMODB_TABLE_NAME,
    dataAdapter: process.env.DATA_ADAPTER,
    awsExecutionEnv: process.env.AWS_EXECUTION_ENV,
    awsLambdaFunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
    // Check for Amplify-specific vars
    amplifyEnvVars: Object.keys(process.env).filter(k => k.startsWith('AMPLIFY_')),
  })
}
