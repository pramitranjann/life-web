import { NextRequest, NextResponse } from 'next/server'

import { isAuthenticatedLifeRequest, unauthorizedJson } from '@/lib/life/auth'
import { OWNER_ID } from '@/lib/life/constants'
import { getSupabaseAdmin } from '@/lib/life/supabase'
import { deleteStudioItem } from '@/lib/life/studio'

export async function PATCH(request: NextRequest, context: { params: Promise<unknown> }) {
  if (!isAuthenticatedLifeRequest(request)) {
    return unauthorizedJson()
  }

  const { itemId } = (await context.params) as { itemId: string }

  try {
    const body = (await request.json().catch(() => null)) as { x?: unknown; y?: unknown } | null

    const update: Record<string, number> = {}
    if (typeof body?.x === 'number' && Number.isFinite(body.x)) update.x = body.x
    if (typeof body?.y === 'number' && Number.isFinite(body.y)) update.y = body.y

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('studio_items')
      .update(update)
      .eq('user_id', OWNER_ID)
      .eq('id', itemId)
      .select('*')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ item: data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update Studio item.' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<unknown> }) {
  if (!isAuthenticatedLifeRequest(request)) {
    return unauthorizedJson()
  }

  const { itemId } = (await context.params) as { itemId: string }

  try {
    await deleteStudioItem(itemId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to delete Studio item.' }, { status: 500 })
  }
}
