import 'server-only'

import { OWNER_ID } from '@/lib/life/constants'
import { getSupabaseAdmin } from '@/lib/life/supabase'
import type { ProjectRefKind, ProjectRefRecord } from '@/lib/life/types'

const BUCKET = 'project-refs'

export async function listRefs(projectSlug: string): Promise<ProjectRefRecord[]> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('project_refs')
    .select('*')
    .eq('project_slug', projectSlug)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []) as ProjectRefRecord[]
}

export async function createRef(input: {
  projectSlug: string
  kind: ProjectRefKind
  title?: string | null
  url?: string | null
  body?: string | null
  storagePath?: string | null
}): Promise<ProjectRefRecord> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('project_refs')
    .insert({
      project_slug: input.projectSlug,
      kind: input.kind,
      title: input.title?.trim() || null,
      url: input.url?.trim() || null,
      body: input.body?.trim() || null,
      storage_path: input.storagePath || null,
      user_id: OWNER_ID,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as ProjectRefRecord
}

export async function deleteRef(id: string): Promise<void> {
  const supabase = getSupabaseAdmin()

  // Clean up the storage object first if this ref was an upload.
  const { data: existing } = await supabase.from('project_refs').select('storage_path').eq('id', id).single()
  const storagePath = (existing as { storage_path: string | null } | null)?.storage_path
  if (storagePath) {
    await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => undefined)
  }

  const { error } = await supabase.from('project_refs').delete().eq('id', id)
  if (error) throw error
}

/** Upload an image file to the public bucket and return its path + public URL. */
export async function uploadRefImage(
  projectSlug: string,
  file: File,
): Promise<{ storagePath: string; url: string }> {
  const supabase = getSupabaseAdmin()
  const extension = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png'
  const storagePath = `${projectSlug}/${crypto.randomUUID()}.${extension}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, buffer, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  })
  if (error) throw error

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath)
  return { storagePath, url: data.publicUrl }
}
