import 'server-only'

import { OWNER_ID } from '@/lib/life/constants'
import { getSupabaseAdmin } from '@/lib/life/supabase'
import type { CalendarEventRecord } from '@/lib/life/types'

/** Event ids explicitly mapped to a project (survives the Google sync wipe). */
export async function listProjectEventIds(projectSlug: string): Promise<string[]> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('project_events').select('event_id').eq('project_slug', projectSlug)
  if (error) throw error
  return (data || []).map((row) => (row as { event_id: string }).event_id)
}

export async function addProjectEvent(projectSlug: string, eventId: string): Promise<void> {
  const supabase = getSupabaseAdmin()
  const { error } = await supabase
    .from('project_events')
    .upsert({ project_slug: projectSlug, event_id: eventId, user_id: OWNER_ID }, { onConflict: 'project_slug,event_id' })
  if (error) throw error
}

export async function removeProjectEvent(projectSlug: string, eventId: string): Promise<void> {
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('project_events').delete().eq('project_slug', projectSlug).eq('event_id', eventId)
  if (error) throw error
}

/**
 * Calendar events for a project = events explicitly mapped to it plus events
 * linked from the project's tasks. Returns upcoming-first.
 */
export async function getProjectEvents(
  projectSlug: string,
  extraEventIds: string[] = [],
): Promise<CalendarEventRecord[]> {
  const mapped = await listProjectEventIds(projectSlug)
  const ids = Array.from(new Set([...mapped, ...extraEventIds].filter(Boolean)))
  if (ids.length === 0) return []

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('user_id', OWNER_ID)
    .in('id', ids)
    .order('start_time', { ascending: true })
  if (error) throw error
  return (data || []) as CalendarEventRecord[]
}
