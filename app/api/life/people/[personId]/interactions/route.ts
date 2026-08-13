import { NextRequest, NextResponse } from 'next/server'

import { isAuthenticatedLifeRequest, unauthorizedJson } from '@/lib/life/auth'
import { createInteraction, listInteractions } from '@/lib/life/people'
import { normalizeProjectSlugDb } from '@/lib/life/projects-db'

export async function GET(request: NextRequest, context: { params: Promise<unknown> }) {
  if (!isAuthenticatedLifeRequest(request)) {
    return unauthorizedJson()
  }

  const { personId } = (await context.params) as { personId: string }

  try {
    const interactions = await listInteractions(personId)
    return NextResponse.json({ interactions })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load interactions.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, context: { params: Promise<unknown> }) {
  if (!isAuthenticatedLifeRequest(request)) {
    return unauthorizedJson()
  }

  const { personId } = (await context.params) as { personId: string }

  try {
    const body = (await request.json().catch(() => null)) as {
      localDate?: string
      kind?: string | null
      summary?: string
      projectSlug?: string | null
    } | null

    if (!body?.summary?.trim()) {
      return NextResponse.json({ error: 'Interaction summary is required.' }, { status: 400 })
    }
    if (!body.localDate || !/^\d{4}-\d{2}-\d{2}$/.test(body.localDate)) {
      return NextResponse.json({ error: 'A valid date is required.' }, { status: 400 })
    }

    const interaction = await createInteraction({
      personId,
      localDate: body.localDate,
      kind: body.kind ?? null,
      summary: body.summary,
      projectSlug: await normalizeProjectSlugDb(body.projectSlug),
    })

    return NextResponse.json({ interaction })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to log interaction.' }, { status: 500 })
  }
}
