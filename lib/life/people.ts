import 'server-only'

import { OWNER_ID } from '@/lib/life/constants'
import { getSupabaseAdmin } from '@/lib/life/supabase'
import type { InteractionKind, InteractionRecord, PersonLink, PersonRecord, PersonRelationship, TaskRecord } from '@/lib/life/types'

const RELATIONSHIPS: PersonRelationship[] = ['mentor', 'professor', 'alumni', 'recruiter', 'founder', 'collaborator', 'contact']
const INTERACTION_KINDS: InteractionKind[] = ['met', 'call', 'message', 'showed_work', 'note']

export function normalizeRelationship(value: string | null | undefined): PersonRelationship {
  return RELATIONSHIPS.includes(value as PersonRelationship) ? (value as PersonRelationship) : 'contact'
}

export function normalizeInteractionKind(value: string | null | undefined): InteractionKind {
  return INTERACTION_KINDS.includes(value as InteractionKind) ? (value as InteractionKind) : 'note'
}

function normalizeCadenceDays(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const days = Math.round(value)
  return days > 0 ? days : null
}

export async function listPeople(options?: { includeArchived?: boolean }): Promise<PersonRecord[]> {
  const supabase = getSupabaseAdmin()
  let query = supabase.from('people').select('*').eq('user_id', OWNER_ID)
  if (!options?.includeArchived) {
    query = query.eq('archived', false)
  }
  const { data, error } = await query.order('name', { ascending: true })
  if (error) throw error
  return (data || []) as PersonRecord[]
}

export async function getPersonById(id: string): Promise<PersonRecord | null> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('people').select('*').eq('user_id', OWNER_ID).eq('id', id).maybeSingle()
  if (error) throw error
  return (data as PersonRecord | null) ?? null
}

/** Drops blanks and trims — a stray empty tag from a comma-split is not data. */
function normalizeTags(value: string[] | null | undefined): string[] {
  if (!Array.isArray(value)) return []
  return value.map((tag) => tag.trim()).filter(Boolean)
}

/** A link needs both halves to be usable; a label with no URL goes nowhere. */
function normalizeLinks(value: PersonLink[] | null | undefined): PersonLink[] {
  if (!Array.isArray(value)) return []
  return value
    .map((link) => ({ label: link?.label?.trim() ?? '', url: link?.url?.trim() ?? '' }))
    .filter((link) => link.label && link.url)
}

export async function createPerson(input: {
  name: string
  role?: string | null
  relationship?: string | null
  why?: string | null
  channel?: string | null
  cadenceDays?: number | null
  email?: string | null
  phone?: string | null
  how?: string | null
  links?: PersonLink[] | null
  likes?: string[] | null
  dislikes?: string[] | null
}): Promise<PersonRecord> {
  const name = input.name.trim()
  if (!name) throw new Error('Person name is required.')

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('people')
    .insert({
      user_id: OWNER_ID,
      name,
      role: input.role?.trim() || null,
      relationship: normalizeRelationship(input.relationship),
      why: input.why?.trim() || null,
      channel: input.channel?.trim() || null,
      cadence_days: normalizeCadenceDays(input.cadenceDays),
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      how: input.how?.trim() || null,
      links: normalizeLinks(input.links),
      likes: normalizeTags(input.likes),
      dislikes: normalizeTags(input.dislikes),
    })
    .select('*')
    .single()

  if (error) throw error
  return data as PersonRecord
}

export async function updatePerson(
  id: string,
  patch: {
    name?: string
    role?: string | null
    relationship?: string
    why?: string | null
    channel?: string | null
    cadenceDays?: number | null
    archived?: boolean
    email?: string | null
    phone?: string | null
    how?: string | null
    links?: PersonLink[] | null
    likes?: string[] | null
    dislikes?: string[] | null
  },
): Promise<PersonRecord> {
  const supabase = getSupabaseAdmin()
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.name !== undefined) {
    const name = patch.name.trim()
    if (!name) throw new Error('Person name is required.')
    update.name = name
  }
  if ('role' in patch) update.role = patch.role?.trim() || null
  if (patch.relationship !== undefined) update.relationship = normalizeRelationship(patch.relationship)
  if ('why' in patch) update.why = patch.why?.trim() || null
  if ('channel' in patch) update.channel = patch.channel?.trim() || null
  if ('cadenceDays' in patch) update.cadence_days = normalizeCadenceDays(patch.cadenceDays)
  if (patch.archived !== undefined) update.archived = patch.archived
  // `in patch`, not `!== undefined`: clearing a field means sending null, and
  // an undefined check would silently drop the clear.
  if ('email' in patch) update.email = patch.email?.trim() || null
  if ('phone' in patch) update.phone = patch.phone?.trim() || null
  if ('how' in patch) update.how = patch.how?.trim() || null
  if ('links' in patch) update.links = normalizeLinks(patch.links)
  if ('likes' in patch) update.likes = normalizeTags(patch.likes)
  if ('dislikes' in patch) update.dislikes = normalizeTags(patch.dislikes)

  const { data, error } = await supabase
    .from('people')
    .update(update)
    .eq('user_id', OWNER_ID)
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw error
  return data as PersonRecord
}

export async function listInteractions(personId: string): Promise<InteractionRecord[]> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('interactions')
    .select('*')
    .eq('user_id', OWNER_ID)
    .eq('person_id', personId)
    .order('local_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []) as InteractionRecord[]
}

export async function createInteraction(input: {
  personId: string
  localDate: string
  kind?: string | null
  summary: string
  projectSlug?: string | null
}): Promise<InteractionRecord> {
  const summary = input.summary.trim()
  if (!summary) throw new Error('Interaction summary is required.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.localDate)) throw new Error('A valid date is required.')

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('interactions')
    .insert({
      user_id: OWNER_ID,
      person_id: input.personId,
      local_date: input.localDate,
      kind: normalizeInteractionKind(input.kind),
      summary,
      project_slug: input.projectSlug || null,
    })
    .select('*')
    .single()

  if (error) throw error
  return data as InteractionRecord
}

/**
 * The most recent interaction date per person, for the "due for contact"
 * computation on the index. One query for the whole table — fine at
 * single-user scale.
 */
export async function latestInteractionDates(): Promise<Map<string, string>> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('interactions')
    .select('person_id, local_date')
    .eq('user_id', OWNER_ID)
    .order('local_date', { ascending: false })
  if (error) throw error

  const latest = new Map<string, string>()
  for (const row of (data || []) as Array<{ person_id: string; local_date: string }>) {
    if (!latest.has(row.person_id)) latest.set(row.person_id, row.local_date)
  }
  return latest
}

/** Open follow-up tasks linked to a person. */
export async function listOpenTasksForPerson(personId: string): Promise<TaskRecord[]> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', OWNER_ID)
    .eq('person_id', personId)
    .in('status', ['open', 'in_progress'])
    .order('due_local_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []) as TaskRecord[]
}
