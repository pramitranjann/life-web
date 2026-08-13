'use client'

// Today v2, Console layout. Up next sits above a two-column console: the
// left column is the writing surface (capture + morning brief), the right
// column stacks tasks/schedule/captured and scrolls on its own. Every
// element the live screen ships with is present: capture box, hold-to-
// capture, morning brief, captured feed, today's tasks, schedule.

import Link from 'next/link'
import { useEffect, useState, type ReactNode } from 'react'

import { useRouter } from 'next/navigation'
import { MarkdownCard } from '@/components/life/MarkdownCard'
import { useLifeProjects } from '@/components/life/LifeProjectsProvider'
import { VoiceCaptureControl } from '@/components/life/VoiceCaptureControl'
import { fetchJson } from '@/lib/life/client'
import { LifeHoverCard } from '@/components/life/ui/LifeHoverCard'
import { LifeEventDialog } from '@/components/life/ui/LifeEventDialog'

export interface TodayEvent {
  id: string
  title: string
  at: string
  ends: string
  allDay: boolean
  cal: string
  where: string
  startTime: string | null
}

export interface TodayTask {
  id: string
  title: string
  project: string
  pri: 'high' | 'medium' | 'low'
  late: number
}

export interface TodayEntry {
  id: string
  at: string
  text: string
  kind: string
  kindColor: string
  project: string | null
}

interface TodayScreenProps {
  dateLabel: string
  localDate: string
  events: TodayEvent[]
  nextEvent?: TodayEvent & { countdown: string }
  tasks: TodayTask[]
  entries: TodayEntry[]
  briefContent: string | null
  formError?: string | null
}

/** Same card for Up next and each schedule row, so one event reads one way. */
function EventCard({ event }: { event: TodayEvent }) {
  return (
    // The card IS the link — a separate "open" line inside it was a second
    // control for the thing you were already pointing at.
    <Link href="/month" className="life-hc">
      <span className="life-hc-title">{event.title}</span>
      <span className="life-hc-row">
        <span>When</span>
        <span>{event.allDay ? 'All day' : `${event.at} – ${event.ends}`}</span>
      </span>
      <span className="life-hc-row">
        <span>Calendar</span>
        <span>{event.cal}</span>
      </span>
      {event.where ? (
        <span className="life-hc-row">
          <span>Where</span>
          <span>{event.where}</span>
        </span>
      ) : null}
    </Link>
  )
}

/** Task twin of EventCard. Earns its place by completing the title — the row
 *  ellipsizes it — and by naming the priority the dot only colour-codes. */
function TaskCard({ task }: { task: TodayTask }) {
  return (
    <Link href="/tasks" className="life-hc">
      <span className="life-hc-title">{task.title}</span>
      <span className="life-hc-row">
        <span>Project</span>
        <span>{task.project}</span>
      </span>
      <span className="life-hc-row">
        <span>Priority</span>
        <span>{task.pri}</span>
      </span>
      <span className="life-hc-row">
        <span>Due</span>
        <span className={task.late > 0 ? 'is-alert' : ''}>
          {task.late > 0 ? `${task.late}d overdue` : 'Today'}
        </span>
      </span>
    </Link>
  )
}

// ponytail: no JS height measurement. It computed `innerHeight - top - 24`,
// which ignored .life-app-shell's own bottom padding and so ran ~24px too
// tall — that was the scroll that kept coming back. The CSS height in
// app/today.css is correct, and `overflow: hidden` on .t2 means a wrong guess
// clips instead of scrolling the page.

/* ── Shared pieces ─────────────────────────────────────────────────────── */

/**
 * Clock and date are set at the same size and weight deliberately: on a screen
 * called Today, which day it is carries exactly as much as what time it is.
 * Up next sits opposite them, right-aligned, so the next event isn't repeated
 * a second time below.
 */
function TodayHead({
  dateLabel,
  nextEvent,
  taskCount,
  lateCount,
}: {
  dateLabel: string
  nextEvent?: TodayEvent & { countdown: string }
  taskCount: number
  lateCount: number
}) {
  const [clock, setClock] = useState('--:--')

  useEffect(() => {
    const tick = () => {
      const now = new Date()
      setClock(now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }))
    }
    tick()
    const id = setInterval(tick, 30000)
    return () => clearInterval(id)
  }, [])

  return (
    <header className="t2-head">
      <div className="t2-top">
        <div className="t2-stamp">
          <span className="t2-time" suppressHydrationWarning>{clock}</span>
          <span className="t2-rule" aria-hidden="true" />
          <span className="t2-date">{dateLabel}</span>
        </div>
        {nextEvent ? (
          <LifeHoverCard card={<EventCard event={nextEvent} />}>
            <Link href="/month" className="t2-upnext">
              <span className="t2-upnext-label">Up next</span>
              <span className="t2-upnext-row">
                <span className="t2-upnext-time">{nextEvent.at}</span>
                <span className="t2-upnext-title">{nextEvent.title}</span>
              </span>
              <span className="t2-upnext-countdown">{nextEvent.countdown}</span>
            </Link>
          </LifeHoverCard>
        ) : null}
      </div>
      <p className="t2-status">
        {taskCount} tasks
        <span className="t2-sep">·</span>
        <em>{lateCount} overdue</em>
      </p>
    </header>
  )
}

// The ids are the contract with VoiceCaptureControl: it writes the transcript
// into the textarea and flips the source field by getElementById, so the
// textarea stays uncontrolled. A useState-controlled value would be reverted
// by React the moment voice wrote to it.
function Capture({
  formError,
  idSuffix,
  phone = false,
}: {
  formError: string | null
  idSuffix: string
  phone?: boolean
}) {
  const { projects } = useLifeProjects()
  const textareaId = `life-entry-textarea-${idSuffix}`
  const sourceInputId = `life-entry-source-${idSuffix}`
  const transcriptId = `life-live-transcript-${idSuffix}`
  const voiceControl = (
    <VoiceCaptureControl
      sourceInputId={sourceInputId}
      textareaId={textareaId}
      liveTranscriptId={transcriptId}
    />
  )

  return (
    <form className="t2-capture" action="/api/life/entries" method="post">
      <input id={sourceInputId} name="source" type="hidden" defaultValue="text" />
      {phone ? <div className="t2-phone-voice">{voiceControl}</div> : null}
      {/* rows={1} is load-bearing: a textarea's rows attribute is an intrinsic
          height floor that minmax(0, 1fr) cannot override, and it defaults to 2.
          With the default, the box refused to shrink and pushed the footer —
          the Save button — past the bottom of the column. It still fills the
          space, because .t2-input sets height: 100%. */}
      <textarea
        className="t2-input"
        rows={1}
        id={textareaId}
        name="content"
        placeholder="What happened?"
      />
      <div className="t2-capture-foot">
        {/* The real hold-to-capture, not the lab's mock button. It also owns the
            2s autosave chip, so voice entries post without touching Save. */}
        {!phone ? voiceControl : null}
        <label className="t2-capture-project">
          <span>Project</span>
          <select name="projectSlug" defaultValue="" aria-label="Project for this capture">
            <option value="">No project</option>
            {projects.map((project) => (
              <option key={project.slug} value={project.slug}>{project.name}</option>
            ))}
          </select>
        </label>
        <span className="life-kbd">⌘↵</span>
        <button type="submit" className="life-btn primary">
          Save
        </button>
      </div>
      {/* Visually hidden (position: absolute), so it costs no grid row. */}
      <div id={transcriptId} className="life-live-transcript" aria-live="polite" />
      {formError ? <p className="error-text">{formError}</p> : null}
    </form>
  )
}

function TaskQuickAdd({ label = false }: { label?: boolean }) {
  const router = useRouter()
  const { projects } = useLifeProjects()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    const form = event.currentTarget
    const data = new FormData(form)
    const title = String(data.get('title') || '').trim()
    if (!title) return
    setSaving(true)
    setError(null)
    try {
      await fetchJson('/api/life/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title,
          projectSlug: String(data.get('projectSlug') || '') || null,
          priority: String(data.get('priority') || 'medium'),
          dueLocalDate: String(data.get('dueLocalDate') || '') || null,
        }),
      })
      form.reset()
      setOpen(false)
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Task creation failed.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="t2-card-add">
      <button type="button" className="t2-add-button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span aria-hidden="true">+</span>{label ? <span>Add task</span> : <span className="sr-only">Add task</span>}
      </button>
      {open ? (
        <form className="t2-quick-form" onSubmit={submit}>
          <input className="text-input" name="title" autoFocus placeholder="What needs doing?" aria-label="Task title" />
          <div className="t2-quick-fields">
            <select className="text-input" name="projectSlug" defaultValue="" aria-label="Task project">
              <option value="">No project</option>
              {projects.map((project) => <option key={project.slug} value={project.slug}>{project.name}</option>)}
            </select>
            <select className="text-input" name="priority" defaultValue="medium" aria-label="Task priority">
              <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
            </select>
            <input className="text-input" name="dueLocalDate" type="date" aria-label="Task due date" />
          </div>
          <div className="t2-quick-actions">
            {error ? <span className="error-text" role="alert">{error}</span> : null}
            <button type="button" className="life-btn ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" className="life-btn primary" disabled={saving}>{saving ? 'Adding…' : 'Add task'}</button>
          </div>
        </form>
      ) : null}
    </div>
  )
}

function EventQuickAdd({ localDate, label = false }: { localDate: string; label?: boolean }) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  return (
    <div className="t2-card-add">
      <button type="button" className="t2-add-button" onClick={() => setOpen(true)} aria-label="Add event">
        <span aria-hidden="true">+</span>{label ? <span>Add event</span> : null}
      </button>
      {error ? <span className="error-text" role="alert">{error}</span> : null}
      <LifeEventDialog
        event={{ id: '', date: localDate, start: 540, end: 600, title: '', calendar: 'personal', attendeeEmails: [], reminderMinutes: [] }}
        open={open}
        onCancel={() => setOpen(false)}
        onDelete={() => undefined}
        onSave={(event) => {
          void fetchJson('/api/life/calendar/events', { method: 'POST', body: JSON.stringify({
            title: event.title, localDate: event.date, allDay: event.start === null,
            startTime: event.start === null ? null : `${String(Math.floor(event.start / 60)).padStart(2, '0')}:${String(event.start % 60).padStart(2, '0')}`,
            endTime: event.end === null ? null : `${String(Math.floor(event.end / 60)).padStart(2, '0')}:${String(event.end % 60).padStart(2, '0')}`,
            location: event.location || null, notes: event.notes || null,
            attendeeEmails: event.attendeeEmails || [], reminderMinutes: event.reminderMinutes || [],
          }) }).then(() => { setOpen(false); setError(null); router.refresh() }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Event creation failed.'))
        }}
      />
    </div>
  )
}

/** Keeps the shipped card anatomy: head + count pill, body, footer link. */
function Card({
  title,
  count,
  action,
  href,
  headAction,
  children,
  className = '',
}: {
  title: string
  count?: number
  action?: string
  href?: string
  headAction?: ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={`life-card t2-card ${className}`}>
      <div className="life-card-head">
        <h3>{title}</h3>
        <span className="t2-card-head-meta">{count != null ? <span className="count-pill">{count}</span> : null}{headAction}</span>
      </div>
      {children}
      {action && href ? (
        <div className="life-card-foot">
          <Link className="life-card-action" href={href}>
            {action} →
          </Link>
        </div>
      ) : null}
    </section>
  )
}

function TasksBody({ tasks }: { tasks: TodayTask[] }) {
  if (tasks.length === 0) {
    return <div className="life-empty">Nothing queued.</div>
  }
  return (
    <div className="t2-tasks">
      {tasks.map((task) => (
        <LifeHoverCard key={task.id} card={<TaskCard task={task} />}>
          {/* The row is a div, not a link: the checkbox has to be a real submit
              button, and a button inside an anchor is invalid — every tick
              would navigate instead of completing the task. So the check is a
              sibling form and the rest of the row is the link. */}
          <div className="t2-task">
            <form action={`/api/life/tasks/${task.id}`} method="post" className="t2-check-form">
              <input type="hidden" name="redirectTo" value="/" />
              <input type="hidden" name="status" value="done" />
              <button type="submit" className="t2-check" aria-label={`Mark "${task.title}" done`}>
                ✓
              </button>
            </form>
            <Link href="/tasks" className="t2-task-link">
              <span className={`pri-dot pri-${task.pri}`} aria-hidden="true" />
              <span className="t2-task-title">{task.title}</span>
              <span className="t2-task-project">{task.project}</span>
              {task.late > 0 ? <span className="t2-task-late">+{task.late}d</span> : null}
            </Link>
          </div>
        </LifeHoverCard>
      ))}
    </div>
  )
}

function ScheduleBody({ events }: { events: TodayEvent[] }) {
  if (events.length === 0) {
    return <div className="life-empty">No events.</div>
  }
  return (
    <div className="t2-lines">
      {events.map((event) => (
        <LifeHoverCard key={event.id} card={<EventCard event={event} />}>
          <Link href="/month" className="t2-line">
            <span className="t2-at">{event.allDay ? 'ALL DAY' : event.at}</span>
            <span className="t2-line-title">{event.title}</span>
          </Link>
        </LifeHoverCard>
      ))}
    </div>
  )
}

function CapturedBody({ entries }: { entries: TodayEntry[] }) {
  if (entries.length === 0) {
    return <div className="life-empty">Nothing captured yet.</div>
  }
  return (
    <div className="t2-lines">
      {entries.map((entry) => (
        <div key={entry.id} className="t2-feed">
          <span className="t2-at">{entry.at}</span>
          <span className="t2-feed-text">{entry.text}</span>
          <span className="t2-entry-tags"><span style={{ color: entry.kindColor }}>{entry.kind}</span>{entry.project ? <span>{entry.project}</span> : null}</span>
        </div>
      ))}
    </div>
  )
}

/* ── The screen ────────────────────────────────────────────────────────── */

export function TodayScreen({
  dateLabel,
  localDate,
  events,
  nextEvent,
  tasks,
  entries,
  briefContent,
  formError = null,
}: TodayScreenProps) {
  const lateCount = tasks.filter((task) => task.late > 0).length
  const desktop = (
    <div className="t2 t2-desktop">
      <TodayHead dateLabel={dateLabel} nextEvent={nextEvent} taskCount={tasks.length} lateCount={lateCount} />

      <div className="t2-console">
        <div className="t2-console-left">
          <Capture formError={formError} idSuffix="desktop" />
        </div>
        <div className="t2-console-right">
          <Card title="Today’s tasks" count={tasks.length} headAction={<TaskQuickAdd />} action="View all tasks" href="/tasks">
            <TasksBody tasks={tasks} />
          </Card>
          <Card title="Schedule" count={events.length} headAction={<EventQuickAdd localDate={localDate} />} action="Open calendar" href="/month">
            <ScheduleBody events={events} />
          </Card>
          <Card title="Captured today" count={entries.length} action="View entries" href="/history">
            <CapturedBody entries={entries} />
          </Card>
          <Card title="Morning brief" className="t2-brief-card">
            {briefContent ? (
              <MarkdownCard content={briefContent} />
            ) : (
              <div className="life-empty">No brief yet today.</div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
  return (
    <>
      {desktop}
      <div className="t2-phone">
        <Capture formError={formError} idSuffix="phone" phone />
        <div className="t2-phone-actions"><TaskQuickAdd label /><EventQuickAdd localDate={localDate} label /></div>
        <Card title="Today’s tasks" count={tasks.length} action="View all tasks" href="/tasks"><TasksBody tasks={tasks} /></Card>
        <Card title="Schedule" count={events.length} action="Open calendar" href="/month"><ScheduleBody events={events} /></Card>
      </div>
    </>
  )
}
