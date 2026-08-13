import { NextRequest, NextResponse } from 'next/server'

import { isAuthenticatedLifeRequest, unauthorizedJson } from '@/lib/life/auth'
import { getPersonById, listInteractions, listOpenTasksForPerson, updatePerson } from '@/lib/life/people'
import type { PersonLink } from '@/lib/life/types'

export async function GET(request: NextRequest, context: { params: Promise<unknown> }) {
  if (!isAuthenticatedLifeRequest(request)) {
    return unauthorizedJson()
  }

  const { personId } = (await context.params) as { personId: string }

  try {
    const person = await getPersonById(personId)
    if (!person) {
      return NextResponse.json({ error: 'Person not found.' }, { status: 404 })
    }
    // History and open follow-ups ride along: the person page needs all three
    // to render, and one round trip beats three. `listOpenTasksForPerson`
    // already existed in lib/people.ts with no route exposing it.
    const [interactions, tasks] = await Promise.all([
      listInteractions(personId),
      listOpenTasksForPerson(personId),
    ])
    return NextResponse.json({ person, interactions, tasks })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load person.' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<unknown> }) {
  if (!isAuthenticatedLifeRequest(request)) {
    return unauthorizedJson()
  }

  const { personId } = (await context.params) as { personId: string }

  try {
    const body = (await request.json().catch(() => null)) as {
      name?: string
      role?: string | null
      relationship?: string
      why?: string | null
      channel?: string | null
      cadenceDays?: number | null
      archived?: boolean
      email?: string | null
      phone?: string | null
      how?: string | null
      links?: PersonLink[] | null
      likes?: string[] | null
      dislikes?: string[] | null
    } | null

    const person = await updatePerson(personId, {
      name: body?.name,
      relationship: body?.relationship,
      archived: body?.archived,
      ...(body && 'role' in body ? { role: body.role } : {}),
      ...(body && 'why' in body ? { why: body.why } : {}),
      ...(body && 'channel' in body ? { channel: body.channel } : {}),
      ...(body && 'cadenceDays' in body ? { cadenceDays: body.cadenceDays } : {}),
      ...(body && 'email' in body ? { email: body.email } : {}),
      ...(body && 'phone' in body ? { phone: body.phone } : {}),
      ...(body && 'how' in body ? { how: body.how } : {}),
      ...(body && 'links' in body ? { links: body.links } : {}),
      ...(body && 'likes' in body ? { likes: body.likes } : {}),
      ...(body && 'dislikes' in body ? { dislikes: body.dislikes } : {}),
    })

    return NextResponse.json({ person })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update person.' }, { status: 500 })
  }
}
