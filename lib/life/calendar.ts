import { google } from 'googleapis'

import { OWNER_ID } from '@/lib/life/constants'
import { getLifeServerEnv } from '@/lib/life/env'
import { getOwnerSettings } from '@/lib/life/settings'
import { getSupabaseAdmin } from '@/lib/life/supabase'
import { addDays, getCurrentLocalDate, getLocalDateString, getLocalDayRange, localDateTimeToUtc } from '@/lib/life/time'
import type { CalendarEventRecord } from '@/lib/life/types'

interface LifeCalendarSource {
  id: string
  name: string
  primary: boolean
  selected: boolean
}

const MAX_REMINDER_MINUTES = 40_320

export function normalizeAttendeeEmails(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value
    .filter((email): email is string => typeof email === 'string')
    .map((email) => email.trim().toLowerCase())
    .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))))
}

export function normalizeReminderMinutes(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value
    .filter((minutes): minutes is number => typeof minutes === 'number' && Number.isInteger(minutes))
    .filter((minutes) => minutes > 0 && minutes <= MAX_REMINDER_MINUTES)))
    .sort((a, b) => a - b)
}

function getCalendarClient() {
  const { googleClientId, googleClientSecret, googleRefreshToken } = getLifeServerEnv()
  const oauth2Client = new google.auth.OAuth2(googleClientId, googleClientSecret);
  oauth2Client.setCredentials({ refresh_token: googleRefreshToken });
  return google.calendar({ version: "v3", auth: oauth2Client });
}

function getConfiguredCalendarIds() {
  const { googleCalendarId } = getLifeServerEnv()
  const normalized = googleCalendarId.trim()
  if (!normalized || normalized === 'primary') {
    return []
  }

  return normalized
    .split(',')
    .map((calendarId) => calendarId.trim())
    .filter(Boolean)
}

async function getCalendarSources(calendar: ReturnType<typeof google.calendar>): Promise<LifeCalendarSource[]> {
  const response = await calendar.calendarList.list({
    showDeleted: false,
    showHidden: false,
  })
  const items = response.data.items || []
  const configuredCalendarIds = getConfiguredCalendarIds()

  if (configuredCalendarIds.length > 0) {
    const byId = new Map(items.filter((item) => item.id).map((item) => [item.id as string, item]))
    return configuredCalendarIds.map((calendarId) => {
      const item = byId.get(calendarId)
      return {
        id: calendarId,
        name: item?.summaryOverride || item?.summary || calendarId,
        primary: Boolean(item?.primary),
        selected: item?.selected !== false,
      }
    })
  }

  const sources = items
    .filter((item) => item.id && (item.primary || item.selected))
    .map((item) => ({
      id: item.id as string,
      name: item.summaryOverride || item.summary || (item.id as string),
      primary: Boolean(item.primary),
      selected: Boolean(item.selected || item.primary),
    }))

  if (sources.length > 0) {
    return sources
  }

  return [{ id: 'primary', name: 'Primary', primary: true, selected: true }]
}

async function getCalendarIdsToSync(calendar: ReturnType<typeof google.calendar>) {
  const configuredCalendarIds = getConfiguredCalendarIds()
  if (configuredCalendarIds.length > 0) {
    return configuredCalendarIds
  }

  return (await getCalendarSources(calendar)).map((calendar) => calendar.id)
}

function buildEventRequestBody(
  input: {
    title: string
    localDate: string
    startTime?: string | null
    endTime?: string | null
    allDay?: boolean
    location?: string | null
    notes?: string | null
    attendeeEmails?: string[]
    reminderMinutes?: number[]
  },
  timeZone: string,
) {
  const location = input.location?.trim() || undefined
  const description = input.notes?.trim() || undefined

  let requestBody: {
    summary: string
    location?: string
    description?: string
    start: { date?: string; dateTime?: string; timeZone?: string }
    end: { date?: string; dateTime?: string; timeZone?: string }
    attendees?: Array<{ email: string }>
    reminders?: {
      useDefault: boolean
      overrides?: Array<{ method: 'popup'; minutes: number }>
    }
  }

  if (input.allDay || !input.startTime) {
    requestBody = {
      summary: input.title,
      location,
      description,
      start: { date: input.localDate },
      end: { date: addDays(input.localDate, 1) },
    }
  } else {
    const [startHour, startMinute] = input.startTime.split(':').map(Number)
    const start = localDateTimeToUtc(input.localDate, timeZone, startHour, startMinute, 0)
    let end: Date
    if (input.endTime) {
      const [endHour, endMinute] = input.endTime.split(':').map(Number)
      end = localDateTimeToUtc(input.localDate, timeZone, endHour, endMinute, 0)
      if (end.getTime() <= start.getTime()) {
        end = new Date(start.getTime() + 60 * 60 * 1000)
      }
    } else {
      end = new Date(start.getTime() + 60 * 60 * 1000)
    }
    requestBody = {
      summary: input.title,
      location,
      description,
      start: { dateTime: start.toISOString(), timeZone },
      end: { dateTime: end.toISOString(), timeZone },
    }
  }

  const attendeeEmails = normalizeAttendeeEmails(input.attendeeEmails)
  const reminderMinutes = normalizeReminderMinutes(input.reminderMinutes)
  if (attendeeEmails.length > 0) {
    requestBody.attendees = attendeeEmails.map((email) => ({ email }))
  }
  requestBody.reminders = reminderMinutes.length > 0
    ? { useDefault: false, overrides: reminderMinutes.map((minutes) => ({ method: 'popup', minutes })) }
    : { useDefault: true }

  return requestBody
}

export async function listLifeCalendars() {
  const calendar = getCalendarClient()
  return getCalendarSources(calendar)
}

export async function createCalendarEvent(input: {
  title: string
  localDate: string
  startTime?: string | null
  endTime?: string | null
  allDay?: boolean
  calendarId?: string | null
  location?: string | null
  notes?: string | null
  attendeeEmails?: string[]
  reminderMinutes?: number[]
}) {
  const settings = await getOwnerSettings()
  const timeZone = settings.timezone
  const calendar = getCalendarClient()
  const title = input.title?.trim()
  if (!title) {
    throw new Error('Event title is required.')
  }

  const targetCalendarId = input.calendarId?.trim() || getConfiguredCalendarIds()[0] || 'primary'
  const requestBody = buildEventRequestBody({ ...input, title }, timeZone)

  const response = await calendar.events.insert({
    calendarId: targetCalendarId,
    requestBody,
  })

  return response.data
}

async function findCalendarIdForEvent(eventId: string, preferredCalendarId?: string | null) {
  const calendar = getCalendarClient()

  if (preferredCalendarId) {
    try {
      await calendar.events.get({ calendarId: preferredCalendarId, eventId })
      return { calendar, calendarId: preferredCalendarId }
    } catch {
      // Fall through to the broader scan.
    }
  }

  const calendarIds = await getCalendarIdsToSync(calendar)

  for (const calendarId of calendarIds) {
    try {
      await calendar.events.get({ calendarId, eventId })
      return { calendar, calendarId }
    } catch {
      continue
    }
  }

  throw new Error('Calendar event not found.')
}

export async function updateCalendarEvent(
  eventId: string,
  input: {
    title: string
    localDate: string
    startTime?: string | null
    endTime?: string | null
    allDay?: boolean
    calendarId?: string | null
    location?: string | null
    notes?: string | null
    attendeeEmails?: string[]
    reminderMinutes?: number[]
  },
  currentCalendarId?: string | null,
) {
  const settings = await getOwnerSettings()
  const timeZone = settings.timezone
  const title = input.title?.trim()
  if (!title) {
    throw new Error('Event title is required.')
  }

  const { calendar, calendarId: foundCalendarId } = await findCalendarIdForEvent(eventId, currentCalendarId)
  let targetCalendarId = input.calendarId?.trim() || foundCalendarId
  let targetEventId = eventId

  if (targetCalendarId !== foundCalendarId) {
    const moved = await calendar.events.move({
      calendarId: foundCalendarId,
      eventId,
      destination: targetCalendarId,
    })
    targetEventId = moved.data.id || eventId
  }
  const requestBody = buildEventRequestBody({ ...input, title }, timeZone)

  const response = await calendar.events.update({
    calendarId: targetCalendarId,
    eventId: targetEventId,
    requestBody,
  })

  return response.data
}

export async function deleteCalendarEvent(eventId: string, calendarId?: string | null) {
  const { calendar, calendarId: resolvedCalendarId } = await findCalendarIdForEvent(eventId, calendarId)
  await calendar.events.delete({ calendarId: resolvedCalendarId, eventId })
}

/**
 * Create a real Google Calendar event for a task and mirror it into Supabase.
 * Returns the Google event id (used as tasks.calendar_event_id).
 */
export async function createCalendarEventForTask(input: {
  title: string
  localDate: string
  startTime?: string | null
  endTime?: string | null
  notes?: string | null
  calendarId?: string | null
}) {
  const event = await createCalendarEvent({
    title: input.title,
    localDate: input.localDate,
    startTime: input.startTime ?? null,
    endTime: input.endTime ?? null,
    allDay: !input.startTime,
    calendarId: input.calendarId ?? null,
    notes: input.notes ?? null,
  })

  // Pull the new event into Supabase so it shows up immediately (the event may
  // be outside the default "around today" sync window, so sync its own date).
  try {
    await syncCalendarEvents(input.localDate, undefined, { force: true })
  } catch (error) {
    console.error('Calendar sync after task-event creation failed', error)
  }

  return (event.id as string | null) || null
}

/** Upcoming events (next `days`), for the "link existing event" picker. */
export async function listUpcomingCalendarEvents(days = 21): Promise<CalendarEventRecord[]> {
  const settings = await getOwnerSettings()
  const timeZone = settings.timezone
  const start = getCurrentLocalDate(timeZone)
  const end = addDays(start, days)

  try {
    await syncCalendarEvents(start, end)
  } catch (error) {
    console.error('Calendar sync for event picker failed', error)
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('user_id', OWNER_ID)
    .gte('local_date', start)
    .lte('local_date', end)
    .order('start_time', { ascending: true })

  if (error) throw error
  return (data || []) as CalendarEventRecord[]
}

/** Look up specific events by id (for rendering linked tasks). */
export async function getCalendarEventsByIds(ids: string[]): Promise<CalendarEventRecord[]> {
  const unique = Array.from(new Set(ids.filter(Boolean)))
  if (unique.length === 0) return []

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('user_id', OWNER_ID)
    .in('id', unique)

  if (error) throw error
  return (data || []) as CalendarEventRecord[]
}

// In-memory throttle so that rapid navigations between Life pages don't each
// pay the full Google Calendar round-trip + Supabase delete/upsert. The cron
// and explicit user actions pass `{ force: true }` to bypass.
const SYNC_TTL_MS = 5 * 60 * 1000
const lastSyncedAt = new Map<string, number>()

export async function syncCalendarEvents(
  startLocalDate?: string,
  endLocalDate?: string,
  options?: { force?: boolean },
) {
  const settings = await getOwnerSettings();
  const timeZone = settings.timezone;
  const baseStart = startLocalDate || getCurrentLocalDate(timeZone);
  const baseEnd = endLocalDate || baseStart;

  const cacheKey = `${baseStart}:${baseEnd}`
  if (!options?.force) {
    const last = lastSyncedAt.get(cacheKey)
    if (last && Date.now() - last < SYNC_TTL_MS) {
      return {
        synced: 0,
        skipped: true as const,
        cached: true as const,
        startLocalDate: baseStart,
        endLocalDate: baseEnd,
        localDate: baseStart,
        timeZone,
        calendarIds: [] as string[],
        events: [] as CalendarEventRecord[],
      }
    }
  }

  const supabase = getSupabaseAdmin();
  const calendar = getCalendarClient();
  const windowStart = addDays(baseStart, -1);
  const windowEnd = addDays(baseEnd, 7);
  const timeMin = getLocalDayRange(windowStart, timeZone).start.toISOString();
  const timeMax = getLocalDayRange(windowEnd, timeZone).end.toISOString();
  const calendars = await getCalendarSources(calendar)
  const calendarIds = calendars.map((calendarSource) => calendarSource.id)
  const calendarNames = new Map(calendars.map((calendarSource) => [calendarSource.id, calendarSource.name]))

  const responses = await Promise.all(
    calendarIds.map((calendarId) =>
      calendar.events.list({
        calendarId,
        singleEvents: true,
        orderBy: "startTime",
        timeMin,
        timeMax,
        maxResults: 250,
      }).then((response) => ({ calendarId, items: response.data.items || [] })),
    ),
  )

  const eventMap = new Map<string, CalendarEventRecord>()
  for (const { calendarId, items } of responses) {
    for (const event of items) {
      if (!event.id && !event.iCalUID) {
        continue
      }

      const isAllDay = Boolean(event.start?.date && !event.start?.dateTime);
      const startDate = event.start?.date;
      const startTime = event.start?.dateTime;
      const endDate = event.end?.date;
      const endTime = event.end?.dateTime;
      const localDate = isAllDay && startDate
        ? startDate
        : getLocalDateString(new Date(startTime || event.created || Date.now()), timeZone);

      const mappedEvent = {
        id: (event.id || event.iCalUID) as string,
        user_id: OWNER_ID,
        title: event.summary || "(Untitled event)",
        calendar_id: calendarId,
        calendar_name: calendarNames.get(calendarId) || calendarId,
        location: event.location || null,
        notes: event.description || null,
        html_link: event.htmlLink || null,
        attendee_emails: normalizeAttendeeEmails(event.attendees?.map((attendee) => attendee.email)),
        reminder_minutes: normalizeReminderMinutes(event.reminders?.overrides?.map((override) => override.minutes)),
        start_time: isAllDay && startDate
          ? localDateTimeToUtc(startDate, timeZone, 0, 0, 0).toISOString()
          : startTime || null,
        end_time: isAllDay && endDate
          ? localDateTimeToUtc(endDate, timeZone, 0, 0, 0).toISOString()
          : endTime || null,
        all_day: isAllDay,
        source: "google",
        local_date: localDate,
        updated_at: event.updated || new Date().toISOString(),
        synced_at: new Date().toISOString(),
      } satisfies CalendarEventRecord;

      eventMap.set(mappedEvent.id, mappedEvent)
    }
  }

  const events = Array.from(eventMap.values())

  const { error: deleteError } = await supabase
    .from("calendar_events")
    .delete()
    .eq("user_id", OWNER_ID)
    .eq("source", "google")
    .gte("local_date", windowStart)
    .lte("local_date", windowEnd)

  if (deleteError) {
    throw deleteError
  }

  if (events.length > 0) {
    const { error } = await supabase
      .from("calendar_events")
      .upsert(events, { onConflict: "id" });

    if (error) {
      throw error;
    }
  }

  lastSyncedAt.set(cacheKey, Date.now())

  return {
    synced: events.length,
    startLocalDate: baseStart,
    endLocalDate: baseEnd,
    localDate: baseStart,
    timeZone,
    calendarIds,
    events,
  };
}
