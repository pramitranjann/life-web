import 'server-only'

import { getSupabaseAdmin } from '@/lib/life/supabase'
import { OWNER_ID } from '@/lib/life/constants'
import type { ProjectPageRecord } from '@/lib/life/types'

export async function listProjectPages(projectSlug: string): Promise<ProjectPageRecord[]> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('project_pages')
    .select('*')
    .eq('project_slug', projectSlug)
    .eq('user_id', OWNER_ID)
    .order('sort_order', { ascending: true })
    .order('updated_at', { ascending: false })

  if (error) throw error
  return (data as ProjectPageRecord[] | null) ?? []
}

export async function listProjectPagesByProjects(
  projectSlugs: string[],
): Promise<Record<string, ProjectPageRecord[]>> {
  const result: Record<string, ProjectPageRecord[]> = {}
  if (projectSlugs.length === 0) return result

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('project_pages')
    .select('*')
    .in('project_slug', projectSlugs)
    .eq('user_id', OWNER_ID)
    .order('sort_order', { ascending: true })
    .order('updated_at', { ascending: false })

  if (error) throw error
  for (const page of (data as ProjectPageRecord[] | null) ?? []) {
    ;(result[page.project_slug] ??= []).push(page)
  }
  return result
}

export async function createProjectPage(input: {
  projectSlug: string
  title?: string | null
  body?: string | null
}): Promise<ProjectPageRecord> {
  const supabase = getSupabaseAdmin()
  const existing = await listProjectPages(input.projectSlug)
  const sortOrder = existing.reduce((max, page) => Math.max(max, page.sort_order), -1) + 1

  const { data, error } = await supabase
    .from('project_pages')
    .insert({
      user_id: OWNER_ID,
      project_slug: input.projectSlug,
      title: input.title?.trim() || 'Untitled',
      body: input.body ?? '',
      sort_order: sortOrder,
    })
    .select('*')
    .single()

  if (error) throw error
  return data as ProjectPageRecord
}

export async function updateProjectPage(
  id: string,
  patch: {
    title?: string
    body?: string
    sortOrder?: number
  },
): Promise<ProjectPageRecord> {
  const supabase = getSupabaseAdmin()
  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  if (patch.title !== undefined) update.title = patch.title.trim() || 'Untitled'
  if (patch.body !== undefined) update.body = patch.body
  if (patch.sortOrder !== undefined) update.sort_order = patch.sortOrder

  const { data, error } = await supabase
    .from('project_pages')
    .update(update)
    .eq('id', id)
    .eq('user_id', OWNER_ID)
    .select('*')
    .single()

  if (error) throw error
  return data as ProjectPageRecord
}

export async function deleteProjectPage(id: string): Promise<void> {
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('project_pages').delete().eq('id', id).eq('user_id', OWNER_ID)
  if (error) throw error
}
