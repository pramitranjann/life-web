import { NextRequest, NextResponse } from 'next/server'

import { isAuthenticatedLifeRequest, unauthorizedJson } from '@/lib/life/auth'
import { setLifeNotificationRead } from '@/lib/life/notifications'

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ notificationId: string }> },
) {
  if (!isAuthenticatedLifeRequest(request)) {
    return unauthorizedJson()
  }

  const body = (await request.json().catch(() => null)) as { read?: boolean } | null
  if (typeof body?.read !== 'boolean') {
    return NextResponse.json({ error: 'read must be a boolean.' }, { status: 400 })
  }

  const { notificationId } = await context.params

  try {
    const notification = await setLifeNotificationRead(notificationId, body.read)
    if (!notification) {
      return NextResponse.json({ error: 'Notification not found.' }, { status: 404 })
    }

    return NextResponse.json({ notification })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update notification.' },
      { status: 500 },
    )
  }
}
