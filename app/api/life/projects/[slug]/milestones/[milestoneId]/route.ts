import { NextRequest, NextResponse } from 'next/server'

import { isAuthenticatedLifeRequest, unauthorizedJson } from '@/lib/life/auth'
import { deleteMilestone, updateMilestone } from '@/lib/life/milestones'

export async function PATCH(request: NextRequest, context: { params: Promise<unknown> }) {
  if (!isAuthenticatedLifeRequest(request)) {
    return unauthorizedJson()
  }

  const { milestoneId } = (await context.params) as { milestoneId: string }

  try {
    const body = (await request.json().catch(() => null)) as {
      name?: string
      targetDate?: string | null
      sortOrder?: number
    } | null

    const milestone = await updateMilestone(milestoneId, {
      name: body?.name,
      targetDate: body && 'targetDate' in body ? body.targetDate : undefined,
      sortOrder: body?.sortOrder,
    })
    return NextResponse.json({ milestone })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update milestone.' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<unknown> }) {
  if (!isAuthenticatedLifeRequest(request)) {
    return unauthorizedJson()
  }

  const { milestoneId } = (await context.params) as { milestoneId: string }

  try {
    await deleteMilestone(milestoneId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to delete milestone.' }, { status: 500 })
  }
}
