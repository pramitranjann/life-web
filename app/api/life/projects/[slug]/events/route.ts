import { NextRequest, NextResponse } from 'next/server'

import { isAuthenticatedLifeRequest, unauthorizedJson } from '@/lib/life/auth'
import { createCalendarEventForTask } from '@/lib/life/calendar'
import { addProjectEvent, getProjectEvents, removeProjectEvent } from '@/lib/life/project-events'
import { getOwnerSettings } from '@/lib/life/settings'
import { getCurrentLocalDate } from '@/lib/life/time'

export async function GET(request: NextRequest, context: { params: Promise<unknown> }) {
  if (!isAuthenticatedLifeRequest(request)) {
    return unauthorizedJson()
  }

  const { slug } = (await context.params) as { slug: string }

  try {
    const events = await getProjectEvents(slug)
    return NextResponse.json({ events })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load events.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, context: { params: Promise<unknown> }) {
  if (!isAuthenticatedLifeRequest(request)) {
    return unauthorizedJson()
  }

  const { slug } = (await context.params) as { slug: string }

  try {
    const body = (await request.json().catch(() => null)) as {
      eventId?: string | null
      title?: string
      localDate?: string | null
      startTime?: string | null
      endTime?: string | null
    } | null

    // Link an existing event by id.
    if (body?.eventId) {
      await addProjectEvent(slug, body.eventId)
      return NextResponse.json({ ok: true, eventId: body.eventId })
    }

    // Otherwise create a new Google event and map it to the project.
    if (!body?.title?.trim()) {
      return NextResponse.json({ error: 'Event title is required.' }, { status: 400 })
    }
    const settings = await getOwnerSettings()
    const localDate = body.localDate || getCurrentLocalDate(settings.timezone)
    const eventId = await createCalendarEventForTask({
      title: body.title,
      localDate,
      startTime: body.startTime ?? null,
      endTime: body.endTime ?? null,
    })
    if (!eventId) {
      return NextResponse.json({ error: 'Calendar event creation failed.' }, { status: 502 })
    }
    await addProjectEvent(slug, eventId)
    return NextResponse.json({ ok: true, eventId })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to add event.' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<unknown> }) {
  if (!isAuthenticatedLifeRequest(request)) {
    return unauthorizedJson()
  }

  const { slug } = (await context.params) as { slug: string }

  try {
    const eventId = request.nextUrl.searchParams.get('eventId')
    if (!eventId) {
      return NextResponse.json({ error: 'eventId is required.' }, { status: 400 })
    }
    await removeProjectEvent(slug, eventId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to remove event.' }, { status: 500 })
  }
}
