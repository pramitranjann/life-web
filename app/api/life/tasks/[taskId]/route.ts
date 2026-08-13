import { NextRequest, NextResponse } from "next/server";

import { isAuthenticatedLifeRequest, unauthorizedJson } from '@/lib/life/auth'
import { applyCalendarIntent } from '@/lib/life/calendar-intent'
import { updateTask, updateTaskStatus } from '@/lib/life/tasks'
import type { TaskCalendarIntent, TaskStatus } from '@/lib/life/types'

function getSafeRedirectTo(value: string | null | undefined) {
  return value?.startsWith('/') ? value : '/tasks'
}

function normalizeStatus(value: string | null | undefined): TaskStatus {
  if (value === 'done' || value === 'dismissed' || value === 'in_progress') {
    return value
  }

  return 'open'
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<unknown> },
) {
  if (!isAuthenticatedLifeRequest(request)) {
    return unauthorizedJson();
  }

  const { taskId } = (await context.params) as { taskId: string }
  const contentType = request.headers.get('content-type') || ''
  const isJsonRequest = contentType.includes('application/json')
  let redirectTo: string | null = null

  try {
    let status: TaskStatus = 'open'

    if (isJsonRequest) {
      const body = (await request.json().catch(() => null)) as { status?: string; redirectTo?: string | null } | null
      status = normalizeStatus(body?.status || null)
      redirectTo = body?.redirectTo || null
    } else {
      const formData = await request.formData().catch(() => null)
      status = normalizeStatus(typeof formData?.get('status') === 'string' ? String(formData.get('status')) : null)
      redirectTo = typeof formData?.get('redirectTo') === 'string' ? String(formData.get('redirectTo')) : null
    }

    const task = await updateTaskStatus(taskId, status)

    if (!isJsonRequest) {
      return NextResponse.redirect(new URL(getSafeRedirectTo(redirectTo), request.url), { status: 303 })
    }

    return NextResponse.json({ task })
  } catch (error) {
    if (!isJsonRequest) {
      const url = new URL(getSafeRedirectTo(redirectTo), request.url)
      url.searchParams.set('error', error instanceof Error ? error.message : 'Task update failed.')
      return NextResponse.redirect(url, { status: 303 })
    }

    return NextResponse.json({ error: error instanceof Error ? error.message : 'Task update failed.' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<unknown> },
) {
  if (!isAuthenticatedLifeRequest(request)) {
    return unauthorizedJson()
  }

  const { taskId } = (await context.params) as { taskId: string }

  try {
    const body = (await request.json().catch(() => null)) as {
      title?: string
      details?: string | null
      projectSlug?: string | null
      priority?: string | null
      dueLocalDate?: string | null
      calendar?: TaskCalendarIntent | null
      milestoneId?: string | null
      deskEligible?: boolean | null
    } | null

    const togglingDesk = Boolean(body && 'deskEligible' in body)

    let task = await updateTask(taskId, {
      title: body?.title,
      details: body?.details,
      projectSlug: body?.projectSlug,
      priority: body?.priority,
      dueLocalDate: body?.dueLocalDate,
      ...(body && 'milestoneId' in body ? { milestoneId: body.milestoneId } : {}),
      ...(togglingDesk ? { deskEligible: body?.deskEligible === true } : {}),
    })

    try {
      task = await applyCalendarIntent(task, body?.calendar)
    } catch (calendarError) {
      console.error('Applying calendar intent on task edit failed', calendarError)
    }

    return NextResponse.json({ task })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Task update failed.' }, { status: 500 })
  }
}
