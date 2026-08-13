import 'server-only'

import { getSupabaseAdmin } from '@/lib/life/supabase'
import { OWNER_ID } from '@/lib/life/constants'
import type { StudioItemKind, StudioItemRecord } from '@/lib/life/types'

const BUCKET = 'studio-items'

export const STUDIO_ITEM_KINDS: Array<{ kind: StudioItemKind; label: string }> = [
  { kind: 'image', label: 'Image' },
  { kind: 'link', label: 'Link' },
  { kind: 'moodboard', label: 'Moodboard' },
  { kind: 'critique', label: 'Critique' },
  { kind: 'note', label: 'Note' },
]

export function normalizeStudioKind(value: string | null | undefined): StudioItemKind {
  return STUDIO_ITEM_KINDS.some((entry) => entry.kind === value) ? (value as StudioItemKind) : 'image'
}

export async function listStudioItems(): Promise<StudioItemRecord[]> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('studio_items')
    .select('*')
    .eq('user_id', OWNER_ID)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data as StudioItemRecord[] | null) ?? []
}

export async function createStudioItem(input: {
  kind?: string | null
  title: string
  body?: string | null
  url?: string | null
  tags?: string[]
  projectSlug?: string | null
  storagePath?: string | null
  width?: number | null
  height?: number | null
  x?: number | null
  y?: number | null
  boardId?: string | null
}): Promise<StudioItemRecord> {
  const title = input.title.trim()
  if (!title) throw new Error('Title is required.')

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('studio_items')
    .insert({
      user_id: OWNER_ID,
      kind: normalizeStudioKind(input.kind),
      title,
      body: input.body?.trim() || null,
      url: input.url?.trim() || null,
      storage_path: input.storagePath || null,
      width: input.width ?? null,
      height: input.height ?? null,
      x: input.x ?? null,
      y: input.y ?? null,
      tags: input.tags?.map((tag) => tag.trim().toLowerCase()).filter(Boolean) || [],
      project_slug: input.projectSlug?.trim() || null,
      board_id: input.boardId || null,
    })
    .select('*')
    .single()

  if (error) throw error
  return data as StudioItemRecord
}

export async function uploadStudioImage(input: {
  file: File
  title?: string | null
  projectSlug?: string | null
  tags?: string[]
}): Promise<StudioItemRecord> {
  const supabase = getSupabaseAdmin()
  const extension = (input.file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png'
  const storagePath = `${OWNER_ID}/${crypto.randomUUID()}.${extension}`
  const buffer = Buffer.from(await input.file.arrayBuffer())

  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, buffer, {
    contentType: input.file.type || 'application/octet-stream',
    upsert: false,
  })
  if (error) throw error

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath)
  const fallbackTitle = input.file.name.replace(/\.[^.]+$/, '').trim() || 'Image'
  return createStudioItem({
    kind: 'image',
    title: input.title?.trim() || fallbackTitle,
    url: data.publicUrl,
    storagePath,
    tags: input.tags,
    projectSlug: input.projectSlug,
  })
}

export async function deleteStudioItem(id: string): Promise<void> {
  const supabase = getSupabaseAdmin()
  const { data: existing } = await supabase
    .from('studio_items')
    .select('storage_path')
    .eq('id', id)
    .eq('user_id', OWNER_ID)
    .single()

  const storagePath = (existing as { storage_path: string | null } | null)?.storage_path
  if (storagePath) {
    await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => undefined)
  }

  const { error } = await supabase.from('studio_items').delete().eq('id', id).eq('user_id', OWNER_ID)
  if (error) throw error
}
