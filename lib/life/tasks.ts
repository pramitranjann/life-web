import { TASK_EXTRACTION_SYSTEM_PROMPT, OWNER_ID } from '@/lib/life/constants'
import { callClaude } from '@/lib/life/claude'
import { detectProjectSlug, LIFE_PROJECTS, normalizeProjectSlug } from '@/lib/life/projects'
import { detectProjectSlugDb, normalizeProjectSlugDb } from '@/lib/life/projects-db'
import { getOwnerSettings } from '@/lib/life/settings'
import { getSupabaseAdmin } from '@/lib/life/supabase'
import { addDays, getCurrentLocalDate, getWeekStart } from '@/lib/life/time'
import type { TaskCandidate, TaskPriority, TaskRecord, TaskStatus } from '@/lib/life/types'

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function normalizePriority(value: string | null | undefined): TaskPriority {
  if (value === 'high' || value === 'low') {
    return value
  }

  return 'medium'
}

function normalizeDueLocalDate(value: string | null | undefined) {
  if (!value) {
    return null
  }

  const normalized = value.trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null
}

function extractJsonArray(value: string) {
  const firstBracket = value.indexOf('[')
  const lastBracket = value.lastIndexOf(']')

  if (firstBracket === -1 || lastBracket === -1 || lastBracket <= firstBracket) {
    return []
  }

  const raw = value.slice(firstBracket, lastBracket + 1)

  try {
    const parsed = JSON.parse(raw) as Array<{
      title?: string
      details?: string | null
      projectSlug?: string | null
      priority?: string | null
      dueLocalDate?: string | null
    }>
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function normalizeTaskCandidate(candidate: {
  title?: string
  details?: string | null
  projectSlug?: string | null
  priority?: string | null
  dueLocalDate?: string | null
}): TaskCandidate | null {
  const title = candidate.title?.trim()
  if (!title) {
    return null
  }

  const details = candidate.details?.trim() || null
  const directProject = normalizeProjectSlug(candidate.projectSlug)
  const inferredProject = detectProjectSlug(`${title}\n${details || ''}`)

  return {
    title,
    details,
    projectSlug: directProject || inferredProject,
    priority: normalizePriority(candidate.priority),
    dueLocalDate: normalizeDueLocalDate(candidate.dueLocalDate),
  }
}

function buildTaskPrompt({
  localDate,
  sourceType,
  reportContent,
}: {
  localDate: string
  sourceType: string
  reportContent: string
}) {
  const projectCatalog = LIFE_PROJECTS.map((project) => `- ${project.slug}: ${project.name} — ${project.summary}`).join('\n')

  return [
    `Target local date: ${localDate}`,
    `Source type: ${sourceType}`,
    `Available project slugs:\n${projectCatalog}`,
    `Source report markdown:\n${reportContent}`,
  ].join('\n\n')
}

export async function getTasks(options?: {
  status?: TaskStatus | 'active' | 'all'
  projectSlug?: string | null
}) {
  const supabase = getSupabaseAdmin()
  let query = supabase
    .from('tasks')
    .select('*')
    .eq('user_id', OWNER_ID)

  if (options?.status === 'active' || !options?.status) {
    query = query.in('status', ['open', 'in_progress'])
  } else if (options.status !== 'all') {
    query = query.eq('status', options.status)
  }

  if (options?.projectSlug) {
    query = query.eq('project_slug', options.projectSlug)
  }

  const { data, error } = await query
    .order('due_local_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .returns<TaskRecord[]>()

  if (error) {
    throw error
  }

  return data || []
}

export async function getTaskById(taskId: string): Promise<TaskRecord | null> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', OWNER_ID)
    .eq('id', taskId)
    .maybeSingle()

  if (error) throw error
  return (data as TaskRecord | null) ?? null
}

export async function createManualTask(input: {
  title: string
  details?: string | null
  projectSlug?: string | null
  dueLocalDate?: string | null
  priority?: string | null
  status?: TaskStatus | null
  milestoneId?: string | null
  personId?: string | null
  deskEligible?: boolean | null
}) {
  const title = input.title.trim()
  if (!title) {
    throw new Error('Task title is required.')
  }

  const settings = await getOwnerSettings()
  const supabase = getSupabaseAdmin()
  const status: TaskStatus = input.status === 'in_progress' || input.status === 'done' ? input.status : 'open'

  // Trust an explicit, known project slug; only auto-detect when none was given.
  let projectSlug = await normalizeProjectSlugDb(input.projectSlug)
  if (!projectSlug && !input.projectSlug) {
    projectSlug = await detectProjectSlugDb(title)
  }

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      user_id: OWNER_ID,
      title,
      details: input.details?.trim() || null,
      project_slug: projectSlug,
      milestone_id: input.milestoneId || null,
      due_local_date: normalizeDueLocalDate(input.dueLocalDate),
      priority: normalizePriority(input.priority),
      status,
      completed_at: status === 'done' ? new Date().toISOString() : null,
      source_type: 'manual',
      source_local_date: getCurrentLocalDate(settings.timezone),
      auto_generated: false,
      fingerprint: null,
      desk_eligible: input.deskEligible === true,
      // Only include person_id when a person is actually linked, so plain task
      // creation keeps working before the 008 migration adds the column.
      ...(input.personId ? { person_id: input.personId } : {}),
    })
    .select('*')
    .single()

  if (error) {
    throw error
  }

  const task = data as TaskRecord

  return task
}

export async function updateTask(taskId: string, fields: {
  title?: string
  details?: string | null
  projectSlug?: string | null
  priority?: string | null
  dueLocalDate?: string | null
  calendarEventId?: string | null
  milestoneId?: string | null
  deskEligible?: boolean
}) {
  const supabase = getSupabaseAdmin()
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (fields.title !== undefined) update.title = fields.title
  if ('details' in fields) update.details = fields.details ?? null
  if ('projectSlug' in fields) update.project_slug = fields.projectSlug ?? null
  if (fields.priority !== undefined) update.priority = fields.priority
  if ('dueLocalDate' in fields) update.due_local_date = fields.dueLocalDate ?? null
  if ('calendarEventId' in fields) update.calendar_event_id = fields.calendarEventId ?? null
  if ('milestoneId' in fields) update.milestone_id = fields.milestoneId ?? null
  if ('deskEligible' in fields) update.desk_eligible = fields.deskEligible === true

  const { data, error } = await supabase
    .from('tasks')
    .update(update)
    .eq('user_id', OWNER_ID)
    .eq('id', taskId)
    .select('*')
    .single()

  if (error) throw error
  return data as TaskRecord
}

export async function updateTaskStatus(taskId: string, status: TaskStatus) {
  const supabase = getSupabaseAdmin()
  const completedAt = status === 'done' || status === 'dismissed' ? new Date().toISOString() : null
  const { data, error } = await supabase
    .from('tasks')
    .update({
      status,
      completed_at: completedAt,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', OWNER_ID)
    .eq('id', taskId)
    .select('*')
    .single()

  if (error) {
    throw error
  }

  return data as TaskRecord
}

export async function syncTasksFromReport(options: {
  localDate: string
  sourceType: 'eod' | 'morning' | 'weekly'
  reportId: string
  reportContent: string
}) {
  const supabase = getSupabaseAdmin()
  const raw = await callClaude({
    system: TASK_EXTRACTION_SYSTEM_PROMPT,
    user: buildTaskPrompt(options),
    maxTokens: 900,
  })

  const candidates = extractJsonArray(raw)
    .map(normalizeTaskCandidate)
    .filter((candidate): candidate is TaskCandidate => Boolean(candidate))
    .slice(0, 6)

  const { data: existingRows, error: existingError } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', OWNER_ID)
    .eq('source_type', options.sourceType)
    .eq('source_local_date', options.localDate)
    .returns<TaskRecord[]>()

  if (existingError) {
    throw existingError
  }

  const existing = existingRows || []
  const existingByFingerprint = new Map(
    existing
      .filter((task) => task.fingerprint)
      .map((task) => [task.fingerprint as string, task]),
  )

  const seenFingerprints = new Set<string>()

  for (const candidate of candidates) {
    const fingerprint = `${options.sourceType}:${options.localDate}:${slugify(candidate.title)}`
    seenFingerprints.add(fingerprint)
    const current = existingByFingerprint.get(fingerprint)

    if (current) {
      const { error } = await supabase
        .from('tasks')
        .update({
          title: candidate.title,
          details: candidate.details,
          project_slug: candidate.projectSlug,
          priority: candidate.priority,
          due_local_date: candidate.dueLocalDate,
          source_report_id: options.reportId,
          updated_at: new Date().toISOString(),
          status: current.status,
          completed_at: current.status === 'done' || current.status === 'dismissed' ? current.completed_at : null,
        })
        .eq('id', current.id)

      if (error) {
        throw error
      }
      continue
    }

    const { error } = await supabase
      .from('tasks')
      .insert({
        user_id: OWNER_ID,
        title: candidate.title,
        details: candidate.details,
        project_slug: candidate.projectSlug,
        status: 'open',
        priority: candidate.priority,
        due_local_date: candidate.dueLocalDate,
        source_type: options.sourceType,
        source_local_date: options.localDate,
        source_report_id: options.reportId,
        auto_generated: true,
        fingerprint,
      })

    if (error) {
      throw error
    }
  }

  const staleTasks = existing.filter(
    (task) =>
      task.auto_generated &&
      task.fingerprint &&
      !seenFingerprints.has(task.fingerprint) &&
      task.status !== 'done' &&
      task.status !== 'dismissed',
  )

  for (const staleTask of staleTasks) {
    const { error } = await supabase
      .from('tasks')
      .update({
        status: 'dismissed',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', staleTask.id)

    if (error) {
      throw error
    }
  }

  return candidates
}

export async function getWeeklyTaskSnapshot(localDate?: string) {
  const settings = await getOwnerSettings()
  const baseDate = localDate || getCurrentLocalDate(settings.timezone)
  const weekStart = getWeekStart(baseDate)
  const weekEnd = addDays(weekStart, 6)
  const supabase = getSupabaseAdmin()
  const [{ data: openTasks, error: openError }, { data: completedTasks, error: completedError }] = await Promise.all([
    supabase
      .from('tasks')
      .select('*')
      .eq('user_id', OWNER_ID)
      .in('status', ['open', 'in_progress'])
      .order('priority', { ascending: true })
      .returns<TaskRecord[]>(),
    supabase
      .from('tasks')
      .select('*')
      .eq('user_id', OWNER_ID)
      .eq('status', 'done')
      .gte('completed_at', `${weekStart}T00:00:00.000Z`)
      .lte('completed_at', `${weekEnd}T23:59:59.999Z`)
      .returns<TaskRecord[]>(),
  ])

  if (openError || completedError) {
    throw openError || completedError
  }

  return {
    weekStart,
    weekEnd,
    openTasks: openTasks || [],
    completedTasks: completedTasks || [],
  }
}
