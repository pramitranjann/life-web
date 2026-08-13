'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

import { LifeCalendar } from '@/components/life/tasks/LifeCalendar'
import { LifeConfirm } from '@/components/life/ui/LifeConfirm'
import { fetchJson } from '@/lib/life/client'
import type {
  CalendarEventRecord,
  ProjectMilestoneRecord,
  ProjectPageRecord,
  ProjectRecord,
  ProjectRefRecord,
  ProjectStatus,
  TaskLinkedEvent,
  TaskRecord,
} from '@/lib/life/types'
import { ProjectEvents } from './ProjectEvents'
import { ProjectPages } from './ProjectPages'
import { ProjectRefs } from './ProjectRefs'
import { ProjectTasks } from './ProjectTasks'
import { ProjectUxTemplates } from './ProjectUxTemplates'
import { healthTone, progressPct, relativeDueLabel, STATUS_LABEL, STATUS_OPTIONS } from './shared'

// Pages are no longer a tab — they open as documents from the rail.
type Tab = 'overview' | 'tasks' | 'events' | 'refs'

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 }
const PROJECT_SWATCHES = ['#e9b765', '#7fd899', '#9aa6ff', '#e58fb8', '#6fcfd6', '#c79bff', '#ff6c61']

function compareProjects(a: ProjectRecord, b: ProjectRecord) {
  return a.sort_order - b.sort_order || a.name.localeCompare(b.name)
}

function comparePages(a: ProjectPageRecord, b: ProjectPageRecord) {
  return a.sort_order - b.sort_order || a.title.localeCompare(b.title)
}

// Same date treatment as ProjectEvents.formatEventWhen.
function formatEventWhen(event: CalendarEventRecord, timezone: string) {
  if (!event.start_time) return event.local_date
  const date = new Date(event.start_time)
  const day = date.toLocaleDateString('en-GB', { timeZone: timezone, weekday: 'short', day: 'numeric', month: 'short' })
  if (event.all_day) return day
  const time = date.toLocaleTimeString('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit' })
  return `${day} · ${time}`
}

function formatPageUpdated(iso: string, timezone: string) {
  return new Date(iso).toLocaleDateString('en-GB', { timeZone: timezone, day: 'numeric', month: 'short' })
}

export function ProjectWorkspace({
  project,
  tasks,
  milestones,
  refs,
  pages,
  allProjects,
  treePagesByProject,
  parentProject,
  subprojects,
  events,
  linkedEvents,
  linkedEventsFailed = false,
  today,
  timezone,
  uxTemplates,
}: {
  project: ProjectRecord
  tasks: TaskRecord[]
  milestones: ProjectMilestoneRecord[]
  refs: ProjectRefRecord[]
  pages: ProjectPageRecord[]
  allProjects: ProjectRecord[]
  treePagesByProject: Record<string, ProjectPageRecord[]>
  parentProject: ProjectRecord | null
  subprojects: ProjectRecord[]
  events: CalendarEventRecord[]
  linkedEvents: Record<string, TaskLinkedEvent>
  /** Calendar lookup failed server-side; events are missing, not absent. */
  linkedEventsFailed?: boolean
  today: string
  timezone: string
  uxTemplates: Array<{ key: string; name: string; phase: string; summary: string; color: string }>
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const activePageId = searchParams.get('page')
  // A page open in the URL takes over the pane entirely, so the tab behind it
  // only matters once the page is closed — Overview is the right thing to
  // land back on.
  const [tab, setTab] = useState<Tab>('overview')
  const [treeOpen, setTreeOpen] = useState(true)

  // On a phone the rail stacks above the project, so leaving it open buries the
  // thing you navigated to under a full list of everything else. Collapse it on
  // mount at narrow widths; the toggle still works from there.
  useEffect(() => {
    if (window.matchMedia('(max-width: 720px)').matches) setTreeOpen(false)
  }, [])

  const [status, setStatus] = useState<ProjectStatus>(project.status)
  const [projectKind, setProjectKind] = useState(project.project_kind)
  const [targetDate, setTargetDate] = useState<string | null>(project.target_date)
  const [calOpen, setCalOpen] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)
  const [kindOpen, setKindOpen] = useState(false)
  const [overflowOpen, setOverflowOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dateBtnRef = useRef<HTMLButtonElement>(null)
  const propsRef = useRef<HTMLDivElement>(null)

  // Close the property menus on outside click or Escape.
  useEffect(() => {
    if (!statusOpen && !kindOpen && !overflowOpen) return
    function close() {
      setStatusOpen(false)
      setKindOpen(false)
      setOverflowOpen(false)
    }
    function onPointerDown(event: MouseEvent) {
      if (!propsRef.current?.contains(event.target as Node)) close()
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [statusOpen, kindOpen, overflowOpen])

  // Inline name / summary editing.
  const [name, setName] = useState(project.name)
  const [summary, setSummary] = useState(project.summary || '')
  const [editName, setEditName] = useState(false)
  const [editSummary, setEditSummary] = useState(false)
  const [addingSubproject, setAddingSubproject] = useState(false)
  const [subprojectName, setSubprojectName] = useState('')
  const [subprojectSummary, setSubprojectSummary] = useState('')
  const [subprojectColor, setSubprojectColor] = useState(project.color || PROJECT_SWATCHES[0])
  const [savingSubproject, setSavingSubproject] = useState(false)
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<{ slug: string; name: string; redirectTo?: string } | null>(null)
  const [creatingPage, setCreatingPage] = useState(false)

  const open = tasks.filter((task) => task.status !== 'done')
  const done = tasks.filter((task) => task.status === 'done')
  const overdue = open.filter((task) => task.due_local_date != null && task.due_local_date < today)
  const pct = progressPct(done.length, tasks.length)
  const tone = healthTone({ status, open: open.length, overdue: overdue.length, total: tasks.length })
  const due = relativeDueLabel(targetDate, today)
  const activeTreeRoot = parentProject || project
  const projectTreeLabel = activeTreeRoot.project_kind === 'ux' ? 'Sections' : 'Sub-projects'
  const rootProjects = useMemo(
    () => allProjects.filter((candidate) => !candidate.parent_slug && !candidate.archived).sort(compareProjects),
    [allProjects],
  )
  const treeSections = useMemo(
    () => allProjects.filter((candidate) => candidate.parent_slug === activeTreeRoot.slug && !candidate.archived).sort(compareProjects),
    [activeTreeRoot.slug, allProjects],
  )

  function pagesFor(projectSlug: string) {
    return [...(treePagesByProject[projectSlug] || [])].sort(comparePages)
  }

  // The single most pressing open task: priority first, then soonest due.
  const nextAction = useMemo(() => {
    return [...open].sort((a, b) => {
      const pr = (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1)
      if (pr !== 0) return pr
      const ad = a.due_local_date || '9999-99-99'
      const bd = b.due_local_date || '9999-99-99'
      return ad.localeCompare(bd)
    })[0]
  }, [open])

  const recentPages = useMemo(
    () => [...pages].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 5),
    [pages],
  )
  const upcomingEvents = useMemo(
    () =>
      events
        .filter((event) => event.local_date >= today)
        .sort((a, b) => a.local_date.localeCompare(b.local_date) || (a.start_time || '').localeCompare(b.start_time || ''))
        .slice(0, 5),
    [events, today],
  )

  async function patchProject(patch: Record<string, unknown>, rollback?: () => void) {
    setError(null)
    try {
      await fetchJson(`/api/life/projects/${project.slug}`, { method: 'PATCH', body: JSON.stringify(patch) })
    } catch (err) {
      rollback?.()
      setError(err instanceof Error ? err.message : 'Update failed.')
    }
  }

  function changeStatus(next: ProjectStatus) {
    const previous = status
    setStatus(next)
    setStatusOpen(false)
    void patchProject({ status: next }, () => setStatus(previous))
  }

  function changeProjectKind(next: typeof project.project_kind) {
    const previous = projectKind
    setProjectKind(next)
    setKindOpen(false)
    void patchProject({ projectKind: next }, () => setProjectKind(previous))
  }

  function changeTargetDate(next: string | null) {
    const previous = targetDate
    setTargetDate(next)
    setCalOpen(false)
    void patchProject({ targetDate: next }, () => setTargetDate(previous))
  }

  function saveName() {
    setEditName(false)
    const trimmed = name.trim()
    if (!trimmed || trimmed === project.name) {
      setName(project.name)
      return
    }
    const previous = name
    setName(trimmed)
    void patchProject({ name: trimmed }, () => setName(previous))
  }

  function saveSummary() {
    setEditSummary(false)
    const trimmed = summary.trim()
    if (trimmed === (project.summary || '')) return
    const previous = summary
    setSummary(trimmed)
    void patchProject({ summary: trimmed || null }, () => setSummary(previous))
  }

  async function createSubproject() {
    const trimmed = subprojectName.trim()
    if (!trimmed || savingSubproject) return
    setSavingSubproject(true)
    setError(null)
    try {
      const payload = await fetchJson<{ project: ProjectRecord }>('/api/life/projects', {
        method: 'POST',
        body: JSON.stringify({
          name: trimmed,
          summary: subprojectSummary.trim() || null,
          color: subprojectColor,
          parentSlug: project.slug,
        }),
      })
      setAddingSubproject(false)
      setSubprojectName('')
      setSubprojectSummary('')
      setSubprojectColor(project.color || PROJECT_SWATCHES[0])
      router.push(`/projects/${payload.project.slug}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create sub-project.')
    } finally {
      setSavingSubproject(false)
    }
  }

  // Pages used to be created from the list inside the Pages tab. That list is
  // gone, so creation lives next to the pages it produces and opens the new
  // page straight away — same URL a rail click uses.
  async function createPage() {
    if (creatingPage) return
    setCreatingPage(true)
    setError(null)
    try {
      const payload = await fetchJson<{ page: ProjectPageRecord }>(
        `/api/life/projects/${project.slug}/pages`,
        { method: 'POST', body: JSON.stringify({ title: 'Untitled', body: '' }) },
      )
      router.push(`/projects/${project.slug}?page=${payload.page.id}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create page.')
    } finally {
      setCreatingPage(false)
    }
  }

  async function deleteProjectBySlug(slug: string, redirectTo?: string) {
    if (deletingSlug) return
    setDeletingSlug(slug)
    setError(null)
    try {
      await fetchJson(`/api/life/projects/${slug}`, { method: 'DELETE' })
      if (redirectTo) {
        router.push(redirectTo)
      }
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete project.')
    } finally {
      setDeletingSlug(null)
    }
  }

  return (
    <div className={`life-project-shell-with-tree${treeOpen ? '' : ' is-tree-collapsed'}`}>
      <aside className="life-project-tree" aria-label="Project tree">
        <div className="life-project-tree-head">
          <Link href="/projects" className="life-project-tree-title">
            Projects
          </Link>
          <button type="button" className="life-project-tree-toggle" onClick={() => setTreeOpen((value) => !value)}>
            {treeOpen ? 'Hide' : 'Show'}
          </button>
        </div>

        {treeOpen ? (
          <div className="life-project-tree-body">
            <Link href="/projects" className="life-project-tree-index">
              All projects
            </Link>
            <div className="life-project-tree-roots">
              {rootProjects.map((root) => {
                const isActiveRoot = root.slug === activeTreeRoot.slug
                const rootPages = pagesFor(root.slug)
                return (
                  <div key={root.slug} className={`life-project-tree-root${isActiveRoot ? ' is-open' : ''}`}>
                    <Link
                      href={`/projects/${root.slug}`}
                      className={`life-project-tree-project${project.slug === root.slug ? ' is-active' : ''}${isActiveRoot ? ' is-in-tree' : ''}`}
                    >
                      <span className="life-project-dot" style={{ background: root.color || 'var(--life-label)' }} />
                      <span>{root.name}</span>
                    </Link>

                    {isActiveRoot ? (
                      <div className="life-project-tree-branch">
                        {rootPages.length > 0 ? (
                          <div className="life-project-tree-pages">
                            {rootPages.map((page) => (
                              <Link
                                key={page.id}
                                href={`/projects/${root.slug}?page=${page.id}`}
                                className={`life-project-tree-page${project.slug === root.slug && activePageId === page.id ? ' is-active' : ''}`}
                              >
                                {page.title}
                              </Link>
                            ))}
                          </div>
                        ) : null}

                        {treeSections.length > 0 ? (
                          <div className="life-project-tree-section-group">
                            <span className="life-project-tree-section-label">{projectTreeLabel}</span>
                            {treeSections.map((section) => {
                              const sectionPages = pagesFor(section.slug)
                              return (
                                <div key={section.slug} className="life-project-tree-section">
                                  <Link
                                    href={`/projects/${section.slug}`}
                                    className={`life-project-tree-project is-child${project.slug === section.slug ? ' is-active' : ''}`}
                                  >
                                    <span className="life-project-dot" style={{ background: section.color || root.color || 'var(--life-label)' }} />
                                    <span>{section.name}</span>
                                  </Link>
                                  {sectionPages.length > 0 ? (
                                    <div className="life-project-tree-pages">
                                      {sectionPages.map((page) => (
                                        <Link
                                          key={page.id}
                                          href={`/projects/${section.slug}?page=${page.id}`}
                                          className={`life-project-tree-page${project.slug === section.slug && activePageId === page.id ? ' is-active' : ''}`}
                                        >
                                          {page.title}
                                        </Link>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              )
                            })}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}
      </aside>

      <div className="life-project-workspace">
      <div className="life-project-back">
        {activePageId ? (
          // Reading a page: the only useful exit is back up to its project.
          <Link href={`/projects/${project.slug}`} className="life-back-link">
            ← {project.name}
          </Link>
        ) : (
          <>
            <Link href="/projects" className="life-back-link">
              ← Projects
            </Link>
            {parentProject ? (
              <Link href={`/projects/${parentProject.slug}`} className="life-back-link">
                ← {parentProject.name}
              </Link>
            ) : null}
          </>
        )}
      </div>

      {activePageId ? null : (
      <div className="life-page-head life-project-head">
        <div className="life-project-head-copy">
          <p className="eyebrow">
            <span className="life-project-dot" style={{ background: project.color || 'var(--life-label)' }} /> {projectKind === 'ux' ? 'UX project' : 'Project'}
          </p>
          {editName ? (
            <input
              className="life-project-name-input"
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              onBlur={saveName}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  saveName()
                }
                if (event.key === 'Escape') {
                  setName(project.name)
                  setEditName(false)
                }
              }}
            />
          ) : (
            <h1 className="life-project-name-edit" onClick={() => setEditName(true)} title="Click to rename">
              {name}
            </h1>
          )}
          {editSummary ? (
            <textarea
              className="life-project-summary-input"
              autoFocus
              rows={2}
              value={summary}
              placeholder="Add a summary…"
              onChange={(event) => setSummary(event.target.value)}
              onBlur={saveSummary}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setSummary(project.summary || '')
                  setEditSummary(false)
                }
              }}
            />
          ) : (
          <p className="life-project-summary-line life-project-summary-edit" onClick={() => setEditSummary(true)} title="Click to edit">
              {summary || <span className="life-project-summary-empty">Add a summary…</span>}
            </p>
          )}
          <div className="life-project-properties" ref={propsRef}>
            <span className={`life-health-dot health-${tone}`} aria-label={`Health: ${tone}`} />
            <span className="life-project-property-wrap">
              <button type="button" className="life-project-property" onClick={() => { setStatusOpen((value) => !value); setKindOpen(false); setOverflowOpen(false); setCalOpen(false) }}>
                {STATUS_LABEL[status]}
              </button>
              {statusOpen ? (
                <div className="life-project-property-menu">
                  {STATUS_OPTIONS.map((option) => (
                    <button key={option} type="button" className={status === option ? 'is-active' : ''} onClick={() => changeStatus(option)}>
                      {STATUS_LABEL[option]}
                    </button>
                  ))}
                </div>
              ) : null}
            </span>
            <span className="life-project-property-sep">·</span>
            <span className="life-project-property-wrap">
              <button type="button" className="life-project-property" onClick={() => { setKindOpen((value) => !value); setStatusOpen(false); setOverflowOpen(false); setCalOpen(false) }}>
                {projectKind === 'ux' ? 'UX' : 'General'}
              </button>
              {kindOpen ? (
                <div className="life-project-property-menu">
                  {(['general', 'ux'] as const).map((option) => (
                    <button key={option} type="button" className={projectKind === option ? 'is-active' : ''} onClick={() => changeProjectKind(option)}>
                      {option === 'ux' ? 'UX' : 'General'}
                    </button>
                  ))}
                </div>
              ) : null}
            </span>
            <span className="life-project-property-sep">·</span>
            <button ref={dateBtnRef} type="button" className="life-project-property" onClick={() => { setCalOpen((value) => !value); setStatusOpen(false); setKindOpen(false); setOverflowOpen(false) }}>
              {due ? `Due ${due.text}` : 'No deadline'}
            </button>
            <span className="life-project-property-sep">·</span>
            <span className="life-project-property-text">{open.length} open</span>
            {overdue.length > 0 ? (
              <>
                <span className="life-project-property-sep">·</span>
                <span className="life-project-property-text is-overdue">{overdue.length} overdue</span>
              </>
            ) : null}
            <span className="life-project-property-sep">·</span>
            <span className="life-project-property-text">{done.length} done</span>
            <span className="life-project-property-wrap">
              <button type="button" className="life-project-overflow" aria-label="Project actions" onClick={() => { setOverflowOpen((value) => !value); setStatusOpen(false); setKindOpen(false); setCalOpen(false) }}>
                …
              </button>
              {overflowOpen ? (
                <div className="life-project-property-menu align-right">
                  <button
                    type="button"
                    className="is-danger"
                    disabled={deletingSlug === project.slug}
                    onClick={() => {
                      setOverflowOpen(false)
                      setPendingDelete({
                        slug: project.slug,
                        name: project.name,
                        redirectTo: parentProject ? `/projects/${parentProject.slug}` : '/projects',
                      })
                    }}
                  >
                    {deletingSlug === project.slug ? 'Deleting…' : parentProject ? 'Delete sub-project' : 'Delete project'}
                  </button>
                </div>
              ) : null}
            </span>
          </div>

          <div className="life-project-quiet-status">
            <div className="life-project-progress-bar">
              <div className="life-progress-track">
                <div className="life-progress-fill" style={{ width: `${pct}%` }} />
              </div>
              <span className="life-progress-label">
                {done.length}/{tasks.length} done · {pct}%
              </span>
            </div>
            {nextAction ? (
              <div className="life-next-action">
                <span className="life-next-action-label">Next</span>
                <span className={`pri-dot pri-${nextAction.priority}`} />
                <span className="life-next-action-title">{nextAction.title}</span>
                {nextAction.due_local_date ? (
                  <span className={`life-due-chip due-${nextAction.due_local_date < today ? 'overdue' : nextAction.due_local_date === today ? 'today' : 'soon'}`}>
                    {relativeDueLabel(nextAction.due_local_date, today)?.text}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
      )}

      <LifeConfirm
        open={pendingDelete !== null}
        title={`Delete "${pendingDelete?.name ?? ''}"?`}
        body="Its tasks and entries keep their history but lose the project label."
        confirmLabel={deletingSlug ? 'Deleting…' : 'Delete'}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const target = pendingDelete
          setPendingDelete(null)
          if (target) void deleteProjectBySlug(target.slug, target.redirectTo)
        }}
      />

      {calOpen ? (
        <LifeCalendar
          value={targetDate}
          onChange={changeTargetDate}
          onClose={() => setCalOpen(false)}
          anchorRect={dateBtnRef.current?.getBoundingClientRect() ?? null}
        />
      ) : null}

      {error ? <p className="error-text">{error}</p> : null}
      {linkedEventsFailed ? (
        <p className="error-text">
          Couldn’t load linked calendar events — task event chips may be missing. Reload to
          try again.
        </p>
      ) : null}

      {activePageId ? null : (
      <div className="life-project-tabs">
        <button type="button" className={`life-project-tab${tab === 'overview' ? ' is-active' : ''}`} onClick={() => setTab('overview')}>
          Overview
        </button>
        <button type="button" className={`life-project-tab${tab === 'tasks' ? ' is-active' : ''}`} onClick={() => setTab('tasks')}>
          Tasks <span className="chip-count">{tasks.length}</span>
        </button>
        <button type="button" className={`life-project-tab${tab === 'refs' ? ' is-active' : ''}`} onClick={() => setTab('refs')}>
          References <span className="chip-count">{refs.length}</span>
        </button>
        <button type="button" className={`life-project-tab${tab === 'events' ? ' is-active' : ''}`} onClick={() => setTab('events')}>
          Events <span className="chip-count">{events.length}</span>
        </button>
      </div>
      )}

      {activePageId ? (
        <ProjectPages
          projectSlug={project.slug}
          pages={pages}
          tasks={tasks}
          refs={refs}
          today={today}
          chromeless
        />
      ) : (
      <div key={tab} className="life-project-tab-body">
        {tab === 'overview' ? (
          <div className="life-project-overview">
            <div className="life-project-children">
              <div className="life-project-children-head">
                <div className="life-project-children-heading">
                  <span className="eyebrow">{projectKind === 'ux' && !parentProject ? 'Sections' : 'Sub-projects'}</span>
                  <span className="life-project-children-count">{subprojects.length}</span>
                </div>
                <div className="life-project-children-actions">
                  <button
                    type="button"
                    className="life-btn ghost life-project-child-add"
                    onClick={() => {
                      setAddingSubproject((value) => !value)
                      setSubprojectName('')
                      setSubprojectSummary('')
                      setSubprojectColor(project.color || PROJECT_SWATCHES[0])
                    }}
                  >
                    {addingSubproject ? 'Cancel' : projectKind === 'ux' && !parentProject ? '+ Section' : '+ Sub-project'}
                  </button>
                </div>
              </div>

              {projectKind === 'ux' && !parentProject ? (
                <ProjectUxTemplates projectSlug={project.slug} subprojects={subprojects} templates={uxTemplates} />
              ) : null}

              {addingSubproject ? (
                <div className="life-project-create life-project-child-create">
                  <input
                    className="life-compose-title"
                    autoFocus
                    value={subprojectName}
                    placeholder={projectKind === 'ux' && !parentProject ? `New section inside ${project.name}…` : `New project inside ${project.name}…`}
                    onChange={(event) => setSubprojectName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        void createSubproject()
                      }
                      if (event.key === 'Escape') {
                        setAddingSubproject(false)
                      }
                    }}
                  />
                  <textarea
                    className="life-compose-desc"
                    value={subprojectSummary}
                    placeholder={projectKind === 'ux' && !parentProject ? 'What does this section hold?' : 'What does this sub-project hold?'}
                    rows={2}
                    onChange={(event) => setSubprojectSummary(event.target.value)}
                  />
                  <div className="life-project-create-foot">
                    <div className="life-swatches">
                      {PROJECT_SWATCHES.map((swatch) => (
                        <button
                          key={swatch}
                          type="button"
                          className={`life-swatch${subprojectColor === swatch ? ' is-active' : ''}`}
                          style={{ background: swatch }}
                          aria-label={`Use ${swatch}`}
                          onClick={() => setSubprojectColor(swatch)}
                        />
                      ))}
                    </div>
                    <button type="button" className="life-btn primary" disabled={savingSubproject || !subprojectName.trim()} onClick={() => void createSubproject()}>
                      {savingSubproject ? 'Creating…' : projectKind === 'ux' && !parentProject ? 'Create section' : 'Create sub-project'}
                    </button>
                  </div>
                </div>
              ) : null}

              {subprojects.length > 0 ? (
                <div className="life-project-children-grid">
                  {subprojects.map((child) => (
                    <div key={child.slug} className="life-project-child-card">
                      <Link href={`/projects/${child.slug}`} className="life-project-child-link">
                        <span className="life-project-dot" style={{ background: child.color || 'var(--life-label)' }} />
                        <span className="life-project-child-name">{child.name}</span>
                      </Link>
                      <button
                        type="button"
                        className="life-project-child-delete"
                        disabled={deletingSlug === child.slug}
                        aria-label={`Delete ${child.name}`}
                        onClick={() => setPendingDelete({ slug: child.slug, name: child.name })}
                      >
                        {deletingSlug === child.slug ? '…' : '×'}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="life-empty">{projectKind === 'ux' && !parentProject ? 'No sections yet.' : 'No sub-projects yet.'}</div>
              )}
            </div>

            <div className="life-overview-section">
              <div className="life-project-children-head">
                <div className="life-project-children-heading">
                  <span className="eyebrow">Recent pages</span>
                  <span className="life-project-children-count">{pages.length}</span>
                </div>
                <button
                  type="button"
                  className="life-btn ghost life-project-child-add"
                  disabled={creatingPage}
                  onClick={() => void createPage()}
                >
                  {creatingPage ? 'Adding…' : '+ Page'}
                </button>
              </div>
              <div className="life-list">
                {recentPages.length === 0 ? <div className="life-empty">No pages yet.</div> : null}
                {recentPages.map((page) => (
                  <Link
                    key={page.id}
                    href={`/projects/${project.slug}?page=${page.id}`}
                    className="life-overview-row"
                  >
                    <span className="life-overview-row-title">{page.title}</span>
                    <span className="life-row-aside">{formatPageUpdated(page.updated_at, timezone)}</span>
                  </Link>
                ))}
              </div>
            </div>

            <div className="life-overview-section">
              <div className="life-project-children-heading">
                <span className="eyebrow">Upcoming events</span>
                <span className="life-project-children-count">{upcomingEvents.length}</span>
              </div>
              <div className="life-list">
                {upcomingEvents.length === 0 ? <div className="life-empty">No upcoming events.</div> : null}
                {upcomingEvents.map((event) => (
                  <div key={event.id} className="life-overview-row">
                    <span className="life-event-mark" />
                    <span className="life-overview-row-title">{event.title || 'Event'}</span>
                    <span className="life-row-aside">{formatEventWhen(event, timezone)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
        {tab === 'tasks' ? (
          <ProjectTasks
            projectSlug={project.slug}
            tasks={tasks}
            milestones={milestones}
            linkedEvents={linkedEvents}
            today={today}
            timezone={timezone}
          />
        ) : null}
        {tab === 'events' ? (
          <ProjectEvents projectSlug={project.slug} events={events} today={today} timezone={timezone} />
        ) : null}
        {tab === 'refs' ? <ProjectRefs projectSlug={project.slug} refs={refs} /> : null}
      </div>
      )}
    </div>
    </div>
  )
}
