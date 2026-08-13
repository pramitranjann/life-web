import { NextRequest, NextResponse } from 'next/server'

import { isAuthenticatedLifeRequest, unauthorizedJson } from '@/lib/life/auth'
import { OWNER_ID } from '@/lib/life/constants'
import { normalizeProjectSlug } from '@/lib/life/projects'
import { getSupabaseAdmin } from '@/lib/life/supabase'

async function getStoredEntry(entryId: string) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('entries')
    .select('id')
    .eq('user_id', OWNER_ID)
    .eq('id', entryId)
    .maybeSingle<{ id: string }>()

  if (error) throw error
  return data
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ entryId: string }> },
) {
  if (!isAuthenticatedLifeRequest(request)) {
    return unauthorizedJson()
  }

  const { entryId } = await context.params

  try {
    const stored = await getStoredEntry(entryId)
    if (!stored) {
      return NextResponse.json({ error: 'Entry not found.' }, { status: 404 })
    }

    const body = (await request.json().catch(() => null)) as
      | { content?: string; projectSlug?: string | null }
      | null

    const update: Record<string, unknown> = {}

    if (typeof body?.content === 'string') {
      const content = body.content.trim()
      if (!content) {
        return NextResponse.json({ error: 'Content is required.' }, { status: 400 })
      }
      update.content = content
    }

    if (body && 'projectSlug' in body) {
      update.project_slug = normalizeProjectSlug(body.projectSlug) || null
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('entries')
      .update(update)
      .eq('user_id', OWNER_ID)
      .eq('id', entryId)
      .select('*')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ entry: data })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Entry update failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ entryId: string }> },
) {
  if (!isAuthenticatedLifeRequest(request)) {
    return unauthorizedJson()
  }

  const { entryId } = await context.params

  try {
    const stored = await getStoredEntry(entryId)
    if (!stored) {
      return NextResponse.json({ error: 'Entry not found.' }, { status: 404 })
    }

    const supabase = getSupabaseAdmin()
    const { error } = await supabase
      .from('entries')
      .delete()
      .eq('user_id', OWNER_ID)
      .eq('id', entryId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Entry deletion failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
