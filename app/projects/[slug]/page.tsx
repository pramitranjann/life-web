import { notFound, redirect } from 'next/navigation'

import { ProjectWorkspace } from '@/components/life/projects/ProjectWorkspace'
import { isAdminSession } from '@/lib/admin-auth'
import { getCalendarEventsByIds } from '@/lib/life/calendar'
import { listMilestones } from '@/lib/life/milestones'
import { getProjectEvents } from '@/lib/life/project-events'
import { listProjectPages, listProjectPagesByProjects } from '@/lib/life/project-pages'
import { listRefs } from '@/lib/life/project-refs'
import { getProjectBySlugDb, listProjects } from '@/lib/life/projects-db'
import { getOwnerSettings } from '@/lib/life/settings'
import { getTasks } from '@/lib/life/tasks'
import { getCurrentLocalDate } from '@/lib/life/time'
import { UX_TEMPLATE_SECTIONS } from '@/lib/life/ux-templates'
import type { TaskLinkedEvent } from '@/lib/life/types'

export default async function ProjectDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  if (!(await isAdminSession())) {
    redirect('/login?next=/projects')
  }

  const { slug } = await params
  const project = await getProjectBySlugDb(slug)
  if (!project) {
    notFound()
  }

  const settings = await getOwnerSettings()
  const today = getCurrentLocalDate(settings.timezone)

  const [tasks, milestones, refs, pages, allProjects] = await Promise.all([
    getTasks({ status: 'all', projectSlug: slug }).then((rows) => rows.filter((task) => task.status !== 'dismissed')),
    listMilestones(slug),
    listRefs(slug),
    listProjectPages(slug),
    listProjects(),
  ])
  const parentProject = project.parent_slug ? allProjects.find((candidate) => candidate.slug === project.parent_slug) || null : null
  const subprojects = allProjects.filter((candidate) => candidate.parent_slug === project.slug)
  const treeRootProject = parentProject || project
  const treeProjectSlugs = Array.from(
    new Set([
      treeRootProject.slug,
      ...allProjects.filter((candidate) => candidate.parent_slug === treeRootProject.slug).map((candidate) => candidate.slug),
    ]),
  )
  // Batch-load pages for the rest of the visible tree in a single query, then
  // reuse the already-fetched pages for the current project.
  const fetchedTreePages = await listProjectPagesByProjects(treeProjectSlugs.filter((treeSlug) => treeSlug !== slug))
  const treePagesByProject: Record<string, typeof pages> = { ...fetchedTreePages, [slug]: pages }

  // Events tied to this project = explicitly mapped events + events linked from
  // the project's own tasks.
  const taskEventIds = tasks.map((task) => task.calendar_event_id).filter((id): id is string => Boolean(id))
  const events = await getProjectEvents(slug, taskEventIds).catch(() => [])

  // Denormalise linked events so task cards can render their time/title.
  const linkedEvents: Record<string, TaskLinkedEvent> = {}
  let linkedEventsFailed = false
  if (taskEventIds.length > 0) {
    try {
      const linked = await getCalendarEventsByIds(taskEventIds)
      for (const event of linked) {
        linkedEvents[event.id] = {
          id: event.id,
          title: event.title || 'Event',
          startTime: event.start_time,
          allDay: event.all_day,
          htmlLink: event.html_link,
        }
      }
    } catch (error) {
      console.error('Failed to load linked events for project', error)
      // The page used to render as if the events simply didn't exist, which
      // looks correct and is wrong. Tell the workspace so it can say so.
      linkedEventsFailed = true
    }
  }

  return (
    <ProjectWorkspace
      project={project}
      tasks={tasks}
      milestones={milestones}
      refs={refs}
      pages={pages}
      allProjects={allProjects}
      treePagesByProject={treePagesByProject}
      parentProject={parentProject}
      subprojects={subprojects}
      events={events}
      linkedEvents={linkedEvents}
      linkedEventsFailed={linkedEventsFailed}
      today={today}
      timezone={settings.timezone}
      uxTemplates={UX_TEMPLATE_SECTIONS.map(({ key, name, phase, summary, color }) => ({ key, name, phase, summary, color }))}
    />
  )
}
