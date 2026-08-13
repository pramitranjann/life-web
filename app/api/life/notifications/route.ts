import { NextRequest, NextResponse } from 'next/server'

import { isAuthenticatedLifeRequest, unauthorizedJson } from '@/lib/life/auth'
import { getLifeNotifications } from '@/lib/life/notifications'

export async function GET(request: NextRequest) {
  if (!isAuthenticatedLifeRequest(request)) {
    return unauthorizedJson()
  }

  const after = request.nextUrl.searchParams.get('after')
  if (after && Number.isNaN(Date.parse(after))) {
    return NextResponse.json({ error: 'after must be an ISO-8601 timestamp.' }, { status: 400 })
  }

  const requestedLimit = Number(request.nextUrl.searchParams.get('limit') || 50)
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(100, Math.max(1, Math.trunc(requestedLimit)))
    : 50

  try {
    const notifications = await getLifeNotifications({
      after,
      unreadOnly: request.nextUrl.searchParams.get('unread') === 'true',
      limit,
    })

    return NextResponse.json({ notifications })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load notifications.' },
      { status: 500 },
    )
  }
}
