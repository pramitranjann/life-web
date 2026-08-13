import 'server-only'

import { cache } from 'react'
import { revalidateTag, unstable_cache } from 'next/cache'

import { LIFE_PROJECTS } from '@/lib/life/projects'
import { getSupabaseAdmin } from '@/lib/life/supabase'
import { OWNER_ID } from '@/lib/life/constants'
import type { LifeProjectClient, ProjectKind, ProjectRecord, ProjectStatus } from '@/lib/life/types'

// Cache tag for the projects list. Every project mutation calls
// revalidateTag(PROJECTS_TAG) so the cross-request cache below is dropped the
// instant the data actually changes.
const PROJECTS_TAG = 'life-projects'

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

/** The seed list, used as a fallback if the projects table can't be reached. */
function seedProjects(): ProjectRecord[] {
  const now = new Date().toISOString()
  return LIFE_PROJECTS.map((project, index) => ({
    slug: project.slug,
    name: project.name,
    summary: project.summary,
    color: null,
    parent_slug: null,
    project_kind: 'general' as const,
    aliases: project.aliases,
    status: 'active' as const,
    target_date: null,
    archived: false,
    sort_order: index,
    created_at: now,
    updated_at: now,
  }))
}

/**
 * Cross-request cache: reads ALL projects (archived included), ordered. Throws
 * on a DB error so failures are never cached; returns [] for an empty table so
 * the caller can fall back to the seed list. Shared by every projects helper,
 * so the table is read at most once per cache window regardless of how many
 * call sites (layout, project map, pickers) ask for it on a single page.
 */
const readAllProjects = unstable_cache(
  async (): Promise<ProjectRecord[]> => {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
    if (error) throw error
    return (data as ProjectRecord[] | null) ?? []
  },
  ['life-projects-all'],
  { tags: [PROJECTS_TAG], revalidate: 3600 },
)

/**
 * All projects, with the seed-list fallback. Per-request memoised on top of the
 * cross-request cache. Falls back to the static seed list so the UI keeps
 * working even if the migration hasn't run yet or the DB is unreachable.
 */
const getAllProjects = cache(async function getAllProjects(): Promise<ProjectRecord[]> {
  try {
    const rows = await readAllProjects()
    return rows.length ? rows : seedProjects()
  } catch (error) {
    console.error('listProjects failed, falling back to seed list', error)
    return seedProjects()
  }
})

/**
 * All active projects, ordered. Filters the shared cached list in memory rather
 * than issuing its own query.
 */
export const listProjects = cache(async function listProjects(
  options: { includeArchived?: boolean } = {},
): Promise<ProjectRecord[]> {
  const all = await getAllProjects()
  return options.includeArchived ? all : all.filter((project) => !project.archived)
})

/** A slug→project map for fast label/colour lookups in server components. */
export const getProjectMap = cache(async function getProjectMap() {
  const projects = await getAllProjects()
  return new Map(projects.map((project) => [project.slug, project]))
})

export async function getProjectBySlugDb(slug: string | null | undefined): Promise<ProjectRecord | null> {
  if (!slug) return null
  return (await getProjectMap()).get(slug) || null
}

export async function getProjectLabelAsync(slug: string | null | undefined): Promise<string | null> {
  if (!slug) return null
  return (await getProjectBySlugDb(slug))?.name || null
}

/** The trimmed-down list handed to client components through context. */
export async function listProjectsClient(): Promise<LifeProjectClient[]> {
  const projects = await listProjects()
  return projects.map((project) => ({
    slug: project.slug,
    name: project.name,
    color: project.color,
    parent_slug: project.parent_slug,
    project_kind: project.project_kind,
  }))
}

/** Resolve a free-text/slug value to a known project slug (or null). */
export async function normalizeProjectSlugDb(value: string | null | undefined): Promise<string | null> {
  if (!value) return null
  const normalized = value.trim().toLowerCase()
  const map = await getProjectMap()
  return map.has(normalized) ? normalized : null
}

/** Detect a project from arbitrary text by matching stored aliases. */
export async function detectProjectSlugDb(text: string | null | undefined): Promise<string | null> {
  if (!text) return null
  const normalized = text.toLowerCase()
  const projects = await listProjects()
  for (const project of projects) {
    for (const alias of project.aliases) {
      if (alias && normalized.includes(alias.toLowerCase())) {
        return project.slug
      }
    }
  }
  return null
}

export async function createProject(input: {
  name: string
  summary?: string | null
  color?: string | null
  aliases?: string[]
  parentSlug?: string | null
  projectKind?: ProjectKind
}): Promise<ProjectRecord> {
  const name = input.name.trim()
  if (!name) throw new Error('Project name is required.')

  const supabase = getSupabaseAdmin()

  // Derive a unique slug from the name.
  const base = slugify(name) || 'project'
  const existing = await listProjects({ includeArchived: true })
  const taken = new Set(existing.map((project) => project.slug))
  const parentSlug = input.parentSlug?.trim().toLowerCase() || null
  if (parentSlug && !taken.has(parentSlug)) {
    throw new Error('Parent project not found.')
  }
  let slug = base
  let suffix = 2
  while (taken.has(slug)) {
    slug = `${base}-${suffix++}`
  }

  const sortOrder = existing.reduce((max, project) => Math.max(max, project.sort_order), -1) + 1

  const { data, error } = await supabase
    .from('projects')
    .insert({
      slug,
      name,
      summary: input.summary?.trim() || null,
      color: input.color || null,
      parent_slug: parentSlug,
      project_kind: input.projectKind || 'general',
      aliases: input.aliases?.map((alias) => alias.trim().toLowerCase()).filter(Boolean) || [],
      sort_order: sortOrder,
    })
    .select('*')
    .single()

  if (error) throw error
  revalidateTag(PROJECTS_TAG, { expire: 0 })
  return data as ProjectRecord
}

export async function updateProject(
  slug: string,
  patch: {
    name?: string
    summary?: string | null
    color?: string | null
    aliases?: string[]
    status?: ProjectStatus
    targetDate?: string | null
    archived?: boolean
    parentSlug?: string | null
    projectKind?: ProjectKind
  },
): Promise<ProjectRecord> {
  const supabase = getSupabaseAdmin()
  const existing = await listProjects({ includeArchived: true })
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.name !== undefined) update.name = patch.name.trim()
  if (patch.summary !== undefined) update.summary = patch.summary?.trim() || null
  if (patch.color !== undefined) update.color = patch.color || null
  if (patch.aliases !== undefined) update.aliases = patch.aliases.map((a) => a.trim().toLowerCase()).filter(Boolean)
  if (patch.status !== undefined) update.status = patch.status
  if (patch.targetDate !== undefined) update.target_date = patch.targetDate || null
  if (patch.archived !== undefined) update.archived = patch.archived
  if (patch.projectKind !== undefined) update.project_kind = patch.projectKind
  if ('parentSlug' in patch) {
    const parentSlug = patch.parentSlug?.trim().toLowerCase() || null
    if (parentSlug === slug) {
      throw new Error('A project cannot be its own parent.')
    }
    if (parentSlug && !existing.some((project) => project.slug === parentSlug)) {
      throw new Error('Parent project not found.')
    }
    update.parent_slug = parentSlug
  }

  const { data, error } = await supabase.from('projects').update(update).eq('slug', slug).select('*').single()
  if (error) throw error
  revalidateTag(PROJECTS_TAG, { expire: 0 })
  return data as ProjectRecord
}

/**
 * Delete a project. Tasks/entries that reference it keep their slug (it simply
 * stops resolving to a name); refs and event mappings cascade away.
 */
export async function deleteProject(slug: string): Promise<void> {
  const supabase = getSupabaseAdmin()
  const [entriesResult, tasksResult] = await Promise.all([
    supabase.from('entries').update({ project_slug: null }).eq('user_id', OWNER_ID).eq('project_slug', slug),
    supabase.from('tasks').update({ project_slug: null }).eq('user_id', OWNER_ID).eq('project_slug', slug),
  ])

  if (entriesResult.error) throw entriesResult.error
  if (tasksResult.error) throw tasksResult.error

  const { error } = await supabase.from('projects').delete().eq('slug', slug)
  if (error) throw error
  revalidateTag(PROJECTS_TAG, { expire: 0 })
}
