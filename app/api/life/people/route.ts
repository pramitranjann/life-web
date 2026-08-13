import { NextRequest, NextResponse } from 'next/server'

import { isAuthenticatedLifeRequest, unauthorizedJson } from '@/lib/life/auth'
import { createPerson, listPeople } from '@/lib/life/people'
import type { PersonLink } from '@/lib/life/types'

export async function GET(request: NextRequest) {
  if (!isAuthenticatedLifeRequest(request)) {
    return unauthorizedJson()
  }

  try {
    const includeArchived = request.nextUrl.searchParams.get('archived') === 'true'
    const people = await listPeople({ includeArchived })
    return NextResponse.json({ people })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load people.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthenticatedLifeRequest(request)) {
    return unauthorizedJson()
  }

  try {
    const body = (await request.json().catch(() => null)) as {
      name?: string
      role?: string | null
      relationship?: string | null
      why?: string | null
      channel?: string | null
      cadenceDays?: number | null
      email?: string | null
      phone?: string | null
      how?: string | null
      links?: PersonLink[] | null
      likes?: string[] | null
      dislikes?: string[] | null
    } | null

    if (!body?.name?.trim()) {
      return NextResponse.json({ error: 'Person name is required.' }, { status: 400 })
    }

    const person = await createPerson({
      name: body.name,
      role: body.role ?? null,
      relationship: body.relationship ?? null,
      why: body.why ?? null,
      channel: body.channel ?? null,
      cadenceDays: body.cadenceDays ?? null,
      email: body.email ?? null,
      phone: body.phone ?? null,
      how: body.how ?? null,
      links: body.links ?? null,
      likes: body.likes ?? null,
      dislikes: body.dislikes ?? null,
    })

    return NextResponse.json({ person })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to create person.' }, { status: 500 })
  }
}
