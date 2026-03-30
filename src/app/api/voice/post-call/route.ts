import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/voice/post-call
 *
 * Lightweight pass-through for post-call webhooks.
 *
 * NOTE: Heavy processing (audio download, transcript upload, DynamoDB writes)
 * is handled by the `roxy-post-call-handler` Lambda which has proper AWS credentials.
 * Configure ElevenLabs post-call webhook to point to the Lambda Function URL directly.
 *
 * This endpoint is kept as a fallback/health-check.
 */
export async function POST(request: NextRequest) {
  try {
    const payload = await request.json()

    console.log('[PostCall] Webhook received (passthrough):', {
      type: payload.type,
      conversation_id: payload.data?.conversation_id || payload.conversation_id,
    })

    // Forward to Lambda Function URL for processing
    const lambdaUrl = process.env.POST_CALL_LAMBDA_URL
    if (lambdaUrl) {
      try {
        const lambdaResponse = await fetch(lambdaUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const result = await lambdaResponse.json()
        return NextResponse.json(result)
      } catch (lambdaError) {
        console.error('[PostCall] Lambda forward failed:', lambdaError)
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Post-call data received. Configure ElevenLabs to point directly to Lambda for full processing.',
    })
  } catch (error) {
    console.error('[PostCall] Error:', error)
    return NextResponse.json({ success: false, error: 'Failed to process' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: 'voice-post-call',
    note: 'Heavy processing handled by roxy-post-call-handler Lambda',
  })
}
