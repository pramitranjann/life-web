import { NextRequest, NextResponse } from 'next/server'

import { isAuthenticatedLifeRequest, unauthorizedJson } from '@/lib/life/auth'
import { createProjectPage, listProjectPages } from '@/lib/life/project-pages'

export async function GET(request: NextRequest, context: { params: Promise<unknown> }) {
  if (!isAuthenticatedLifeRequest(request)) {
    return unauthorizedJson()
  }

  const { slug } = (await context.params) as { slug: string }

  try {
    const pages = await listProjectPages(slug)
    return NextResponse.json({ pages })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load pages.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, context: { params: Promise<unknown> }) {
  if (!isAuthenticatedLifeRequest(request)) {
    return unauthorizedJson()
  }

  const { slug } = (await context.params) as { slug: string }

  try {
    const body = (await request.json().catch(() => null)) as {
      title?: string | null
      body?: string | null
    } | null

    const page = await createProjectPage({
      projectSlug: slug,
      title: body?.title ?? null,
      body: body?.body ?? '',
    })

    return NextResponse.json({ page })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to create page.' }, { status: 500 })
  }
}
