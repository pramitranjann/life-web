import { NextRequest, NextResponse } from 'next/server'

import { isAuthenticatedLifeRequest, unauthorizedJson } from '@/lib/life/auth'
import { createProject, listProjects } from '@/lib/life/projects-db'
import type { ProjectKind } from '@/lib/life/types'

function normalizeProjectKind(value: string | null | undefined): ProjectKind {
  return value === 'ux' ? 'ux' : 'general'
}

export async function GET(request: NextRequest) {
  if (!isAuthenticatedLifeRequest(request)) {
    return unauthorizedJson()
  }

  try {
    const includeArchived = request.nextUrl.searchParams.get('archived') === 'true'
    const projects = await listProjects({ includeArchived })
    return NextResponse.json({ projects })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load projects.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthenticatedLifeRequest(request)) {
    return unauthorizedJson()
  }

  try {
    const body = (await request.json().catch(() => null)) as {
      name?: string
      summary?: string | null
      color?: string | null
      aliases?: string[]
      parentSlug?: string | null
      projectKind?: string
    } | null

    if (!body?.name?.trim()) {
      return NextResponse.json({ error: 'Project name is required.' }, { status: 400 })
    }

    const project = await createProject({
      name: body.name,
      summary: body.summary ?? null,
      color: body.color ?? null,
      aliases: body.aliases,
      parentSlug: body.parentSlug ?? null,
      projectKind: normalizeProjectKind(body.projectKind),
    })

    return NextResponse.json({ project })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to create project.' }, { status: 500 })
  }
}
