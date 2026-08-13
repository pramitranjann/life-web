import { NextRequest, NextResponse } from 'next/server'
import { getAdminCookieName } from '@/lib/admin-auth'
import { isSameOriginRequest } from '@/lib/security'

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 })
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set(getAdminCookieName(), '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
    priority: 'high',
  })
  return response
}
