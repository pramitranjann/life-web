import { NextRequest, NextResponse } from 'next/server'

import { isAuthenticatedLifeRequest, unauthorizedJson } from '@/lib/life/auth'
import { createMilestone, listMilestones } from '@/lib/life/milestones'

export async function GET(request: NextRequest, context: { params: Promise<unknown> }) {
  if (!isAuthenticatedLifeRequest(request)) {
    return unauthorizedJson()
  }

  const { slug } = (await context.params) as { slug: string }

  try {
    const milestones = await listMilestones(slug)
    return NextResponse.json({ milestones })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load milestones.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, context: { params: Promise<unknown> }) {
  if (!isAuthenticatedLifeRequest(request)) {
    return unauthorizedJson()
  }

  const { slug } = (await context.params) as { slug: string }

  try {
    const body = (await request.json().catch(() => null)) as { name?: string; targetDate?: string | null } | null
    if (!body?.name?.trim()) {
      return NextResponse.json({ error: 'Milestone name is required.' }, { status: 400 })
    }
    const milestone = await createMilestone({ projectSlug: slug, name: body.name, targetDate: body.targetDate ?? null })
    return NextResponse.json({ milestone })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to create milestone.' }, { status: 500 })
  }
}
