'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { useLifeProjects } from '@/components/life/LifeProjectsProvider'
import { fetchJson } from '@/lib/life/client'
import { addDays } from '@/lib/life/time'
import type { InteractionRecord, PersonRecord, TaskRecord } from '@/lib/life/types'
import {
  agoLabel,
  INTERACTION_KIND_LABEL,
  INTERACTION_KIND_OPTIONS,
  RELATIONSHIP_LABEL,
  RELATIONSHIP_OPTIONS,
} from './shared'

const NO_HISTORY_COPY = 'No history yet. Log how you know each other — future-you will thank you.'

export function PersonDetail({
  person,
  interactions,
  openTasks,
  today,
}: {
  person: PersonRecord
  interactions: InteractionRecord[]
  openTasks: TaskRecord[]
  today: string
}) {
  const router = useRouter()
  const { projects, labelFor } = useLifeProjects()
  const [error, setError] = useState<string | null>(null)

  // Header edit form.
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(person.name)
  const [role, setRole] = useState(person.role || '')
  const [relationship, setRelationship] = useState<string>(person.relationship)
  const [why, setWhy] = useState(person.why || '')
  const [channel, setChannel] = useState(person.channel || '')
  const [cadence, setCadence] = useState(person.cadence_days != null ? String(person.cadence_days) : '')
  const [savingPerson, setSavingPerson] = useState(false)

  // Interaction composer.
  const [logDate, setLogDate] = useState(today)
  const [logKind, setLogKind] = useState('note')
  const [logSummary, setLogSummary] = useState('')
  const [logProject, setLogProject] = useState('')
  const [savingLog, setSavingLog] = useState(false)

  // Follow-up.
  const [followUpDate, setFollowUpDate] = useState('')
  const [savingFollowUp, setSavingFollowUp] = useState(false)

  const showedWork = interactions.filter((interaction) => interaction.kind === 'showed_work')
  const showedWorkByProject = new Map<string, InteractionRecord[]>()
  for (const interaction of showedWork) {
    const key = interaction.project_slug || ''
    showedWorkByProject.set(key, [...(showedWorkByProject.get(key) || []), interaction])
  }

  async function savePerson() {
    if (savingPerson) return
    const trimmed = name.trim()
    if (!trimmed) return
    setSavingPerson(true)
    setError(null)
    try {
      await fetchJson(`/api/life/people/${person.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: trimmed,
          role: role.trim() || null,
          relationship,
          why: why.trim() || null,
          channel: channel.trim() || null,
          cadenceDays: cadence.trim() ? Number(cadence) : null,
        }),
      })
      setEditing(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.')
    } finally {
      setSavingPerson(false)
    }
  }

  async function archivePerson() {
    if (!window.confirm(`Archive "${person.name}"? They disappear from the list but keep their history.`)) return
    setError(null)
    try {
      await fetchJson(`/api/life/people/${person.id}`, { method: 'PATCH', body: JSON.stringify({ archived: true }) })
      router.push('/people')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to archive.')
    }
  }

  async function logInteraction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (savingLog || !logSummary.trim()) return
    setSavingLog(true)
    setError(null)
    try {
      await fetchJson(`/api/life/people/${person.id}/interactions`, {
        method: 'POST',
        body: JSON.stringify({
          localDate: logDate,
          kind: logKind,
          summary: logSummary,
          projectSlug: logProject || null,
        }),
      })
      setLogSummary('')
      setLogProject('')
      setLogKind('note')
      setLogDate(today)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log interaction.')
    } finally {
      setSavingLog(false)
    }
  }

  async function createFollowUp(dueLocalDate: string) {
    if (savingFollowUp) return
    setSavingFollowUp(true)
    setError(null)
    try {
      await fetchJson(`/api/life/people/${person.id}/follow-up`, {
        method: 'POST',
        body: JSON.stringify({ dueLocalDate }),
      })
      setFollowUpDate('')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create follow-up.')
    } finally {
      setSavingFollowUp(false)
    }
  }

  return (
    <div>
      <div className="life-page-head">
        <div>
          <p className="eyebrow">
            <Link href="/people">People</Link>
          </p>
          <h1>{person.name}</h1>
          <p className="life-tasks-stat">
            <span className="life-project-parent-chip">{RELATIONSHIP_LABEL[person.relationship]}</span>
            {person.role ? <> · {person.role}</> : null}
            {person.channel ? <> · via {person.channel}</> : null}
            {person.cadence_days != null ? <> · every {person.cadence_days}d</> : null}
          </p>
          {person.why ? <p className="life-project-summary">{person.why}</p> : null}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="life-btn" onClick={() => setEditing((value) => !value)} aria-expanded={editing}>
            {editing ? 'Close' : 'Edit'}
          </button>
          <button type="button" className="life-btn ghost" onClick={() => void archivePerson()}>
            Archive
          </button>
        </div>
      </div>

      {editing ? (
        <div className="life-project-create">
          <input
            className="life-compose-title"
            value={name}
            placeholder="Name"
            onChange={(event) => setName(event.target.value)}
          />
          <div className="life-quick-form-row">
            <label className="life-quick-field">
              <span className="life-quick-field-label">Role</span>
              <input
                className="text-input"
                type="text"
                value={role}
                placeholder="e.g. Design lead at …"
                onChange={(event) => setRole(event.target.value)}
              />
            </label>
            <label className="life-quick-field">
              <span className="life-quick-field-label">Relationship</span>
              <select className="text-input" value={relationship} onChange={(event) => setRelationship(event.target.value)}>
                {RELATIONSHIP_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {RELATIONSHIP_LABEL[option]}
                  </option>
                ))}
              </select>
            </label>
            <label className="life-quick-field">
              <span className="life-quick-field-label">Channel</span>
              <input
                className="text-input"
                type="text"
                value={channel}
                placeholder="email, LinkedIn…"
                onChange={(event) => setChannel(event.target.value)}
              />
            </label>
            <label className="life-quick-field">
              <span className="life-quick-field-label">Cadence (days)</span>
              <input
                className="text-input"
                type="number"
                min={1}
                value={cadence}
                placeholder="e.g. 30"
                onChange={(event) => setCadence(event.target.value)}
              />
            </label>
          </div>
          <textarea
            className="life-compose-desc"
            value={why}
            placeholder="Why this person matters…"
            rows={2}
            onChange={(event) => setWhy(event.target.value)}
          />
          <div className="life-project-create-foot">
            <button type="button" className="life-btn primary" disabled={savingPerson || !name.trim()} onClick={() => void savePerson()}>
              {savingPerson ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="life-btn ghost" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p className="error-text">{error}</p> : null}

      <div className="life-card" style={{ marginTop: 16 }}>
        <div className="life-card-head">
          <h2>Log an interaction</h2>
          <span className="life-row-meta">Write notes like {person.name.split(' ')[0]} could read them.</span>
        </div>
        <form onSubmit={logInteraction} className="life-quick-form">
          <div className="life-quick-form-row">
            <label className="life-quick-field">
              <span className="life-quick-field-label">Date</span>
              <input className="text-input" type="date" value={logDate} onChange={(event) => setLogDate(event.target.value)} />
            </label>
            <label className="life-quick-field">
              <span className="life-quick-field-label">Kind</span>
              <select className="text-input" value={logKind} onChange={(event) => setLogKind(event.target.value)}>
                {INTERACTION_KIND_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {INTERACTION_KIND_LABEL[option]}
                  </option>
                ))}
              </select>
            </label>
            <label className="life-quick-field">
              <span className="life-quick-field-label">Project</span>
              <select className="text-input" value={logProject} onChange={(event) => setLogProject(event.target.value)}>
                <option value="">None</option>
                {projects.map((project) => (
                  <option key={project.slug} value={project.slug}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="life-quick-field">
            <span className="life-quick-field-label">What happened</span>
            <input
              className="text-input"
              type="text"
              value={logSummary}
              placeholder="Coffee chat about portfolio direction…"
              onChange={(event) => setLogSummary(event.target.value)}
            />
          </label>
          <div className="life-quick-form-actions">
            <button type="submit" className="primary-button" disabled={savingLog || !logSummary.trim()}>
              {savingLog ? 'Logging…' : 'Log it'}
            </button>
          </div>
        </form>
      </div>

      <div className="life-card" style={{ marginTop: 16 }}>
        <div className="life-card-head">
          <h2>Follow up</h2>
        </div>
        <div className="life-quick-form">
          <div className="life-quick-form-row">
            <button type="button" className="life-btn" disabled={savingFollowUp} onClick={() => void createFollowUp(addDays(today, 7))}>
              In 1w
            </button>
            <button type="button" className="life-btn" disabled={savingFollowUp} onClick={() => void createFollowUp(addDays(today, 30))}>
              In 1m
            </button>
            <input
              className="text-input"
              type="date"
              value={followUpDate}
              min={today}
              aria-label="Custom follow-up date"
              onChange={(event) => setFollowUpDate(event.target.value)}
            />
            <button
              type="button"
              className="life-btn"
              disabled={savingFollowUp || !followUpDate}
              onClick={() => void createFollowUp(followUpDate)}
            >
              Custom date
            </button>
          </div>
        </div>
        {openTasks.length > 0 ? (
          <div className="life-rows">
            {openTasks.map((task) => (
              <Link key={task.id} href="/tasks" className="life-row">
                <span className="life-row-body">
                  <span className="life-row-title">{task.title}</span>
                </span>
                <span className="life-row-aside">{task.due_local_date ? `due ${task.due_local_date}` : 'no due date'}</span>
              </Link>
            ))}
          </div>
        ) : null}
      </div>

      <div className="life-card" style={{ marginTop: 16 }}>
        <div className="life-card-head">
          <h2>History</h2>
        </div>
        {interactions.length === 0 ? (
          <div className="life-empty">{NO_HISTORY_COPY}</div>
        ) : (
          <div className="life-rows">
            {interactions.map((interaction) => (
              <div key={interaction.id} className="life-row">
                <span className="life-project-parent-chip">{INTERACTION_KIND_LABEL[interaction.kind]}</span>
                <span className="life-row-body">
                  <span className="life-row-title">{interaction.summary}</span>
                  {interaction.project_slug ? (
                    <span className="life-row-meta">{labelFor(interaction.project_slug)}</span>
                  ) : null}
                </span>
                <span className="life-row-aside">
                  {interaction.local_date} · {agoLabel(interaction.local_date, today)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {showedWork.length > 0 ? (
        <div className="life-card" style={{ marginTop: 16 }}>
          <div className="life-card-head">
            <h2>Seen my work</h2>
          </div>
          <div className="life-rows">
            {Array.from(showedWorkByProject.entries()).map(([slug, rows]) => (
              <div key={slug || 'none'} className="life-row">
                <span className="life-row-body">
                  <span className="life-row-title">{slug ? labelFor(slug) : 'Unassigned work'}</span>
                  <span className="life-row-meta">
                    {rows.map((row) => row.summary).join(' · ')}
                  </span>
                </span>
                <span className="life-row-aside">
                  {rows.length} {rows.length === 1 ? 'time' : 'times'}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
