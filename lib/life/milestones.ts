import 'server-only'

import { OWNER_ID } from '@/lib/life/constants'
import { getSupabaseAdmin } from '@/lib/life/supabase'
import type { ProjectMilestoneRecord } from '@/lib/life/types'

export async function listMilestones(projectSlug: string): Promise<ProjectMilestoneRecord[]> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('project_milestones')
    .select('*')
    .eq('project_slug', projectSlug)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data || []) as ProjectMilestoneRecord[]
}

export async function createMilestone(input: {
  projectSlug: string
  name: string
  targetDate?: string | null
}): Promise<ProjectMilestoneRecord> {
  const name = input.name.trim()
  if (!name) throw new Error('Milestone name is required.')

  const supabase = getSupabaseAdmin()
  const existing = await listMilestones(input.projectSlug)
  const sortOrder = existing.reduce((max, milestone) => Math.max(max, milestone.sort_order), -1) + 1

  const { data, error } = await supabase
    .from('project_milestones')
    .insert({
      project_slug: input.projectSlug,
      name,
      target_date: input.targetDate || null,
      sort_order: sortOrder,
      user_id: OWNER_ID,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as ProjectMilestoneRecord
}

export async function updateMilestone(
  id: string,
  patch: { name?: string; targetDate?: string | null; sortOrder?: number },
): Promise<ProjectMilestoneRecord> {
  const supabase = getSupabaseAdmin()
  const update: Record<string, unknown> = {}
  if (patch.name !== undefined) update.name = patch.name.trim()
  if (patch.targetDate !== undefined) update.target_date = patch.targetDate || null
  if (patch.sortOrder !== undefined) update.sort_order = patch.sortOrder

  const { data, error } = await supabase.from('project_milestones').update(update).eq('id', id).select('*').single()
  if (error) throw error
  return data as ProjectMilestoneRecord
}

export async function deleteMilestone(id: string): Promise<void> {
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('project_milestones').delete().eq('id', id)
  if (error) throw error
}
