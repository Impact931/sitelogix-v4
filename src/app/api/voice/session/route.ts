import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/voice/session
 *
 * Creates a new ElevenLabs Conversational AI session.
 * Returns the signed URL for the frontend to connect to.
 */
export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.ELEVEN_LABS_API_KEY
    const agentId = process.env.ELEVEN_LABS_AGENT_ID

    if (!apiKey || !agentId) {
      console.error('Missing ElevenLabs configuration:', {
        hasApiKey: !!apiKey,
        hasAgentId: !!agentId
      })
      return NextResponse.json(
        { error: 'Voice service not configured' },
        { status: 500 }
      )
    }

    // Get the signed URL from ElevenLabs for the conversation
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${agentId}`,
      {
        method: 'GET',
        headers: {
          'xi-api-key': apiKey,
        },
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error('ElevenLabs API error:', response.status, errorText)
      return NextResponse.json(
        { error: 'Failed to initialize voice session' },
        { status: response.status }
      )
    }

    const data = await response.json()

    // Return the signed URL to the frontend
    return NextResponse.json({
      success: true,
      signedUrl: data.signed_url,
      agentId: agentId,
    })
  } catch (error) {
    console.error('Session creation error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/voice/session
 *
 * Health check for the voice session endpoint.
 */
export async function GET() {
  const hasApiKey = !!process.env.ELEVEN_LABS_API_KEY
  const hasAgentId = !!process.env.ELEVEN_LABS_AGENT_ID

  return NextResponse.json({
    status: 'ok',
    configured: hasApiKey && hasAgentId,
  })
}
