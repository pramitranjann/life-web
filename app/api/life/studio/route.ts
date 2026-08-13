import { NextRequest, NextResponse } from 'next/server'

import { isAuthenticatedLifeRequest, unauthorizedJson } from '@/lib/life/auth'
import { createStudioItem, listStudioItems } from '@/lib/life/studio'

export async function GET(request: NextRequest) {
  if (!isAuthenticatedLifeRequest(request)) {
    return unauthorizedJson()
  }

  try {
    const items = await listStudioItems()
    return NextResponse.json({ items })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load Studio.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthenticatedLifeRequest(request)) {
    return unauthorizedJson()
  }

  try {
    const body = (await request.json().catch(() => null)) as {
      kind?: string
      title?: string
      body?: string | null
      url?: string | null
      tags?: string[]
      projectSlug?: string | null
    } | null

    const title = body?.title?.trim() || body?.url?.trim() || ''
    if (!title) {
      return NextResponse.json({ error: 'Title is required.' }, { status: 400 })
    }

    const item = await createStudioItem({
      kind: body?.kind || 'link',
      title,
      body: body?.body ?? null,
      url: body?.url ?? null,
      tags: body?.tags,
      projectSlug: body?.projectSlug ?? null,
    })
    return NextResponse.json({ item })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to save Studio item.' }, { status: 500 })
  }
}
