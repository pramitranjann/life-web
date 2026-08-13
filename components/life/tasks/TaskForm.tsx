'use client'

import { useEffect, useRef, useState } from 'react'

import { useLifeProjects } from '@/components/life/LifeProjectsProvider'
import { fetchJson } from '@/lib/life/client'
import type { CalendarEventRecord, TaskDraft, TaskPriority } from '@/lib/life/types'

type CalMode = 'none' | 'event' | 'link'
type MenuKey = 'project' | 'subproject' | 'priority' | 'due' | 'cal'

const PRI_LABEL: Record<TaskPriority, string> = { high: 'High', medium: 'Med', low: 'Low' }
const PRI_OPTIONS: TaskPriority[] = ['high', 'medium', 'low']

function addDaysYMD(ymd: string, days: number) {
  const [y, m, d] = ymd.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function nextWeekendYMD(today: string) {
  const [y, m, d] = today.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const add = (6 - date.getDay() + 7) % 7 // Saturday
  date.setDate(date.getDate() + (add || 7))
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function dueLabel(ymd: string, today: string) {
  if (ymd === today) return 'Today'
  if (ymd === addDaysYMD(today, 1)) return 'Tomorrow'
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function eventTimeLabel(event: CalendarEventRecord, timezone: string) {
  if (event.all_day || !event.start_time) {
    const [y, m, d] = event.local_date.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }
  return new Date(event.start_time).toLocaleString('en-GB', {
    timeZone: timezone,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function TaskForm({
  mode,
  today,
  timezone,
  initial,
  linkedEventLabel,
  onSubmit,
  onCancel,
  onDelete,
  resetOnSubmit = false,
  LifeCalendarComponent,
}: {
  mode: 'create' | 'edit'
  today: string
  timezone: string
  initial?: {
    title?: string
    details?: string | null
    projectSlug?: string | null
    priority?: TaskPriority
    dueLocalDate?: string | null
    calendarEventId?: string | null
    deskEligible?: boolean
  }
  linkedEventLabel?: string | null
  onSubmit: (draft: TaskDraft) => Promise<void>
  onCancel: () => void
  onDelete?: () => Promise<void>
  resetOnSubmit?: boolean
  // Injected to avoid bundling the portal calendar when not needed.
  LifeCalendarComponent: typeof import('./LifeCalendar').LifeCalendar
}) {
  const { childrenOf, labelFor, projectFor, topLevelProjects } = useLifeProjects()
  const initialProject = projectFor(initial?.projectSlug || null)
  const initialParentProjectSlug = initialProject?.parent_slug || initialProject?.slug || ''
  const initialSubprojectSlug = initialProject?.parent_slug ? initialProject.slug : ''
  const [title, setTitle] = useState(initial?.title || '')
  const [details, setDetails] = useState(initial?.details || '')
  const [parentProjectSlug, setParentProjectSlug] = useState(initialParentProjectSlug)
  const [subprojectSlug, setSubprojectSlug] = useState(initialSubprojectSlug)
  const [priority, setPriority] = useState<TaskPriority>(initial?.priority || 'medium')
  const [due, setDue] = useState(initial?.dueLocalDate || '')
  const [deskEligible, setDeskEligible] = useState(initial?.deskEligible ?? false)
  const [calMode, setCalMode] = useState<CalMode>(initial?.calendarEventId ? 'link' : 'none')
  const [linkEventId, setLinkEventId] = useState(initial?.calendarEventId || '')
  const [linkLabel, setLinkLabel] = useState(linkedEventLabel || 'Event')
  const [startTime, setStartTime] = useState('14:00')
  const [endTime, setEndTime] = useState('15:00')

  const [openMenu, setOpenMenu] = useState<MenuKey | null>(null)
  const [calAnchor, setCalAnchor] = useState<DOMRect | null>(null)
  const [events, setEvents] = useState<CalendarEventRecord[] | null>(null)
  const [eventsLoading, setEventsLoading] = useState(false)

  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const rootRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const descRef = useRef<HTMLTextAreaElement>(null)
  const initialHadEvent = Boolean(initial?.calendarEventId)

  useEffect(() => {
    titleRef.current?.focus()
    if (mode === 'edit') titleRef.current?.select()
  }, [mode])

  useEffect(() => {
    if (descRef.current) {
      descRef.current.style.height = 'auto'
      descRef.current.style.height = `${descRef.current.scrollHeight}px`
    }
  }, [])

  useEffect(() => {
    function onDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpenMenu(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  useEffect(() => {
    if (!subprojectSlug) return
    const project = projectFor(subprojectSlug)
    if (!project || project.parent_slug !== parentProjectSlug) {
      setSubprojectSlug('')
    }
  }, [parentProjectSlug, projectFor, subprojectSlug])

  function toggleMenu(key: MenuKey) {
    setOpenMenu((current) => (current === key ? null : key))
    if (key === 'cal' && events === null && !eventsLoading) {
      setEventsLoading(true)
      fetchJson<{ events: CalendarEventRecord[] }>('/api/life/calendar/events?days=30')
        .then((payload) => setEvents(payload.events || []))
        .catch(() => setEvents([]))
        .finally(() => setEventsLoading(false))
    }
  }

  function openCalendar(anchor: HTMLElement) {
    setOpenMenu(null)
    setCalAnchor(anchor.getBoundingClientRect())
  }

  function autoGrow(el: HTMLTextAreaElement) {
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  function resetFields() {
    setTitle('')
    setDetails('')
    setDue('')
    setCalMode('none')
    setLinkEventId('')
    setDeskEligible(false)
    if (descRef.current) descRef.current.style.height = 'auto'
    titleRef.current?.focus()
  }

  async function handleSubmit() {
    if (!title.trim()) {
      setError('Headline required.')
      return
    }
    setSaving(true)
    setError(null)

    let calendar: TaskDraft['calendar']
    if (calMode === 'event') calendar = { mode: 'event', startTime, endTime }
    else if (calMode === 'link' && linkEventId) calendar = { mode: 'link', eventId: linkEventId }
    else if (initialHadEvent) calendar = { mode: 'unlink' }
    else calendar = { mode: 'none' }

    try {
      await onSubmit({
        title: title.trim(),
        details: details.trim() || null,
        projectSlug: subprojectSlug || parentProjectSlug || null,
        priority,
        dueLocalDate: due || null,
        calendar,
        deskEligible,
      })
      if (resetOnSubmit) resetFields()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!onDelete) return
    setDeleting(true)
    try {
      await onDelete()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.')
      setDeleting(false)
    }
  }

  const projectName = parentProjectSlug ? labelFor(parentProjectSlug) : ''
  const subprojectName = subprojectSlug ? labelFor(subprojectSlug) : ''
  const subprojects = parentProjectSlug ? childrenOf(parentProjectSlug) : []
  const dueText = due ? dueLabel(due, today) : ''
  const calText = calMode === 'event' ? 'Event' : calMode === 'link' ? `🔗 ${linkLabel.length > 16 ? `${linkLabel.slice(0, 15)}…` : linkLabel}` : 'Calendar'

  return (
    <div className="life-task-compose" ref={rootRef} onClick={(e) => e.stopPropagation()}>
      <input
        ref={titleRef}
        type="text"
        className="life-compose-title"
        value={title}
        placeholder="Task headline…"
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); void handleSubmit() }
          if (e.key === 'Escape') { e.preventDefault(); onCancel() }
        }}
      />
      <textarea
        ref={descRef}
        className="life-compose-desc"
        value={details}
        placeholder="Add a description, notes, links…"
        rows={1}
        onChange={(e) => { setDetails(e.target.value); autoGrow(e.target) }}
      />
      <div className="life-compose-div" />

      <div className="life-pills">
        {/* Project */}
        <div className="life-pill-wrap">
          <button type="button" className={`life-pill${parentProjectSlug ? ' set proj-plain' : ''}`} onClick={() => toggleMenu('project')}>
            {!parentProjectSlug ? <span className="ic">#</span> : null}
            <span className="lbl">{projectName || 'Project'}</span>
          </button>
          {openMenu === 'project' ? (
            <div className="life-pill-menu open">
              {topLevelProjects.map((project) => (
                <button
                  key={project.slug}
                  type="button"
                  className="life-pill-menu-item"
                  onClick={() => {
                    setParentProjectSlug(project.slug)
                    setSubprojectSlug('')
                    setOpenMenu(null)
                  }}
                >
                  <span className="swatch sq" style={{ background: project.color || undefined }} />{project.name}
                </button>
              ))}
              <div className="life-pill-menu-sep" />
              <button
                type="button"
                className="life-pill-menu-item"
                onClick={() => {
                  setParentProjectSlug('')
                  setSubprojectSlug('')
                  setOpenMenu(null)
                }}
              >
                Unassigned
              </button>
            </div>
          ) : null}
        </div>

        {subprojects.length > 0 ? (
          <div className="life-pill-wrap">
            <button type="button" className={`life-pill${subprojectSlug ? ' set proj-plain' : ''}`} onClick={() => toggleMenu('subproject')}>
              {!subprojectSlug ? <span className="ic">↳</span> : null}
              <span className="lbl">{subprojectName || 'Sub-project'}</span>
            </button>
            {openMenu === 'subproject' ? (
              <div className="life-pill-menu open life-pill-menu-subproject">
                <button type="button" className="life-pill-menu-item" onClick={() => { setSubprojectSlug(''); setOpenMenu(null) }}>
                  Parent project only
                </button>
                <div className="life-pill-menu-sep" />
                {subprojects.map((project) => (
                  <button
                    key={project.slug}
                    type="button"
                    className="life-pill-menu-item"
                    onClick={() => {
                      setSubprojectSlug(project.slug)
                      setOpenMenu(null)
                    }}
                  >
                    <span className="swatch sq" style={{ background: project.color || undefined }} />{project.name}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Priority */}
        <div className="life-pill-wrap">
          <button type="button" className="life-pill set" onClick={() => toggleMenu('priority')}>
            <span className={`pdot${priority === 'high' ? ' high' : priority === 'medium' ? ' med' : ''}`} />
            <span className="lbl">{PRI_LABEL[priority]}</span>
          </button>
          {openMenu === 'priority' ? (
            <div className="life-pill-menu open">
              {PRI_OPTIONS.map((option) => (
                <button key={option} type="button" className="life-pill-menu-item" onClick={() => { setPriority(option); setOpenMenu(null) }}>
                  <span className={`swatch${option === 'high' ? ' high' : option === 'medium' ? ' med' : ' low'}`} />{PRI_LABEL[option]}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {/* Due */}
        <div className="life-pill-wrap">
          <button type="button" className={`life-pill${due ? ` set${dueText === 'Today' ? ' due-today' : ''}` : ''}`} onClick={() => toggleMenu('due')}>
            {!due ? <span className="ic">◷</span> : null}
            <span className="lbl">{dueText || 'Due'}</span>
          </button>
          {openMenu === 'due' ? (
            <div className="life-pill-menu open">
              <button type="button" className="life-pill-menu-item" onClick={() => { setDue(today); setOpenMenu(null) }}>Today</button>
              <button type="button" className="life-pill-menu-item" onClick={() => { setDue(addDaysYMD(today, 1)); setOpenMenu(null) }}>Tomorrow</button>
              <button type="button" className="life-pill-menu-item" onClick={() => { setDue(nextWeekendYMD(today)); setOpenMenu(null) }}>This weekend</button>
              <div className="life-pill-menu-sep" />
              <button type="button" className="life-pill-menu-item" onClick={(e) => openCalendar(e.currentTarget)}>Pick a date…</button>
              <button type="button" className="life-pill-menu-item" onClick={() => { setDue(''); setOpenMenu(null) }}>No date</button>
            </div>
          ) : null}
        </div>

        {/* Calendar */}
        <div className="life-pill-wrap">
          <button type="button" className={`life-pill${calMode !== 'none' ? ` set ${calMode === 'event' ? 'cal-event' : 'cal-link'}` : ''}`} onClick={() => toggleMenu('cal')}>
            {calMode === 'none' ? <span className="ic">▣</span> : null}
            <span className="lbl">{calText}</span>
          </button>
          {openMenu === 'cal' ? (
            <div className="life-pill-menu open">
              <button type="button" className="life-pill-menu-item" onClick={() => { setCalMode('event'); if (!due) setDue(today); setOpenMenu(null) }}>
                <span className="swatch sq cal" />Make this an event
              </button>
              <div className="life-pill-menu-sep" />
              <div className="life-pill-menu-title">Link existing</div>
              <div className="life-pill-menu-scroll">
                {eventsLoading ? <div className="life-pill-menu-empty">Loading…</div> : null}
                {!eventsLoading && events && events.length === 0 ? <div className="life-pill-menu-empty">No upcoming events.</div> : null}
                {(events || []).map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    className="life-pill-menu-item"
                    onClick={() => { setCalMode('link'); setLinkEventId(event.id); setLinkLabel(event.title || 'Event'); setOpenMenu(null) }}
                  >
                    <span>{event.title || '(Untitled)'}</span>
                    <span className="ev-time">{eventTimeLabel(event, timezone)}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* Marks a task as something you may want at the desk printer later.
            Actual printing only happens from the explicit Print/Reprint actions. */}
        <div className="life-pill-wrap">
          <button
            type="button"
            className={`life-pill${deskEligible ? ' set' : ''}`}
            onClick={() => setDeskEligible((value) => !value)}
            title="Mark this task for desk printing later"
          >
            <span className="ic">🖨</span>
            <span className="lbl">{deskEligible ? 'Desk-ready' : 'Mark for desk'}</span>
          </button>
        </div>
      </div>

      {calMode === 'event' ? (
        <div className="life-event-panel">
          <span className="ep-label">Event</span>
          <button type="button" className="life-ep-date" onClick={(e) => openCalendar(e.currentTarget)}>
            {due ? `📅 ${dueLabel(due, today)}` : '＋ Pick a day'}
          </button>
          <span className="ep-t">Starts</span>
          <input type="time" value={startTime} aria-label="Start time" onChange={(e) => setStartTime(e.target.value)} />
          <span className="ep-t">Ends</span>
          <input type="time" value={endTime} aria-label="End time" onChange={(e) => setEndTime(e.target.value)} />
          <button type="button" className="ep-x" aria-label="Remove event" onClick={() => setCalMode('none')}>✕</button>
        </div>
      ) : null}

      {calMode === 'link' ? (
        <div className="life-event-panel">
          <span className="ep-label">Linked</span>
          <span className="ep-linked">{linkLabel}</span>
          <button type="button" className="ep-x" aria-label="Unlink event" onClick={() => { setCalMode('none'); setLinkEventId('') }}>✕</button>
        </div>
      ) : null}

      {error ? <span className="error-text">{error}</span> : null}

      <div className="life-compose-foot">
        <button type="button" className="primary-button" onClick={() => void handleSubmit()} disabled={saving}>
          {saving ? (mode === 'edit' ? 'Saving…' : 'Adding…') : mode === 'edit' ? 'Save' : 'Add task'}
        </button>
        <button type="button" className="secondary-button" onClick={onCancel} disabled={saving}>Cancel</button>
        {onDelete ? (
          <button type="button" className="life-task-delete-btn" onClick={() => void handleDelete()} disabled={deleting} aria-label="Delete task">
            {deleting ? '…' : 'Delete'}
          </button>
        ) : (
          <span className="life-compose-hint">⏎ to add · Esc to cancel</span>
        )}
      </div>

      {calAnchor ? (
        <LifeCalendarComponent
          value={due || null}
          anchorRect={calAnchor}
          onChange={(v) => setDue(v || '')}
          onClose={() => setCalAnchor(null)}
        />
      ) : null}
    </div>
  )
}
