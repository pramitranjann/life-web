import { NextRequest, NextResponse } from 'next/server'

import { isAuthenticatedLifeRequest, unauthorizedJson } from '@/lib/life/auth'
import { OWNER_ID } from '@/lib/life/constants'
import { syncCalendarEvents } from '@/lib/life/calendar'
import { getOwnerSettings } from '@/lib/life/settings'
import { getSupabaseAdmin } from '@/lib/life/supabase'
import { getTasks } from '@/lib/life/tasks'

export async function GET(request: NextRequest) {
  if (!isAuthenticatedLifeRequest(request)) {
    return unauthorizedJson()
  }

  const url = new URL(request.url)
  const start = url.searchParams.get('start')
  const end = url.searchParams.get('end')
  if (!start || !end) {
    return NextResponse.json({ error: 'start and end required' }, { status: 400 })
  }

  const settings = await getOwnerSettings()

  // The visible month grid spans up to ~6 weeks; sync that whole window so dots
  // reflect Google Calendar without per-day round-trips.
  void syncCalendarEvents(start, end).catch((error) => {
    console.error('Month calendar sync failed', error)
  })

  const supabase = getSupabaseAdmin()
  const [eventsResult, tasks] = await Promise.all([
    supabase
      .from('calendar_events')
      .select('*')
      .eq('user_id', OWNER_ID)
      .gte('local_date', start)
      .lte('local_date', end)
      .order('start_time', { ascending: true }),
    getTasks({ status: 'active' }),
  ])

  if (eventsResult.error) {
    return NextResponse.json({ error: eventsResult.error.message }, { status: 500 })
  }

  return NextResponse.json({
    start,
    end,
    timezone: settings.timezone,
    events: eventsResult.data || [],
    tasks,
  })
}
