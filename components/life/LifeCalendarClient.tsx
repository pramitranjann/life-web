'use client'

// The live wiring for LifeEventCalendar. The calendar itself is presentational
// and fully controlled; everything that talks to Supabase lives here so the
// lab page can keep rendering the same component against mock state.
//
// ponytail: one fetch over a wide window rather than per-view range queries.
// A personal calendar is a few hundred rows; refetch only when the cursor
// leaves the loaded window.

import { useCallback, useEffect, useRef, useState } from 'react'

import { LifeEventCalendar, type CalEvent } from '@/components/life/ui/LifeEventCalendar'
import { LifeSkeletonRows } from '@/components/life/ui/LifeSkeleton'
import { lifeToast } from '@/components/life/ui/LifeToast'
import { fetchJson } from '@/lib/life/client'
import { addDays, getTimeParts } from '@/lib/life/time'
import type { CalendarEventRecord } from '@/lib/life/types'

/** Days loaded either side of the cursor before a refetch is needed. */
const WINDOW_BEFORE = 45
const WINDOW_AFTER = 120
/** Refetch once the cursor comes within this many days of a window edge. */
const REFETCH_MARGIN = 14

interface MonthResponse {
  events: CalendarEventRecord[]
}

function minutesInZone(iso: string, timezone: string) {
  const parts = getTimeParts(new Date(iso), timezone)
  return parts.hour * 60 + parts.minute
}

function hhmm(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Google calendar names are free text, but the calendar's colour tokens are a
 * closed set. Anything unrecognised gets no tone rather than a wrong one.
 */
function toneFor(name: string | null): CalEvent['calendar'] {
  const value = (name || '').toLowerCase()
  if (value.includes('work')) return 'work'
  if (value.includes('health') || value.includes('fitness')) return 'health'
  if (value.includes('personal')) return 'personal'
  return undefined
}

function toCalEvent(record: CalendarEventRecord, timezone: string): CalEvent {
  const allDay = record.all_day || !record.start_time
  return {
    id: record.id,
    date: record.local_date,
    start: allDay ? null : minutesInZone(record.start_time!, timezone),
    end: allDay || !record.end_time ? null : minutesInZone(record.end_time, timezone),
    title: record.title || 'Untitled',
    calendar: toneFor(record.calendar_name),
    location: record.location || '',
    notes: record.notes || '',
    attendeeEmails: record.attendee_emails || [],
    reminderMinutes: record.reminder_minutes || [],
  }
}

function toBody(event: CalEvent) {
  return {
    title: event.title,
    localDate: event.date,
    allDay: event.start === null,
    startTime: event.start === null ? null : hhmm(event.start),
    endTime: event.end === null ? null : hhmm(event.end),
    location: event.location || null,
    notes: event.notes || null,
    attendeeEmails: event.attendeeEmails || [],
    reminderMinutes: event.reminderMinutes || [],
  }
}

function sameEvent(a: CalEvent, b: CalEvent) {
  return a.date === b.date && a.start === b.start && a.end === b.end && a.title === b.title
    && a.location === b.location && a.notes === b.notes
    && JSON.stringify(a.attendeeEmails || []) === JSON.stringify(b.attendeeEmails || [])
    && JSON.stringify(a.reminderMinutes || []) === JSON.stringify(b.reminderMinutes || [])
}

export function LifeCalendarClient({
  today,
  timezone,
  initialView,
}: {
  today: string
  timezone: string
  initialView?: 'month' | 'week' | 'day' | 'agenda'
}) {
  const [events, setEvents] = useState<CalEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [window, setWindow] = useState(() => ({
    start: addDays(today, -WINDOW_BEFORE),
    end: addDays(today, WINDOW_AFTER),
  }))

  // The last state the server confirmed. onChange hands back the whole array,
  // so this is what makes a diff possible.
  const serverRef = useRef<CalEvent[]>([])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchJson<MonthResponse>(`/api/life/month?start=${window.start}&end=${window.end}`)
      .then((data) => {
        if (cancelled) return
        const mapped = (data.events || []).map((record) => toCalEvent(record, timezone))
        serverRef.current = mapped
        setEvents(mapped)
        setError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Could not load the calendar.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [window, timezone])

  const onCursorChange = useCallback(
    (date: string) => {
      setWindow((current) => {
        const nearStart = date <= addDays(current.start, REFETCH_MARGIN)
        const nearEnd = date >= addDays(current.end, -REFETCH_MARGIN)
        if (!nearStart && !nearEnd) return current
        return { start: addDays(date, -WINDOW_BEFORE), end: addDays(date, WINDOW_AFTER) }
      })
    },
    [],
  )

  const onChange = useCallback(
    (next: CalEvent[]) => {
      const previous = serverRef.current
      // Optimistic: the drag has already happened under the pointer, so the
      // grid must not snap back while the request is in flight.
      setEvents(next)

      const byId = new Map(previous.map((event) => [event.id, event]))
      const nextIds = new Set(next.map((event) => event.id))
      const created = next.filter((event) => !byId.has(event.id))
      const updated = next.filter((event) => {
        const before = byId.get(event.id)
        return before && !sameEvent(before, event)
      })
      const deleted = previous.filter((event) => !nextIds.has(event.id))

      const rollback = () => {
        setEvents(previous)
        lifeToast({ message: 'Calendar change failed — reverted.' })
      }

      void (async () => {
        try {
          for (const event of created) {
            const saved = await fetchJson<{ event: CalendarEventRecord }>(
              '/api/life/calendar/events',
              { method: 'POST', body: JSON.stringify(toBody(event)) },
            )
            // Swap the client-side temp id for the real one, or the next edit
            // would read as another create. The POST returns Google's event
            // shape, not the Supabase mirror shape, so preserve the optimistic
            // event fields and take only the confirmed Google id here.
            if (saved?.event?.id) {
              const real = { ...event, id: saved.event.id }
              setEvents((current) => current.map((e) => (e.id === event.id ? real : e)))
              next = next.map((e) => (e.id === event.id ? real : e))
            }
          }
          for (const event of updated) {
            await fetchJson(`/api/life/calendar/events/${event.id}`, {
              method: 'PATCH',
              body: JSON.stringify(toBody(event)),
            })
          }
          for (const event of deleted) {
            await fetchJson(`/api/life/calendar/events/${event.id}`, { method: 'DELETE' })
          }
          serverRef.current = next
          setError(null)
        } catch (err) {
          rollback()
          setError(err instanceof Error ? err.message : 'Calendar update failed.')
        }
      })()
    },
    [timezone],
  )

  if (loading && events.length === 0) {
    return (
      <div className="life-cal-loading">
        <LifeSkeletonRows rows={6} />
      </div>
    )
  }

  return (
    <>
      {error ? <p className="error-text">{error}</p> : null}
      <LifeEventCalendar
        events={events}
        onChange={onChange}
        today={today}
        initialView={initialView}
        onCursorChange={onCursorChange}
      />
    </>
  )
}
