import { NextRequest, NextResponse } from 'next/server'

import { isAuthenticatedLifeRequest, unauthorizedJson } from '@/lib/life/auth'
import { deleteProject, updateProject } from '@/lib/life/projects-db'
import type { ProjectKind, ProjectStatus } from '@/lib/life/types'

function normalizeStatus(value: string | null | undefined): ProjectStatus | undefined {
  if (value === 'active' || value === 'on_hold' || value === 'done') return value
  return undefined
}

function normalizeProjectKind(value: string | null | undefined): ProjectKind | undefined {
  if (value === 'general' || value === 'ux') return value
  return undefined
}

export async function PATCH(request: NextRequest, context: { params: Promise<unknown> }) {
  if (!isAuthenticatedLifeRequest(request)) {
    return unauthorizedJson()
  }

  const { slug } = (await context.params) as { slug: string }

  try {
    const body = (await request.json().catch(() => null)) as {
      name?: string
      summary?: string | null
      color?: string | null
      aliases?: string[]
      status?: string
      targetDate?: string | null
      archived?: boolean
      parentSlug?: string | null
      projectKind?: string
    } | null

    const project = await updateProject(slug, {
      name: body?.name,
      summary: body?.summary,
      color: body?.color,
      aliases: body?.aliases,
      status: normalizeStatus(body?.status),
      targetDate: body && 'targetDate' in body ? body.targetDate : undefined,
      archived: body?.archived,
      ...(body && 'parentSlug' in body ? { parentSlug: body.parentSlug } : {}),
      ...(body && 'projectKind' in body ? { projectKind: normalizeProjectKind(body.projectKind) } : {}),
    })

    return NextResponse.json({ project })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update project.' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<unknown> }) {
  if (!isAuthenticatedLifeRequest(request)) {
    return unauthorizedJson()
  }

  const { slug } = (await context.params) as { slug: string }

  try {
    await deleteProject(slug)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to delete project.' }, { status: 500 })
  }
}
