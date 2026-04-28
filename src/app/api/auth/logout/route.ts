import { NextResponse } from 'next/server'

export async function POST() {
  const response = NextResponse.json({ success: true })

  response.cookies.delete('sitelogix_id_token')
  response.cookies.delete('sitelogix_access_token')
  response.cookies.delete('sitelogix_refresh_token')

  return response
}
