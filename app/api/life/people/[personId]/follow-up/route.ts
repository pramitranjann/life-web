import { NextRequest, NextResponse } from 'next/server'

import { isAuthenticatedLifeRequest, unauthorizedJson } from '@/lib/life/auth'
import { getPersonById } from '@/lib/life/people'
import { createManualTask } from '@/lib/life/tasks'

export async function POST(request: NextRequest, context: { params: Promise<unknown> }) {
  if (!isAuthenticatedLifeRequest(request)) {
    return unauthorizedJson()
  }

  const { personId } = (await context.params) as { personId: string }

  try {
    const body = (await request.json().catch(() => null)) as { dueLocalDate?: string } | null
    if (!body?.dueLocalDate || !/^\d{4}-\d{2}-\d{2}$/.test(body.dueLocalDate)) {
      return NextResponse.json({ error: 'A valid due date is required.' }, { status: 400 })
    }

    const person = await getPersonById(personId)
    if (!person) {
      return NextResponse.json({ error: 'Person not found.' }, { status: 404 })
    }

    const task = await createManualTask({
      title: `Follow up with ${person.name}`,
      dueLocalDate: body.dueLocalDate,
      personId: person.id,
    })

    return NextResponse.json({ task })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to create follow-up.' }, { status: 500 })
  }
}
