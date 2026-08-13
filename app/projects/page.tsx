import { redirect } from 'next/navigation'

import { ProjectsOverview, type ProjectOverviewItem } from '@/components/life/projects/ProjectsOverview'
import { isAdminSession } from '@/lib/admin-auth'
import { listProjects } from '@/lib/life/projects-db'
import { getTasks } from '@/lib/life/tasks'
import { getCurrentLocalDate } from '@/lib/life/time'

export default async function LifeProjectsPage() {
  if (!(await isAdminSession())) {
    redirect('/login?next=/projects')
  }

  const timezone = 'Asia/Kuala_Lumpur'
  const today = getCurrentLocalDate(timezone)
  const [projects, tasks] = await Promise.all([
    listProjects(),
    getTasks({ status: 'all' }).then((rows) => rows.filter((task) => task.status !== 'dismissed')),
  ])

  const projectMap = new Map(projects.map((project) => [project.slug, project]))
  const childrenByParent = new Map<string, typeof projects>()
  for (const project of projects) {
    if (!project.parent_slug) continue
    const siblings = childrenByParent.get(project.parent_slug) || []
    siblings.push(project)
    childrenByParent.set(project.parent_slug, siblings)
  }

  const orderedProjects: Array<{ project: (typeof projects)[number]; depth: number }> = []
  const seen = new Set<string>()
  function visit(project: (typeof projects)[number], depth: number) {
    if (seen.has(project.slug)) return
    seen.add(project.slug)
    orderedProjects.push({ project, depth })
    for (const child of childrenByParent.get(project.slug) || []) visit(child, depth + 1)
  }
  for (const project of projects.filter((item) => !item.parent_slug)) visit(project, 0)
  // Orphans or a malformed cycle should remain reachable from the index.
  for (const project of projects) visit(project, 0)

  const items: ProjectOverviewItem[] = orderedProjects.map(({ project, depth }) => {
    const scoped = tasks.filter((task) => task.project_slug === project.slug)
    const open = scoped.filter((task) => task.status !== 'done')
    const done = scoped.filter((task) => task.status === 'done')
    const overdue = open.filter((task) => task.due_local_date != null && task.due_local_date < today)
    const lastUpdated = scoped.reduce(
      (max, task) => (task.updated_at > max ? task.updated_at : max),
      project.updated_at,
    )
    return {
      slug: project.slug,
      name: project.name,
      summary: project.summary,
      color: project.color,
      projectKind: project.project_kind,
      status: project.status,
      targetDate: project.target_date,
      open: open.length,
      done: done.length,
      overdue: overdue.length,
      total: scoped.length,
      lastUpdated,
      parentSlug: project.parent_slug,
      parentName: project.parent_slug ? projectMap.get(project.parent_slug)?.name || project.parent_slug : null,
      childCount: childrenByParent.get(project.slug)?.length || 0,
      depth,
    }
  })

  return <ProjectsOverview items={items} today={today} />
}
