import { NextRequest, NextResponse } from 'next/server'

import { isAuthenticatedLifeRequest, unauthorizedJson } from '@/lib/life/auth'
import { applyUxTemplateSections } from '@/lib/life/ux-templates'

export async function POST(request: NextRequest, context: { params: Promise<unknown> }) {
  if (!isAuthenticatedLifeRequest(request)) {
    return unauthorizedJson()
  }

  const { slug } = (await context.params) as { slug: string }

  try {
    const body = (await request.json().catch(() => null)) as { templateKeys?: string[] } | null
    const templateKeys = Array.isArray(body?.templateKeys) ? body.templateKeys : []
    const result = await applyUxTemplateSections(slug, templateKeys)
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to add UX sections.' }, { status: 500 })
  }
}
