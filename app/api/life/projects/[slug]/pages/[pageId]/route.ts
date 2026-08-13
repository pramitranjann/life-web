import { NextRequest, NextResponse } from 'next/server'

import { isAuthenticatedLifeRequest, unauthorizedJson } from '@/lib/life/auth'
import { deleteProjectPage, updateProjectPage } from '@/lib/life/project-pages'

export async function PATCH(request: NextRequest, context: { params: Promise<unknown> }) {
  if (!isAuthenticatedLifeRequest(request)) {
    return unauthorizedJson()
  }

  const { pageId } = (await context.params) as { pageId: string }

  try {
    const body = (await request.json().catch(() => null)) as {
      title?: string
      body?: string
      sortOrder?: number
    } | null

    const page = await updateProjectPage(pageId, {
      title: body?.title,
      body: body?.body,
      sortOrder: body?.sortOrder,
    })

    return NextResponse.json({ page })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update page.' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<unknown> }) {
  if (!isAuthenticatedLifeRequest(request)) {
    return unauthorizedJson()
  }

  const { pageId } = (await context.params) as { pageId: string }

  try {
    await deleteProjectPage(pageId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to delete page.' }, { status: 500 })
  }
}
