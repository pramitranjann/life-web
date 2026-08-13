'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { LifeConfirm } from '@/components/life/ui/LifeConfirm'
import { LifeEmpty } from '@/components/life/ui/LifeEmpty'
import { LifeMenu } from '@/components/life/ui/LifeMenu'
import { fetchJson } from '@/lib/life/client'
import type { ProjectKind, ProjectStatus } from '@/lib/life/types'
import { healthTone, progressPct, relativeDueLabel, STATUS_LABEL } from './shared'

export interface ProjectOverviewItem {
  slug: string
  name: string
  summary: string | null
  color: string | null
  projectKind: ProjectKind
  status: ProjectStatus
  targetDate: string | null
  open: number
  done: number
  overdue: number
  total: number
  lastUpdated: string
  parentSlug: string | null
  parentName: string | null
  childCount: number
  depth: number
}

/** "updated 3d ago" — day granularity keeps SSR/client renders in step. */
function relativeUpdatedLabel(iso: string) {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86400000)
  if (!Number.isFinite(days) || days <= 0) return 'updated today'
  if (days < 30) return `updated ${days}d ago`
  if (days < 365) return `updated ${Math.floor(days / 30)}mo ago`
  return `updated ${Math.floor(days / 365)}y ago`
}

const SWATCHES = ['#e9b765', '#7fd899', '#9aa6ff', '#e58fb8', '#6fcfd6', '#c79bff', '#ff6c61']

export function ProjectsOverview({
  items,
  today,
}: {
  items: ProjectOverviewItem[]
  today: string
}) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [summary, setSummary] = useState('')
  const [color, setColor] = useState(SWATCHES[0])
  const [projectKind, setProjectKind] = useState<ProjectKind>('general')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<{ slug: string; name: string } | null>(null)

  const totalOpen = items.reduce((sum, item) => sum + item.open, 0)

  async function createProject() {
    const trimmed = name.trim()
    if (!trimmed) return
    setSaving(true)
    setError(null)
    try {
      await fetchJson('/api/life/projects', {
        method: 'POST',
        body: JSON.stringify({ name: trimmed, summary: summary.trim() || null, color, parentSlug: null, projectKind }),
      })
      setName('')
      setSummary('')
      setColor(SWATCHES[0])
      setProjectKind('general')
      setAdding(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project.')
    } finally {
      setSaving(false)
    }
  }

  async function deleteProject(slug: string) {
    setPendingDelete(null)
    try {
      await fetchJson(`/api/life/projects/${slug}`, { method: 'DELETE' })
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete project.')
    }
  }

  return (
    <div className="life-projects-shell">
      <div className="life-projects-head">
        <div className="life-projects-heading">
          <p className="eyebrow">Workspace</p>
          <div className="life-projects-title-row">
            <h1>Projects</h1>
            <span className="count-pill">{items.length}</span>
          </div>
          <p className="life-projects-stat">
            {totalOpen === 0 ? 'No open tasks across projects' : `${totalOpen} open task${totalOpen === 1 ? '' : 's'} across projects`}
          </p>
        </div>
        <button type="button" className="life-project-new" onClick={() => setAdding((value) => !value)} aria-expanded={adding}>
          <span aria-hidden="true">+</span>
          <span>New project</span>
        </button>
      </div>

      {adding ? (
        <div className="life-project-create">
          <input
            className="life-compose-title"
            autoFocus
            value={name}
            placeholder="Project name…"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void createProject()
              }
              if (event.key === 'Escape') setAdding(false)
            }}
          />
          <textarea
            className="life-compose-desc"
            value={summary}
            placeholder="A short summary (optional)…"
            rows={2}
            onChange={(event) => setSummary(event.target.value)}
          />
          <LifeMenu
            ariaLabel="Project kind"
            value={projectKind}
            options={[
              { value: 'general', label: 'General project' },
              { value: 'ux', label: 'UX class / design sprint' },
            ]}
            onChange={(value) => setProjectKind(value as ProjectKind)}
          />
          <div className="life-project-create-foot">
            <div className="life-swatches">
              {SWATCHES.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  className={`life-swatch${color === swatch ? ' is-active' : ''}`}
                  style={{ background: swatch }}
                  aria-label={`Use ${swatch}`}
                  onClick={() => setColor(swatch)}
                />
              ))}
            </div>
            <button type="button" className="life-btn primary" disabled={saving || !name.trim()} onClick={() => void createProject()}>
              {saving ? 'Adding…' : 'Add project'}
            </button>
            <button type="button" className="life-btn ghost" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p className="error-text">{error}</p> : null}

      <div className="life-project-index">
        <div className="life-project-index-head" aria-hidden="true">
          <span>Project</span>
          <span>Progress</span>
          <span>Tasks</span>
          <span>Updated</span>
          <span />
        </div>
        {items.map((item) => {
          const tone = healthTone(item)
          const pct = progressPct(item.done, item.total)
          const due = relativeDueLabel(item.targetDate, today)
          return (
            <div key={item.slug} className={`life-project-row${item.depth > 0 ? ' is-child' : ''}`}>
              <span className="life-project-strip" style={{ background: item.color || 'var(--life-label)' }} aria-hidden />
              <Link href={`/projects/${item.slug}`} className="life-project-row-link">
                <div className="life-project-row-identity" style={{ paddingLeft: `${item.depth * 22}px` }}>
                  <div className="life-project-row-title">
                    {item.depth > 0 ? <span className="life-project-branch" aria-hidden="true">↳</span> : null}
                    <h2>{item.name}</h2>
                    <span className={`life-health-dot health-${tone}`} aria-label={`Health: ${tone}`} />
                  </div>
                  {item.summary ? <p className="life-project-summary">{item.summary}</p> : null}
                  <div className="life-project-row-meta">
                    {item.parentName ? <span className="life-project-parent-label">In {item.parentName}</span> : null}
                    {item.childCount > 0 ? <span>{item.childCount} nested</span> : null}
                    {item.projectKind === 'ux' ? <span className="life-project-kind-chip">UX</span> : null}
                    {item.status !== 'active' ? <span className="life-project-badge">{STATUS_LABEL[item.status]}</span> : null}
                    {due ? <span className={`life-due-chip due-${due.tone}`}>{due.text}</span> : null}
                  </div>
                </div>
                <div className="life-project-row-progress">
                  <div className="life-progress-track">
                    <div className="life-progress-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="life-progress-label">{pct}%</span>
                </div>
                <div className="life-project-row-tasks">
                  <span className="life-project-stat">{item.open} open</span>
                  <span className="life-project-stat">{item.done} done</span>
                  {item.overdue > 0 ? <span className="life-project-stat is-overdue">{item.overdue} overdue</span> : null}
                </div>
                <span className="life-project-updated">{relativeUpdatedLabel(item.lastUpdated)}</span>
                <span className="life-project-row-arrow" aria-hidden="true">→</span>
              </Link>
              <button
                type="button"
                className="life-project-delete"
                aria-label={`Delete ${item.name}`}
                onClick={() => setPendingDelete({ slug: item.slug, name: item.name })}
              >
                ×
              </button>
            </div>
          )
        })}
      </div>

      {items.length === 0 ? (
        <LifeEmpty
          title="No projects yet"
          description="A project groups tasks, pages, references and events under one slug."
          action={{ label: 'New project', onClick: () => setAdding(true) }}
        />
      ) : null}

      <LifeConfirm
        open={!!pendingDelete}
        title={`Delete ${pendingDelete?.name ?? ''}?`}
        body="Its tasks keep their history but lose the project label."
        confirmLabel="Delete project"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) void deleteProject(pendingDelete.slug)
        }}
      />
    </div>
  )
}
