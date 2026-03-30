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

    console.log('[PostCall] Webhook received (passthrough only - no forwarding):', {
      type: payload.type,
      conversation_id: payload.data?.conversation_id || payload.conversation_id,
    })

    // NOTE: Do NOT forward to Lambda here. ElevenLabs should call the Lambda
    // Function URL directly to avoid duplicate processing (double audio uploads).
    // Lambda Function URL: https://o3wvj7vydnhiwwoiv4bjx6vida0wwjku.lambda-url.us-east-1.on.aws/

    return NextResponse.json({
      success: true,
      message: 'Post-call webhook received. Processing handled by Lambda Function URL directly.',
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
