import { NextRequest, NextResponse } from 'next/server'

import { isAuthenticatedLifeRequest, unauthorizedJson } from '@/lib/life/auth'
import { deleteCalendarEvent, normalizeAttendeeEmails, normalizeReminderMinutes, syncCalendarEvents, updateCalendarEvent } from '@/lib/life/calendar'
import { OWNER_ID } from '@/lib/life/constants'
import { getSupabaseAdmin } from '@/lib/life/supabase'

function normalizeLocalDate(value: string | null | undefined) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null
}

function normalizeOptionalText(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

async function getStoredEvent(eventId: string) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('calendar_events')
    .select('id, local_date, calendar_id, attendee_emails, reminder_minutes')
    .eq('user_id', OWNER_ID)
    .eq('id', eventId)
    .maybeSingle<{
      id: string
      local_date: string
      calendar_id: string | null
      attendee_emails: string[]
      reminder_minutes: number[]
    }>()

  if (error) throw error
  return data
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ eventId: string }> },
) {
  if (!isAuthenticatedLifeRequest(request)) {
    return unauthorizedJson()
  }

  const { eventId } = await context.params

  try {
    const stored = await getStoredEvent(eventId)
    if (!stored) {
      return NextResponse.json({ error: 'Event not found.' }, { status: 404 })
    }

    const body = (await request.json().catch(() => null)) as {
      title?: string
      localDate?: string
      startTime?: string | null
      endTime?: string | null
      allDay?: boolean
      calendarId?: string | null
      location?: string | null
      notes?: string | null
      attendeeEmails?: string[]
      reminderMinutes?: number[]
    } | null

    const localDate = normalizeLocalDate(body?.localDate) || stored.local_date
    const title = body?.title?.trim() || ''
    if (!title) {
      return NextResponse.json({ error: 'Event title is required.' }, { status: 400 })
    }

    const event = await updateCalendarEvent(eventId, {
      title,
      localDate,
      startTime: body?.startTime || null,
      endTime: body?.endTime || null,
      allDay: Boolean(body?.allDay),
      calendarId: normalizeOptionalText(body?.calendarId),
      location: normalizeOptionalText(body?.location),
      notes: normalizeOptionalText(body?.notes),
      // Older callers only send the fields their form exposes. Preserve mirror
      // details when omitted; an explicit [] intentionally clears them.
      attendeeEmails: body?.attendeeEmails === undefined
        ? stored.attendee_emails
        : normalizeAttendeeEmails(body.attendeeEmails),
      reminderMinutes: body?.reminderMinutes === undefined
        ? stored.reminder_minutes
        : normalizeReminderMinutes(body.reminderMinutes),
    }, stored.calendar_id)

    const syncStart = stored.local_date < localDate ? stored.local_date : localDate
    const syncEnd = stored.local_date > localDate ? stored.local_date : localDate
    await syncCalendarEvents(syncStart, syncEnd, { force: true })

    return NextResponse.json({ event })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Event update failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ eventId: string }> },
) {
  if (!isAuthenticatedLifeRequest(_request)) {
    return unauthorizedJson()
  }

  const { eventId } = await context.params

  try {
    const stored = await getStoredEvent(eventId)
    if (!stored) {
      return NextResponse.json({ error: 'Event not found.' }, { status: 404 })
    }

    await deleteCalendarEvent(eventId, stored.calendar_id)
    await syncCalendarEvents(stored.local_date, stored.local_date, { force: true })

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Event deletion failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
