import { NextRequest, NextResponse } from 'next/server'

import { isAuthenticatedLifeRequest, unauthorizedJson } from '@/lib/life/auth'
import { createRef, listRefs, uploadRefImage } from '@/lib/life/project-refs'
import type { ProjectRefKind } from '@/lib/life/types'

function normalizeKind(value: string | null | undefined): ProjectRefKind {
  if (value === 'note' || value === 'image') return value
  return 'link'
}

export async function GET(request: NextRequest, context: { params: Promise<unknown> }) {
  if (!isAuthenticatedLifeRequest(request)) {
    return unauthorizedJson()
  }

  const { slug } = (await context.params) as { slug: string }

  try {
    const refs = await listRefs(slug)
    return NextResponse.json({ refs })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load references.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, context: { params: Promise<unknown> }) {
  if (!isAuthenticatedLifeRequest(request)) {
    return unauthorizedJson()
  }

  const { slug } = (await context.params) as { slug: string }
  const contentType = request.headers.get('content-type') || ''

  try {
    // Multipart = an image upload; JSON = a link or a note.
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      const file = formData.get('file')
      if (!(file instanceof File)) {
        return NextResponse.json({ error: 'No image file provided.' }, { status: 400 })
      }
      const title = typeof formData.get('title') === 'string' ? String(formData.get('title')) : null
      const { storagePath, url } = await uploadRefImage(slug, file)
      const ref = await createRef({ projectSlug: slug, kind: 'image', title, url, storagePath })
      return NextResponse.json({ ref })
    }

    const body = (await request.json().catch(() => null)) as {
      kind?: string
      title?: string | null
      url?: string | null
      body?: string | null
    } | null

    const kind = normalizeKind(body?.kind)
    if (kind === 'link' && !body?.url?.trim()) {
      return NextResponse.json({ error: 'A URL is required for a link.' }, { status: 400 })
    }
    if (kind === 'note' && !body?.body?.trim()) {
      return NextResponse.json({ error: 'Note text is required.' }, { status: 400 })
    }

    const ref = await createRef({
      projectSlug: slug,
      kind,
      title: body?.title ?? null,
      url: body?.url ?? null,
      body: body?.body ?? null,
    })
    return NextResponse.json({ ref })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to add reference.' }, { status: 500 })
  }
}
