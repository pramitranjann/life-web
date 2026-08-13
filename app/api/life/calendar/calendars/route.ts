import { NextRequest, NextResponse } from 'next/server'

import { isAuthenticatedLifeRequest, unauthorizedJson } from '@/lib/life/auth'
import { listLifeCalendars } from '@/lib/life/calendar'

export async function GET(request: NextRequest) {
  if (!isAuthenticatedLifeRequest(request)) {
    return unauthorizedJson()
  }

  try {
    const calendars = await listLifeCalendars()
    return NextResponse.json({ calendars })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load calendars.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
