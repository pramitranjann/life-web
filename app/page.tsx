import { after } from 'next/server'
import { redirect } from 'next/navigation'

import { TodayScreen, type TodayEvent, type TodayTask, type TodayEntry } from '@/components/life/labs/TodayV2'
import { isAdminSession } from '@/lib/admin-auth'
import { OWNER_ID } from '@/lib/life/constants'
import { getProjectMap } from '@/lib/life/projects-db'
import { getEntryPresentation } from '@/lib/life/entries'
import { getOwnerSettings } from '@/lib/life/settings'
import { getSupabaseAdmin } from '@/lib/life/supabase'
import { generateMorningBrief } from '@/lib/life/synthesis'
import { getTasks } from '@/lib/life/tasks'
import {
  getCurrentLocalDate,
  getLocalTimeLabel,
  isMorningBriefWindow,
  localDateTimeToUtc,
} from '@/lib/life/time'
import type { CalendarEventRecord, EntryRecord, ReportRecord, TaskRecord } from '@/lib/life/types'

import './today.css'

/** Whole days between two YYYY-MM-DD strings. UTC noon on both sides so a DST
 *  shift can't round the difference to the wrong day. Same file-local pattern
 *  as app/people/page.tsx; no shared export. */
function daysBetween(from: string, to: string) {
  const a = Date.parse(`${from}T12:00:00Z`)
  const b = Date.parse(`${to}T12:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.max(0, Math.round((b - a) / 86_400_000))
}

function shortDate(localDate: string, timeZone: string) {
  const date = localDateTimeToUtc(localDate, timeZone, 12, 0)
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).formatToParts(date)
  const lookup = Object.fromEntries(parts.map((p) => [p.type, p.value]))
  return `${lookup.weekday} ${lookup.day} ${lookup.month}`
}

// Event times are 24h ("14:00"), unlike getLocalTimeLabel's 12h AM/PM used for
// entry timestamps — so events get their own HH:mm formatter.
function formatHHmm(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso))
}

export default async function LifeTodayPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  if (!(await isAdminSession())) {
    redirect('/login?next=/')
  }

  const params = await searchParams
  const formError = params.error === 'content' ? 'Content is required.' : params.error || null

  const settings = await getOwnerSettings()
  const timezone = settings.timezone
  const localDate = getCurrentLocalDate(timezone)
  const now = Date.now()

  // The morning brief has no cron of its own (Vercel Hobby allows one cron,
  // already used by the nightly EOD job). Instead, when the app is opened
  // during the morning window we generate it in the background AFTER the
  // response is sent — `after()` is backed by Vercel's waitUntil, so it never
  // delays the page render. generateMorningBrief self-gates (it bails if a
  // brief already exists or the task threshold isn't met), so loading Today
  // repeatedly in the morning is a cheap no-op once the brief has run.
  if (isMorningBriefWindow(timezone)) {
    after(async () => {
      try {
        await generateMorningBrief({ localDate })
      } catch (error) {
        console.error('Background morning brief generation failed', error)
      }
    })
  }

  const supabase = getSupabaseAdmin()
  const [eventsResult, activeTasks, entriesResult, reportsResult] = await Promise.all([
    supabase
      .from('calendar_events')
      .select('*')
      .eq('user_id', OWNER_ID)
      .eq('local_date', localDate)
      .order('start_time', { ascending: true }),
    getTasks({ status: 'active' }),
    supabase
      .from('entries')
      .select('*')
      .eq('user_id', OWNER_ID)
      .eq('local_date', localDate)
      .order('created_at', { ascending: false }),
    supabase
      .from('reports')
      .select('*')
      .eq('user_id', OWNER_ID)
      .eq('local_date', localDate)
      .order('created_at', { ascending: false }),
  ])

  const projectMap = await getProjectMap()

  const events: TodayEvent[] = ((eventsResult.data || []) as CalendarEventRecord[]).map((event) => ({
    id: event.id,
    title: event.title || '(Untitled event)',
    at: event.all_day || !event.start_time ? '' : formatHHmm(event.start_time, timezone),
    ends: event.all_day || !event.end_time ? '' : formatHHmm(event.end_time, timezone),
    allDay: event.all_day,
    cal: event.calendar_name || '—',
    where: event.location || '',
    startTime: event.start_time,
  }))

  const nextEventSource = events.find(
    (event) => !event.allDay && event.startTime && Date.parse(event.startTime) > now,
  )
  const nextEvent = nextEventSource
    ? {
        ...nextEventSource,
        countdown: `in ${Math.max(0, Math.round((Date.parse(nextEventSource.startTime as string) - now) / 60000))} min`,
      }
    : undefined

  const tasks: TodayTask[] = (activeTasks as TaskRecord[]).map((task) => ({
    id: task.id,
    title: task.title,
    project: task.project_slug ? projectMap.get(task.project_slug)?.name || task.project_slug : 'General',
    pri: task.priority,
    late: task.due_local_date && task.due_local_date < localDate ? daysBetween(task.due_local_date, localDate) : 0,
  }))

  const entries: TodayEntry[] = ((entriesResult.data || []) as EntryRecord[]).map((entry) => {
    const presentation = getEntryPresentation(entry)
    return {
      id: entry.id,
      at: getLocalTimeLabel(entry.created_at, timezone),
      text: entry.content,
      kind: presentation.kind,
      kindColor: presentation.color,
      project: entry.project_slug ? projectMap.get(entry.project_slug)?.name || entry.project_slug : null,
    }
  })

  const morningReport = ((reportsResult.data || []) as ReportRecord[]).find((r) => r.type === 'morning') || null

  return (
    <TodayScreen
      dateLabel={shortDate(localDate, timezone)}
      localDate={localDate}
      events={events}
      nextEvent={nextEvent}
      tasks={tasks}
      entries={entries}
      briefContent={morningReport?.content ?? null}
      formError={formError}
    />
  )
}
