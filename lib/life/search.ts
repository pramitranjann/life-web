import 'server-only'

import { OWNER_ID } from '@/lib/life/constants'
import { getEntryPresentation } from '@/lib/life/entries'
import { listProjects } from '@/lib/life/projects-db'
import { getOwnerSettings } from '@/lib/life/settings'
import { getSupabaseAdmin } from '@/lib/life/supabase'
import { getLocalTimeLabel, localDateTimeToUtc } from '@/lib/life/time'
import type {
  CalendarEventRecord,
  EntryRecord,
  LifeSearchResults,
  PersonRecord,
  ProjectRecord,
  TaskRecord,
} from '@/lib/life/types'

type SearchCategory = 'projects' | 'people' | 'tasks'

const CATEGORY_INTENTS: Record<string, SearchCategory> = {
  project: 'projects',
  projects: 'projects',
  person: 'people',
  people: 'people',
  contacts: 'people',
  task: 'tasks',
  tasks: 'tasks',
}

function shortDay(localDate: string, timeZone: string) {
  const date = localDateTimeToUtc(localDate, timeZone, 12, 0)
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).formatToParts(date)
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${lookup.weekday} ${lookup.day} ${lookup.month}`
}

function sanitizeSearchQuery(value: string) {
  return value.replace(/[%,]/g, ' ').trim()
}

function matchesProject(project: ProjectRecord, term: string) {
  const haystack = [project.name, project.summary, project.slug, ...project.aliases]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return haystack.includes(term.toLowerCase())
}

function projectHomeHit() {
  return {
    id: 'projects-home',
    href: '/projects',
    name: 'Projects home',
    summary: 'Browse every project',
    isHome: true,
  }
}

function peopleHomeHit() {
  return {
    id: 'people-home',
    href: '/people',
    name: 'People home',
    role: null,
    relationship: null,
    email: null,
    isHome: true,
  }
}

function taskHomeHit() {
  return {
    id: 'tasks-home',
    href: '/tasks',
    title: 'Tasks home',
    isHome: true,
    status: 'open' as const,
    priority: 'medium' as const,
    projectLabel: 'Browse every task',
    dueLabel: null,
  }
}

export async function searchLife(rawQuery: string): Promise<LifeSearchResults> {
  const query = rawQuery.trim()
  const hasQuery = query.length > 0
  const term = sanitizeSearchQuery(query)

  if (term.length < 2) {
    return {
      query,
      hasQuery,
      totalResults: 0,
      projects: [],
      people: [],
      tasks: [],
      entries: [],
      events: [],
    }
  }

  const settings = await getOwnerSettings()
  const timeZone = settings.timezone
  const supabase = getSupabaseAdmin()
  const projects = await listProjects()
  const categoryIntent = CATEGORY_INTENTS[term.toLowerCase()] || null
  const like = `%${term}%`
  const matchingProjectSlugs = projects
    .filter((project) => matchesProject(project, term))
    .map((project) => project.slug)
  const shouldSearchProjects = !categoryIntent || categoryIntent === 'projects'
  const shouldSearchPeople = !categoryIntent || categoryIntent === 'people'
  const shouldSearchTasks = !categoryIntent || categoryIntent === 'tasks'
  const shouldSearchEntriesAndEvents = !categoryIntent

  const getTaskResults = async () => {
    const baseTaskQuery = () => supabase
      .from('tasks')
      .select('*')
      .eq('user_id', OWNER_ID)
      .neq('status', 'dismissed')

    if (categoryIntent === 'tasks') {
      return baseTaskQuery()
        .order('created_at', { ascending: false })
        .limit(24)
        .returns<TaskRecord[]>()
    }

    const textResult = await baseTaskQuery()
      .or(`title.ilike.${like},details.ilike.${like}`)
      .order('created_at', { ascending: false })
      .limit(24)
      .returns<TaskRecord[]>()
    if (textResult.error || matchingProjectSlugs.length === 0) return textResult

    const projectResult = await baseTaskQuery()
      .in('project_slug', matchingProjectSlugs)
      .order('created_at', { ascending: false })
      .limit(24)
      .returns<TaskRecord[]>()
    if (projectResult.error) return projectResult

    const tasks = new Map<string, TaskRecord>()
    for (const task of [...(textResult.data || []), ...(projectResult.data || [])]) {
      tasks.set(task.id, task)
    }
    return {
      data: Array.from(tasks.values())
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 24),
      error: null,
    }
  }

  const [taskRes, entryRes, eventRes, peopleRes] = await Promise.all([
    shouldSearchTasks
      ? getTaskResults()
      : Promise.resolve({ data: [], error: null }),
    shouldSearchEntriesAndEvents
      ? supabase
      .from('entries')
      .select('*')
      .eq('user_id', OWNER_ID)
      .ilike('content', like)
      .order('created_at', { ascending: false })
      .limit(24)
      .returns<EntryRecord[]>()
      : Promise.resolve({ data: [], error: null }),
    shouldSearchEntriesAndEvents
      ? supabase
      .from('calendar_events')
      .select('*')
      .eq('user_id', OWNER_ID)
      .ilike('title', like)
      .order('start_time', { ascending: false })
      .limit(24)
      .returns<CalendarEventRecord[]>()
      : Promise.resolve({ data: [], error: null }),
    shouldSearchPeople
      ? (() => {
        const peopleQuery = supabase
          .from('people')
          .select('*')
          .eq('user_id', OWNER_ID)
          .eq('archived', false)
        const filteredQuery = categoryIntent === 'people'
          ? peopleQuery
          : peopleQuery.or(`name.ilike.${like},role.ilike.${like},relationship.ilike.${like},email.ilike.${like}`)
        return filteredQuery
          .order('name', { ascending: true })
          .limit(24)
          .returns<PersonRecord[]>()
      })()
      : Promise.resolve({ data: [], error: null }),
  ])

  if (taskRes.error) throw new Error(taskRes.error.message)
  if (entryRes.error) throw new Error(entryRes.error.message)
  if (eventRes.error) throw new Error(eventRes.error.message)
  if (peopleRes.error) throw new Error(peopleRes.error.message)

  const projectHits = shouldSearchProjects
    ? projects
      .filter((project) => categoryIntent === 'projects' || matchesProject(project, term))
      .slice(0, 24)
      .map((project) => ({
        id: project.slug,
        href: `/projects/${project.slug}`,
        name: project.name,
        summary: project.summary,
        isHome: false,
      }))
    : []
  const projectResults = projectHits.length > 0 || categoryIntent === 'projects'
    ? [projectHomeHit(), ...projectHits]
    : []

  const personHits = (peopleRes.data || []).map((person) => ({
    id: person.id,
    href: `/people/${person.id}`,
    name: person.name,
    role: person.role,
    relationship: person.relationship,
    email: person.email,
    isHome: false,
  }))
  const peopleResults = personHits.length > 0 || categoryIntent === 'people'
    ? [peopleHomeHit(), ...personHits]
    : []

  const taskHits = (taskRes.data || []).map((task) => ({
    id: task.id,
    href: '/tasks',
    title: task.title,
    isHome: false,
    status: task.status,
    priority: task.priority,
    projectLabel: task.project_slug
      ? projects.find((project) => project.slug === task.project_slug)?.name || task.project_slug
      : 'General',
    dueLabel: task.due_local_date ? shortDay(task.due_local_date, timeZone) : null,
  }))
  const tasks = taskHits.length > 0 || categoryIntent === 'tasks'
    ? [taskHomeHit(), ...taskHits]
    : []

  const entries = (entryRes.data || []).map((entry) => {
    const presentation = getEntryPresentation(entry)
    return {
      id: entry.id,
      href: '/history',
      content: entry.content,
      kind: presentation.kind,
      kindColor: presentation.color,
      projectLabel: entry.project_slug
      ? projects.find((project) => project.slug === entry.project_slug)?.name || entry.project_slug
        : null,
      dayLabel: shortDay(entry.local_date, timeZone),
      timeLabel: getLocalTimeLabel(entry.created_at, timeZone),
    }
  })

  const events = (eventRes.data || []).map((event) => ({
    id: event.id,
    href: '/month',
    title: event.title || '(Untitled event)',
    timeLabel: event.all_day
      ? 'All day'
      : event.start_time
        ? getLocalTimeLabel(event.start_time, timeZone)
        : '—',
    dayLabel: shortDay(event.local_date, timeZone),
  }))

  return {
    query,
    hasQuery,
    totalResults: projectResults.length + peopleResults.length + tasks.length + entries.length + events.length,
    projects: projectResults,
    people: peopleResults,
    tasks,
    entries,
    events,
  }
}
