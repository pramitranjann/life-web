'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import { LifeCalendar } from '@/components/life/tasks/LifeCalendar'
import { PrintManagement } from '@/components/life/tasks/PrintManagement'
import { TaskForm } from '@/components/life/tasks/TaskForm'
import { lifeToast } from '@/components/life/ui/LifeToast'
import { useViewportMode } from '@/hooks/useViewportMode'
import { fetchJson } from '@/lib/life/client'
import { useLifeProjects } from '@/components/life/LifeProjectsProvider'
import type { ReceiptLayout } from '@/lib/life/receipt'
import { localDateTimeToUtc } from '@/lib/life/time'
import type {
  PrintJobRecord,
  TaskDraft,
  TaskLinkedEvent,
  TaskPriority,
  TaskPrintInfo,
  TaskRecord,
  TaskStatus,
} from '@/lib/life/types'

type TaskView = 'List' | 'Board' | 'Print'

const PRINT_ROW_LABEL: Record<string, string> = {
  pending: 'Queued',
  leased: 'Printing…',
  printed: 'Printed',
}

const PRINT_LAYOUT_CHOICES: Array<{
  value: ReceiptLayout
  label: string
  eyebrow: string
  description: string
}> = [
  {
    value: 'compact',
    label: 'Compact',
    eyebrow: 'Fast ticket',
    description: 'Minimal receipt with title, checkbox, and one short meta line.',
  },
  {
    value: 'standard',
    label: 'Standard',
    eyebrow: 'Balanced',
    description: 'Timestamped receipt with area and due date. Adds top feed so the cutter does not clip it.',
  },
  {
    value: 'focus',
    label: 'Focus',
    eyebrow: 'Deep work',
    description: 'Extra spacing plus task details. Adds top feed so the cutter does not clip it.',
  },
]

const PRINT_LAYOUT_LABEL: Record<ReceiptLayout, string> = {
  compact: 'Compact',
  standard: 'Standard',
  focus: 'Focus',
}

type PrintLayoutRequest = {
  heading: string
  detail: string
  resolve: (layout: ReceiptLayout | null) => void
}

/** The per-row "Print task" control — the manual print action in the core flow.
 * Shows current state; offers a print/retry button only when actionable. */
function PrintControl({
  info,
  busy,
  onQueue,
  onReprint,
}: {
  info: TaskPrintInfo | undefined
  busy: boolean
  onQueue: () => void
  onReprint: () => void
}) {
  const state = info?.state ?? 'none'

  if (state === 'none' || state === 'failed') {
    return (
      <button
        type="button"
        className={`life-print-inline${state === 'failed' ? ' is-failed' : ''}`}
        disabled={busy}
        title={state === 'failed' ? 'Print failed — queue again' : 'Print to desk'}
        onClick={(event) => {
          event.stopPropagation()
          onQueue()
        }}
      >
        {state === 'failed' ? '⟳ Print' : '🖨 Print'}
      </button>
    )
  }

  if (state === 'printed') {
    return (
      <button
        type="button"
        className="life-print-inline is-printed"
        disabled={busy}
        title="Reprint to desk"
        onClick={(event) => {
          event.stopPropagation()
          onReprint()
        }}
      >
        ⟳ Reprint
      </button>
    )
  }

  return <span className={`life-print-badge state-${state}`}>{PRINT_ROW_LABEL[state]}</span>
}
type TaskFilter = 'All' | 'Today' | 'Upcoming'

function diffDays(dueLocalDate: string, today: string) {
  const [ay, am, ad] = dueLocalDate.split('-').map(Number)
  const [by, bm, bd] = today.split('-').map(Number)
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86400000)
}

function boardDueLabel(dueLocalDate: string | null, today: string, timeZone: string) {
  if (!dueLocalDate) return null
  const diff = diffDays(dueLocalDate, today)
  let text: string
  let tone: 'overdue' | 'today' | 'soon' | 'normal'
  if (diff < 0) {
    text = `${-diff}d late`
    tone = 'overdue'
  } else if (diff === 0) {
    text = 'Today'
    tone = 'today'
  } else if (diff === 1) {
    text = 'Tomorrow'
    tone = 'soon'
  } else if (diff <= 6) {
    text = localDateTimeToUtc(dueLocalDate, timeZone, 12, 0).toLocaleDateString('en-GB', { timeZone, weekday: 'short' })
    tone = 'soon'
  } else {
    text = shortDay(dueLocalDate, timeZone)
    tone = 'normal'
  }
  return { text, tone }
}
type ColumnKey = 'open' | 'in_progress' | 'done'
type DesktopGroup = 'smart' | 'project' | 'status'

type TaskGroup = {
  key: string
  label: string
  mark: string
  items: TaskRecord[]
  defaultCollapsed?: boolean
  dim?: boolean
}

const STORAGE_KEY = 'life.tasksView'
const DEFAULT_VIEW: TaskView = 'List'

const COLUMNS: Array<{ key: ColumnKey; label: string; mark: string }> = [
  { key: 'open', label: 'To do', mark: 'var(--life-label)' },
  { key: 'in_progress', label: 'In progress', mark: 'var(--life-amber)' },
  { key: 'done', label: 'Done', mark: 'var(--life-green)' },
]

const PRI_LABEL: Record<TaskPriority, string> = {
  high: 'High',
  medium: 'Med',
  low: 'Low',
}

function readStoredView(): TaskView {
  if (typeof window === 'undefined') return DEFAULT_VIEW
  const stored = window.localStorage.getItem(STORAGE_KEY)
  return stored === 'List' || stored === 'Board' ? stored : DEFAULT_VIEW
}

function shortDay(localDate: string, timeZone: string) {
  const date = localDateTimeToUtc(localDate, timeZone, 12, 0)
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: 'numeric',
    month: 'short',
  }).formatToParts(date)
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${lookup.day} ${lookup.month}`
}

function dueSortValue(dueLocalDate: string | null, today: string) {
  if (!dueLocalDate) return [2, '9999-99-99'] as const
  if (dueLocalDate === today) return [0, dueLocalDate] as const
  return [1, dueLocalDate] as const
}

function taskComparator(a: TaskRecord, b: TaskRecord, today: string) {
  const [aRank, aDue] = dueSortValue(a.due_local_date, today)
  const [bRank, bDue] = dueSortValue(b.due_local_date, today)
  if (a.status === 'done' && b.status !== 'done') return 1
  if (a.status !== 'done' && b.status === 'done') return -1
  if (aRank !== bRank) return aRank - bRank
  if (aDue !== bDue) return aDue.localeCompare(bDue)
  return a.title.localeCompare(b.title)
}

function EditForm({
  task,
  today,
  timezone,
  linkedEventLabel,
  onSave,
  onCancel,
  onDelete,
}: {
  task: TaskRecord
  today: string
  timezone: string
  linkedEventLabel?: string | null
  onSave: (draft: TaskDraft) => Promise<void>
  onCancel: () => void
  onDelete: () => Promise<void>
}) {
  return (
    <TaskForm
      mode="edit"
      today={today}
      timezone={timezone}
      initial={{
        title: task.title,
        details: task.details,
        projectSlug: task.project_slug,
        priority: task.priority,
        dueLocalDate: task.due_local_date,
        calendarEventId: task.calendar_event_id,
        deskEligible: task.desk_eligible,
      }}
      linkedEventLabel={linkedEventLabel}
      onSubmit={onSave}
      onCancel={onCancel}
      onDelete={onDelete}
      LifeCalendarComponent={LifeCalendar}
    />
  )
}

function NewTaskComposer({
  today,
  timezone,
  defaultProjectSlug,
  defaultDue,
  onCreate,
  onClose,
}: {
  today: string
  timezone: string
  defaultProjectSlug: string
  defaultDue: string
  onCreate: (draft: TaskDraft) => Promise<void>
  onClose: () => void
}) {
  return (
    <TaskForm
      mode="create"
      today={today}
      timezone={timezone}
      initial={{ projectSlug: defaultProjectSlug || null, dueLocalDate: defaultDue || null }}
      onSubmit={onCreate}
      onCancel={onClose}
      resetOnSubmit
      LifeCalendarComponent={LifeCalendar}
    />
  )
}

export function TasksClient({
  tasks,
  today,
  timezone,
  error,
  initialProjectSlug = null,
  linkedEvents = {},
  printJobs = [],
  printInfo = {},
}: {
  tasks: TaskRecord[]
  today: string
  timezone: string
  error: string | null
  initialProjectSlug?: string | null
  linkedEvents?: Record<string, TaskLinkedEvent>
  printJobs?: PrintJobRecord[]
  printInfo?: Record<string, TaskPrintInfo>
}) {
  const router = useRouter()
  const { colorFor, labelFor, tintFor } = useLifeProjects()
  const viewport = useViewportMode()
  const [view, setView] = useState<TaskView>(DEFAULT_VIEW)
  const [filter, setFilter] = useState<TaskFilter>('All')
  const [items, setItems] = useState<TaskRecord[]>(tasks)
  const [groupBy, setGroupBy] = useState<DesktopGroup>('smart')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [newTitle, setNewTitle] = useState('')
  const [adding, setAdding] = useState(false)
  const [composerCol, setComposerCol] = useState<ColumnKey | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<ColumnKey | null>(null)
  const [taskActionError, setTaskActionError] = useState<string | null>(null)
  const [printBusyId, setPrintBusyId] = useState<string | null>(null)
  const [printNote, setPrintNote] = useState<string | null>(null)
  const [printLayoutRequest, setPrintLayoutRequest] = useState<PrintLayoutRequest | null>(null)
  const [swipe, setSwipe] = useState<{ id: string; dx: number; releasing: boolean } | null>(null)
  const swipeGesture = useRef<{ id: string; startX: number; startY: number; locked: 'x' | 'y' | null } | null>(null)

  useEffect(() => {
    setView(readStoredView())
  }, [])

  useEffect(() => {
    setItems(tasks)
  }, [tasks])

  useEffect(() => {
    if (editId && !items.some((task) => task.id === editId)) {
      setEditId(null)
    }
  }, [editId, items])

  useEffect(() => {
    const hasActivePrintJobs = printJobs.some((job) => job.status === 'pending' || job.status === 'leased')
    if (view !== 'Print' && !hasActivePrintJobs) return
    const interval = window.setInterval(() => {
      router.refresh()
    }, 5000)
    return () => window.clearInterval(interval)
  }, [printJobs, router, view])

  function handleViewChange(next: TaskView) {
    setView(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Ignore private browsing storage failures.
    }
  }

  // Board adds inline in the "To do" column; List uses the top composer.
  function handleNewTask() {
    if (view === 'Board') setComposerCol((current) => (current ? null : 'open'))
    else setAdding((value) => !value)
  }

  async function updateTaskStatus(taskId: string, status: TaskStatus, errorMessage = 'Task update failed.') {
    const previous = items
    setItems((current) => current.map((task) => (task.id === taskId ? { ...task, status } : task)))
    setTaskActionError(null)

    try {
      await fetchJson(`/api/life/tasks/${taskId}`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      })
      router.refresh()
    } catch {
      setItems(previous)
      setTaskActionError(errorMessage)
    }
  }

  async function saveEdit(taskId: string, draft: TaskDraft) {
    await fetchJson(`/api/life/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        title: draft.title,
        details: draft.details,
        projectSlug: draft.projectSlug,
        priority: draft.priority,
        dueLocalDate: draft.dueLocalDate,
        calendar: draft.calendar,
        deskEligible: draft.deskEligible === true,
      }),
    })

    setItems((current) =>
      current.map((task) =>
        task.id === taskId
          ? {
              ...task,
              title: draft.title,
              details: draft.details,
              project_slug: draft.projectSlug,
              priority: draft.priority,
              due_local_date: draft.dueLocalDate,
              desk_eligible: draft.deskEligible === true,
            }
          : task,
      ),
    )
    setEditId(null)
    setTaskActionError(null)
    router.refresh()
  }

  async function deleteTask(taskId: string) {
    await fetchJson(`/api/life/tasks/${taskId}`, {
      method: 'POST',
      body: JSON.stringify({ status: 'dismissed' }),
    })

    setItems((current) => current.filter((task) => task.id !== taskId))
    setEditId(null)
    setTaskActionError(null)
    router.refresh()
  }

  // Swipe-to-delete (phone list rows only). Fires the same delete call as the
  // trash icon, then offers Undo instead of a confirm modal — a swipe that
  // opens a dialog defeats the gesture.
  function deleteTaskWithUndo(task: TaskRecord) {
    const originalStatus = task.status
    void deleteTask(task.id)
    lifeToast({
      message: `Deleted "${task.title}"`,
      actionLabel: 'Undo',
      onAction: () => {
        setItems((current) => (current.some((entry) => entry.id === task.id) ? current : [...current, task]))
        void updateTaskStatus(task.id, originalStatus, 'Could not restore task.')
      },
    })
  }

  const SWIPE_DELETE_THRESHOLD = 96

  function handleSwipeStart(taskId: string) {
    return (event: React.TouchEvent) => {
      const touch = event.touches[0]
      swipeGesture.current = { id: taskId, startX: touch.clientX, startY: touch.clientY, locked: null }
    }
  }

  function handleSwipeMove(taskId: string) {
    return (event: React.TouchEvent) => {
      const gesture = swipeGesture.current
      if (!gesture || gesture.id !== taskId) return
      const touch = event.touches[0]
      const dx = touch.clientX - gesture.startX
      const dy = touch.clientY - gesture.startY

      if (gesture.locked === null) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
        gesture.locked = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
      }
      if (gesture.locked !== 'x') return

      // Horizontal intent confirmed — take over the gesture from here on.
      event.preventDefault()
      setSwipe({ id: taskId, dx: Math.min(0, dx), releasing: false })
    }
  }

  function handleSwipeEnd(taskId: string) {
    return () => {
      const gesture = swipeGesture.current
      swipeGesture.current = null
      if (!gesture || gesture.locked !== 'x') {
        setSwipe(null)
        return
      }
      setSwipe((current) => {
        if (!current || current.id !== taskId) return null
        if (-current.dx >= SWIPE_DELETE_THRESHOLD) {
          const task = taskForId(taskId)
          if (task) deleteTaskWithUndo(task)
          return null
        }
        return { ...current, dx: 0, releasing: true }
      })
    }
  }

  async function createTask() {
    const title = newTitle.trim()
    if (!title) return

    const previousTitle = newTitle
    setNewTitle('')
    setTaskActionError(null)

    try {
      await fetchJson('/api/life/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title,
          projectSlug: initialProjectSlug,
          dueLocalDate: filter === 'Today' ? today : null,
        }),
      })
      router.refresh()
    } catch {
      setNewTitle(previousTitle)
      setTaskActionError('Task creation failed.')
    }
  }

  async function createTaskFromComposer(draft: TaskDraft, status: TaskStatus = 'open') {
    await fetchJson('/api/life/tasks', {
      method: 'POST',
      body: JSON.stringify({
        title: draft.title,
        details: draft.details,
        projectSlug: draft.projectSlug,
        priority: draft.priority,
        dueLocalDate: draft.dueLocalDate,
        status,
        calendar: draft.calendar,
        deskEligible: draft.deskEligible === true,
      }),
    })

    setTaskActionError(null)
    router.refresh()
  }

  function taskForId(taskId: string) {
    return items.find((task) => task.id === taskId) ?? tasks.find((task) => task.id === taskId) ?? null
  }

  function requestPrintLayout(heading: string, detail: string) {
    if (printLayoutRequest) return Promise.resolve<ReceiptLayout | null>(null)
    return new Promise<ReceiptLayout | null>((resolve) => {
      setPrintLayoutRequest({ heading, detail, resolve })
    })
  }

  function closePrintLayoutRequest(layout: ReceiptLayout | null) {
    if (!printLayoutRequest) return
    printLayoutRequest.resolve(layout)
    setPrintLayoutRequest(null)
  }

  async function queuePrint(taskId: string) {
    const task = taskForId(taskId)
    const layout = await requestPrintLayout(
      'Choose print layout',
      task ? `Queue "${task.title}" to the desk printer.` : 'Queue this task to the desk printer.',
    )
    if (!layout) return false
    setPrintBusyId(taskId)
    setPrintNote(null)
    try {
      const result = await fetchJson<{ duplicate?: boolean }>('/api/life/print-jobs', {
        method: 'POST',
        body: JSON.stringify({ taskId, layout }),
      })
      setPrintNote(
        result?.duplicate
          ? `Already queued — showing existing ${PRINT_LAYOUT_LABEL[layout]} job.`
          : `Queued ${PRINT_LAYOUT_LABEL[layout]} receipt for the desk printer.`,
      )
      router.refresh()
    } catch {
      setPrintNote('Could not queue print job.')
    } finally {
      setPrintBusyId(null)
    }
    return true
  }

  async function queuePrintMany(taskIds: string[]) {
    const layout = await requestPrintLayout(
      'Choose print layout',
      `Queue ${taskIds.length} selected task${taskIds.length === 1 ? '' : 's'} to the desk printer with one shared layout.`,
    )
    if (!layout) return false
    setPrintNote(null)
    let queued = 0
    let duplicates = 0
    for (const taskId of taskIds) {
      try {
        const result = await fetchJson<{ duplicate?: boolean }>('/api/life/print-jobs', {
          method: 'POST',
          body: JSON.stringify({ taskId, layout }),
        })
        if (result?.duplicate) duplicates += 1
        else queued += 1
      } catch {
        // Continue queueing the rest; a silent loss is worse than a partial batch.
      }
    }
    setPrintNote(
      `Queued ${queued} task${queued === 1 ? '' : 's'} as ${PRINT_LAYOUT_LABEL[layout]}${
        duplicates ? `, ${duplicates} already queued` : ''
      }.`,
    )
    router.refresh()
    return true
  }

  async function reprintTask(taskId: string) {
    const task = taskForId(taskId)
    const layout = await requestPrintLayout(
      'Choose reprint layout',
      task
        ? `Reprint "${task.title}". This creates a new job and may produce a duplicate paper copy.`
        : 'Create a duplicate print job with the chosen layout.',
    )
    if (!layout) return false
    setPrintBusyId(taskId)
    setPrintNote(null)
    try {
      await fetchJson('/api/life/print-jobs', {
        method: 'POST',
        body: JSON.stringify({ taskId, reprint: true, layout }),
      })
      setPrintNote(`New ${PRINT_LAYOUT_LABEL[layout]} reprint job created.`)
      router.refresh()
    } catch {
      setPrintNote('Could not create reprint.')
    } finally {
      setPrintBusyId(null)
    }
    return true
  }

  async function retryPrintJob(jobId: string) {
    setPrintNote(null)
    try {
      await fetchJson(`/api/life/print-jobs/${jobId}`, {
        method: 'POST',
        body: JSON.stringify({ action: 'retry' }),
      })
      setPrintNote('Job requeued.')
      router.refresh()
    } catch {
      setPrintNote('Could not retry job.')
    }
  }

  async function cancelQueuedPrintJob(jobId: string) {
    setPrintNote(null)
    try {
      await fetchJson(`/api/life/print-jobs/${jobId}`, {
        method: 'POST',
        body: JSON.stringify({ action: 'cancel' }),
      })
      setPrintNote('Print job cancelled.')
      router.refresh()
    } catch {
      setPrintNote('Could not cancel print job.')
    }
  }

  async function deletePrintJob(jobId: string) {
    setPrintNote(null)
    try {
      await fetchJson(`/api/life/print-jobs/${jobId}`, {
        method: 'POST',
        body: JSON.stringify({ action: 'delete' }),
      })
      setPrintNote('Print job removed.')
      router.refresh()
    } catch {
      setPrintNote('Could not remove print job.')
    }
  }

  function eventChipFor(task: TaskRecord) {
    if (!task.calendar_event_id) return null
    const event = linkedEvents[task.calendar_event_id]
    const label = event
      ? event.allDay || !event.startTime
        ? '📅 Event'
        : `📅 ${new Date(event.startTime).toLocaleTimeString('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit' })}`
      : '🔗 Linked'
    return <span className="life-ev-chip">{label}</span>
  }

  async function moveTask(taskId: string, status: ColumnKey) {
    const task = items.find((entry) => entry.id === taskId)
    if (!task || task.status === status) return
    await updateTaskStatus(taskId, status, 'Failed to move task.')
  }

  function handleDrop(column: ColumnKey) {
    const taskId = dragId
    setDragId(null)
    setDragOverCol(null)
    if (!taskId) return
    void moveTask(taskId, column)
  }

  const scopedItems = useMemo(() => {
    let next = [...items]
    if (initialProjectSlug) {
      next = next.filter((task) => (task.project_slug || '') === initialProjectSlug)
    }
    if (filter === 'Today') {
      next = next.filter((task) => task.due_local_date === today)
    } else if (filter === 'Upcoming') {
      next = next.filter((task) => task.due_local_date != null && task.due_local_date > today)
    }
    return next.sort((left, right) => taskComparator(left, right, today))
  }, [filter, initialProjectSlug, items, today])

  const projectScoped = useMemo(
    () => (initialProjectSlug ? items.filter((task) => (task.project_slug || '') === initialProjectSlug) : items),
    [initialProjectSlug, items],
  )
  const allCount = projectScoped.length
  const todayCount = projectScoped.filter((task) => task.due_local_date === today).length
  const upcomingCount = projectScoped.filter((task) => task.due_local_date != null && task.due_local_date > today).length

  // Header summary: due today / still open / overdue.
  const activeItems = projectScoped.filter((task) => task.status !== 'done')
  const dueTodayCount = activeItems.filter((task) => task.due_local_date === today).length
  const openCount = activeItems.length
  const overdueCount = activeItems.filter((task) => task.due_local_date != null && task.due_local_date < today).length

  const title = initialProjectSlug
    ? labelFor(initialProjectSlug)
    : 'Everything on the list'

  const boardCols = COLUMNS.map((column) => {
    const columnItems = scopedItems.filter((task) => task.status === column.key)
    return {
      ...column,
      items: columnItems,
      count: columnItems.length,
      empty: columnItems.length === 0,
    }
  })

  const groupedItems = useMemo<TaskGroup[]>(() => {
    if (viewport === 'phone') return []

    // Smart: time-sectioned by due date, with Done pulled out at the end.
    if (groupBy === 'smart') {
      const overdue: TaskRecord[] = []
      const todayItems: TaskRecord[] = []
      const upcoming: TaskRecord[] = []
      const someday: TaskRecord[] = []
      const done: TaskRecord[] = []
      for (const task of scopedItems) {
        if (task.status === 'done') {
          done.push(task)
        } else if (!task.due_local_date) {
          someday.push(task)
        } else if (task.due_local_date < today) {
          overdue.push(task)
        } else if (task.due_local_date === today) {
          todayItems.push(task)
        } else {
          upcoming.push(task)
        }
      }
      return [
        { key: 'smart-overdue', label: 'Overdue', mark: 'var(--life-danger)', items: overdue },
        { key: 'smart-today', label: 'Today', mark: 'var(--life-accent)', items: todayItems },
        { key: 'smart-upcoming', label: 'Upcoming', mark: 'var(--life-amber)', items: upcoming },
        { key: 'smart-someday', label: 'Someday', mark: 'var(--life-label)', items: someday },
        { key: 'smart-done', label: 'Done', mark: 'var(--life-green)', items: done, defaultCollapsed: true, dim: true },
      ].filter((group) => group.items.length > 0)
    }

    if (groupBy === 'project') {
      const order = new Map(
        Array.from(new Set(scopedItems.map((task) => task.project_slug || 'general'))).map((slug, index) => [slug, index]),
      )
      return Array.from(order.keys())
        .map((slug) => ({
          key: `project-${slug}`,
          label: slug === 'general' ? 'General' : labelFor(slug) || slug,
          mark: 'var(--life-label)',
          items: scopedItems.filter((task) => (task.project_slug || 'general') === slug),
        }))
        .filter((group) => group.items.length > 0)
    }

    return [
      { key: 'status-open', label: 'To do', mark: 'var(--life-label)', items: scopedItems.filter((task) => task.status === 'open') },
      {
        key: 'status-progress',
        label: 'In progress',
        mark: 'var(--life-amber)',
        items: scopedItems.filter((task) => task.status === 'in_progress'),
      },
      {
        key: 'status-done',
        label: 'Done',
        mark: 'var(--life-green)',
        items: scopedItems.filter((task) => task.status === 'done'),
        defaultCollapsed: true,
        dim: true,
      },
    ].filter((group) => group.items.length > 0)
  }, [groupBy, scopedItems, today, viewport])

  const isPhone = viewport === 'phone'
  const showRowProject = groupBy !== 'project'
  const printLayoutDialog = printLayoutRequest ? (
    <div className="life-print-layout-overlay" role="presentation">
      <div className="life-print-layout-backdrop" onClick={() => closePrintLayoutRequest(null)} />
      <aside
        className={`life-print-layout-panel${isPhone ? ' is-phone' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="life-print-layout-title"
      >
        <div className="life-print-layout-head">
          <div>
            <p className="eyebrow">Desk Printer</p>
            <h2 id="life-print-layout-title">{printLayoutRequest.heading}</h2>
            <p className="life-print-layout-copy">{printLayoutRequest.detail}</p>
          </div>
          <button type="button" className="life-btn ghost" onClick={() => closePrintLayoutRequest(null)}>
            Cancel
          </button>
        </div>

        <div className="life-print-layout-grid">
          {PRINT_LAYOUT_CHOICES.map((choice) => (
            <button
              key={choice.value}
              type="button"
              className="life-print-layout-card"
              onClick={() => closePrintLayoutRequest(choice.value)}
            >
              <span className="life-print-layout-card-eyebrow">{choice.eyebrow}</span>
              <span className="life-print-layout-card-title">{choice.label}</span>
              <span className="life-print-layout-card-body">{choice.description}</span>
            </button>
          ))}
        </div>
      </aside>
    </div>
  ) : null

  function renderBoard() {
    return (
      <div className="life-kanban">
        {boardCols.map((column) => (
          <div
            className={`life-kanban-col${dragOverCol === column.key ? ' is-dragover' : ''}`}
            key={column.key}
            onDragOver={(event) => {
              event.preventDefault()
              if (dragOverCol !== column.key) {
                setDragOverCol(column.key)
              }
            }}
            onDragLeave={(event) => {
              const nextTarget = event.relatedTarget
              if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
                setDragOverCol((current) => (current === column.key ? null : current))
              }
            }}
            onDrop={(event) => {
              event.preventDefault()
              handleDrop(column.key)
            }}
          >
            <div className="life-kanban-col-head">
              <span className="col-mark" style={{ background: column.mark }} />
              <h3>{column.label}</h3>
              <span className="count-pill">{column.count}</span>
              <button
                type="button"
                className="life-kanban-col-add"
                aria-label={`Add task to ${column.label}`}
                onClick={() => setComposerCol((current) => (current === column.key ? null : column.key))}
              >
                +
              </button>
            </div>
            <div className="life-kanban-list">
              {composerCol === column.key ? (
                <div className="life-kanban-card life-kanban-card-editing">
                  <NewTaskComposer
                    today={today}
                    timezone={timezone}
                    onCreate={(draft) => createTaskFromComposer(draft, column.key)}
                    onClose={() => setComposerCol(null)}
                    defaultProjectSlug={initialProjectSlug || ''}
                    defaultDue={filter === 'Today' ? today : ''}
                  />
                </div>
              ) : null}
              {column.items.map((task) => {
                const project = task.project_slug ? labelFor(task.project_slug) : 'General'

                if (editId === task.id) {
                  return (
                    <div className="life-kanban-card life-kanban-card-editing" key={task.id}>
                      <EditForm
                        task={task}
                        today={today}
                        timezone={timezone}
                        linkedEventLabel={task.calendar_event_id ? linkedEvents[task.calendar_event_id]?.title : null}
                        onSave={(draft) => saveEdit(task.id, draft)}
                        onCancel={() => setEditId(null)}
                        onDelete={() => deleteTask(task.id)}
                      />
                    </div>
                  )
                }

                const isDone = task.status === 'done'
                const cardDue = boardDueLabel(task.due_local_date, today, timezone)
                return (
                  <div
                    className={`life-kanban-card${isDone ? ' is-done' : ''}${dragId === task.id ? ' is-dragging' : ''}`}
                    key={task.id}
                    draggable
                    style={{ borderLeftColor: colorFor(task.project_slug) }}
                    onClick={() => setEditId(task.id)}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = 'move'
                      event.dataTransfer.setData('text/plain', task.id)
                      setDragId(task.id)
                    }}
                    onDragEnd={() => {
                      setDragId(null)
                      setDragOverCol(null)
                    }}
                  >
                    <div className="life-kanban-card-title">{task.title}</div>
                    {task.details ? <p className="life-task-details">{task.details}</p> : null}
                    <div className="life-kanban-card-meta">
                      <span className="life-tag" style={tintFor(task.project_slug)}>{project}</span>
                      <span className={`life-kanban-pri pri-chip-${task.priority}`}>
                        <span className={`pri-dot pri-${task.priority}`} />
                        {PRI_LABEL[task.priority]}
                      </span>
                      {eventChipFor(task)}
                      {cardDue ? <span className={`life-due-chip due-${cardDue.tone}`}>{cardDue.text}</span> : null}
                      <PrintControl
                        info={printInfo[task.id]}
                        busy={printBusyId === task.id}
                        onQueue={() => queuePrint(task.id)}
                        onReprint={() => reprintTask(task.id)}
                      />
                      <button
                        type="button"
                        className="life-kanban-delete"
                        onClick={(event) => {
                          event.stopPropagation()
                          void deleteTask(task.id)
                        }}
                        aria-label="Delete task"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                )
              })}
              {column.empty ? <div className="life-kanban-empty">Nothing here.</div> : null}
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (isPhone) {
    return (
      <>
      <div style={{ padding: '18px 16px 0' }}>
        <div className="life-page-head">
          <div>
            <p className="eyebrow">Tasks</p>
            <h1>{title}</h1>
            {allCount > 0 ? (
              <p className="life-tasks-stat">
                <b>{dueTodayCount} due today</b> · {openCount} open · {overdueCount} overdue
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="life-btn primary"
            onClick={handleNewTask}
            aria-expanded={adding || composerCol !== null}
          >
            + New task
          </button>
        </div>

        {adding && view === 'List' ? (
          <NewTaskComposer
            today={today}
            timezone={timezone}
            onCreate={(draft) => createTaskFromComposer(draft, 'open')}
            onClose={() => setAdding(false)}
            defaultProjectSlug={initialProjectSlug || ''}
            defaultDue={filter === 'Today' ? today : ''}
          />
        ) : null}

        <div className="life-tasks-toolbar" style={{ paddingBottom: 10 }}>
          <div className="life-tasks-filters">
            <button
              type="button"
              className={`filter-chip${filter === 'All' ? ' is-active' : ''}`}
              onClick={() => setFilter('All')}
            >
              All <span className="chip-count">{allCount}</span>
            </button>
            <button
              type="button"
              className={`filter-chip${filter === 'Today' ? ' is-active' : ''}`}
              onClick={() => setFilter('Today')}
            >
              Today <span className="chip-count">{todayCount}</span>
            </button>
            <button
              type="button"
              className={`filter-chip${filter === 'Upcoming' ? ' is-active' : ''}`}
              onClick={() => setFilter('Upcoming')}
            >
              Upcoming <span className="chip-count">{upcomingCount}</span>
            </button>
          </div>

          <div className="segmented">
            <button
              type="button"
              className={`segmented-item${view === 'List' ? ' is-active' : ''}`}
              onClick={() => handleViewChange('List')}
            >
              List
            </button>
            <button
              type="button"
              className={`segmented-item${view === 'Board' ? ' is-active' : ''}`}
              onClick={() => handleViewChange('Board')}
            >
              Board
            </button>
            <button
              type="button"
              className={`segmented-item${view === 'Print' ? ' is-active' : ''}`}
              onClick={() => handleViewChange('Print')}
            >
              Print
            </button>
          </div>
        </div>

        {error ? <p className="error-text">{error}</p> : null}
        {taskActionError ? <p className="error-text">{taskActionError}</p> : null}
        {printNote ? <p className="life-print-note">{printNote}</p> : null}

        {view === 'Print' ? (
          <PrintManagement
            tasks={items}
            printJobs={printJobs}
            printInfo={printInfo}
            timezone={timezone}
            labelFor={(slug) => (slug ? labelFor(slug) : 'General')}
            onQueueMany={queuePrintMany}
            onReprint={reprintTask}
            onCancel={cancelQueuedPrintJob}
            onDelete={deletePrintJob}
            onRetry={retryPrintJob}
          />
        ) : view === 'List' ? (
          <div className="life-list">
            {scopedItems.map((task) => {
              const isDone = task.status === 'done'
              const project = task.project_slug ? labelFor(task.project_slug) : 'General'
              const due = task.due_local_date === today ? 'Today' : task.due_local_date ? shortDay(task.due_local_date, timezone) : ''

              if (editId === task.id) {
                return (
                  <div className="life-task-row life-task-row-editing" key={task.id}>
                    <EditForm
                      task={task}
                      today={today}
                      timezone={timezone}
                      linkedEventLabel={task.calendar_event_id ? linkedEvents[task.calendar_event_id]?.title : null}
                      onSave={(draft) => saveEdit(task.id, draft)}
                      onCancel={() => setEditId(null)}
                      onDelete={() => deleteTask(task.id)}
                    />
                  </div>
                )
              }

              const rowSwipe = swipe?.id === task.id ? swipe : null

              return (
                <div className="life-swipe-wrap" key={task.id}>
                  <div className="life-swipe-action" aria-hidden="true">Delete</div>
                  <div
                    className={`life-task-row life-swipe-row${rowSwipe && !rowSwipe.releasing ? ' is-dragging' : ''}`}
                    onClick={() => setEditId(task.id)}
                    onTouchStart={handleSwipeStart(task.id)}
                    onTouchMove={handleSwipeMove(task.id)}
                    onTouchEnd={handleSwipeEnd(task.id)}
                    onTouchCancel={handleSwipeEnd(task.id)}
                    style={{ cursor: 'pointer', transform: rowSwipe ? `translateX(${rowSwipe.dx}px)` : undefined }}
                  >
                    <button
                      type="button"
                      className={`life-check${isDone ? ' is-done' : ''}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        void updateTaskStatus(task.id, isDone ? 'open' : 'done')
                      }}
                      style={{ borderRadius: 0 }}
                      aria-label={isDone ? 'Reopen task' : 'Mark task done'}
                    >
                      ✓
                    </button>
                    <div className="life-task-main">
                      <span className={`life-task-title${isDone ? ' is-done' : ''}`}>{task.title}</span>
                    </div>
                    <div className="life-task-meta">
                      <span className="life-tag">{project}</span>
                      <span className="life-row-aside">{due}</span>
                      <PrintControl info={printInfo[task.id]} busy={printBusyId === task.id} onQueue={() => queuePrint(task.id)} onReprint={() => reprintTask(task.id)} />
                    </div>
                  </div>
                </div>
              )
            })}

            {scopedItems.length === 0 ? <div className="life-empty">Nothing here.</div> : null}
          </div>
        ) : (
          renderBoard()
        )}
      </div>
      {printLayoutDialog}
      </>
    )
  }

  return (
    <>
    <div className={`life-tasks-shell${view === 'Board' ? ' is-board' : ''}`}>
      <div className="life-page-head">
        <div>
          <p className="eyebrow">Tasks</p>
          <h1>{title}</h1>
          {allCount > 0 ? (
            <p className="life-tasks-stat">
              <b>{dueTodayCount} due today</b> · {openCount} open · {overdueCount} overdue
            </p>
          ) : null}
        </div>
        <button
          type="button"
          className="life-btn primary"
          onClick={handleNewTask}
          aria-expanded={adding || composerCol !== null}
        >
          + New task
        </button>
      </div>

      {adding && view === 'List' ? (
        <NewTaskComposer
          today={today}
          timezone={timezone}
          onCreate={(draft) => createTaskFromComposer(draft, 'open')}
          onClose={() => setAdding(false)}
          defaultProjectSlug={initialProjectSlug || ''}
          defaultDue={filter === 'Today' ? today : ''}
        />
      ) : null}

      <div className="life-tasks-toolbar">
        <div className="life-tasks-filters">
          <button
            type="button"
            className={`filter-chip${filter === 'All' ? ' is-active' : ''}`}
            onClick={() => setFilter('All')}
          >
            All <span className="chip-count">{allCount}</span>
          </button>
          <button
            type="button"
            className={`filter-chip${filter === 'Today' ? ' is-active' : ''}`}
            onClick={() => setFilter('Today')}
          >
            Today <span className="chip-count">{todayCount}</span>
          </button>
          <button
            type="button"
            className={`filter-chip${filter === 'Upcoming' ? ' is-active' : ''}`}
            onClick={() => setFilter('Upcoming')}
          >
            Upcoming <span className="chip-count">{upcomingCount}</span>
          </button>
        </div>

        <div className="life-task-toolbar-right">
          <span className="life-task-toolbar-label">Group</span>
          <div className="segmented">
            <button
              type="button"
              className={`segmented-item${groupBy === 'smart' ? ' is-active' : ''}`}
              onClick={() => setGroupBy('smart')}
            >
              Smart
            </button>
            <button
              type="button"
              className={`segmented-item${groupBy === 'project' ? ' is-active' : ''}`}
              onClick={() => setGroupBy('project')}
            >
              Project
            </button>
            <button
              type="button"
              className={`segmented-item${groupBy === 'status' ? ' is-active' : ''}`}
              onClick={() => setGroupBy('status')}
            >
              Status
            </button>
          </div>
          <div className="segmented">
            <button
              type="button"
              className={`segmented-item${view === 'List' ? ' is-active' : ''}`}
              onClick={() => handleViewChange('List')}
            >
              List
            </button>
            <button
              type="button"
              className={`segmented-item${view === 'Board' ? ' is-active' : ''}`}
              onClick={() => handleViewChange('Board')}
            >
              Board
            </button>
            <button
              type="button"
              className={`segmented-item${view === 'Print' ? ' is-active' : ''}`}
              onClick={() => handleViewChange('Print')}
            >
              Print
            </button>
          </div>
        </div>
      </div>

      {error ? <p className="error-text">{error}</p> : null}
      {taskActionError ? <p className="error-text">{taskActionError}</p> : null}
      {printNote ? <p className="life-print-note">{printNote}</p> : null}

      {view === 'Print' ? (
        <PrintManagement
          tasks={items}
          printJobs={printJobs}
          printInfo={printInfo}
          timezone={timezone}
          labelFor={(slug) => (slug ? labelFor(slug) : 'General')}
          onQueueMany={queuePrintMany}
          onReprint={reprintTask}
          onCancel={cancelQueuedPrintJob}
          onDelete={deletePrintJob}
          onRetry={retryPrintJob}
        />
      ) : view === 'List' ? (
        <div className="life-list">
          <div className="life-list-add">
            <span className="life-list-add-icon">+</span>
            <input
              className="life-list-add-input"
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void createTask()
                }
              }}
              placeholder="Add a task and press Enter…"
            />
          </div>

          {groupedItems.map((group) => {
            const open = !(collapsed[group.key] ?? group.defaultCollapsed ?? false)
            return (
              <div key={group.key}>
                <button
                  type="button"
                  className="life-task-group-toggle"
                  onClick={() =>
                    setCollapsed((current) => ({
                      ...current,
                      [group.key]: open,
                    }))
                  }
                >
                  <span className="life-task-group-caret">{open ? '▾' : '▸'}</span>
                  <span className="life-task-group-mark" style={{ background: group.mark }} />
                  <span className="life-task-group-label">{group.label}</span>
                  <span className="life-task-group-count">{group.items.length}</span>
                  <span className="life-task-group-rule" />
                </button>

                {open ? (
                  <div className={`life-task-group-body${group.dim ? ' is-dim' : ''}`}>
                    {group.items.map((task) => {
                      const isDone = task.status === 'done'
                      const project = task.project_slug
                        ? labelFor(task.project_slug)
                        : 'General'
                      const cardDue = boardDueLabel(task.due_local_date, today, timezone)

                      if (editId === task.id) {
                        return (
                          <div className="life-task-row life-task-row-editing" key={task.id}>
                            <EditForm
                              task={task}
                              today={today}
                              timezone={timezone}
                              linkedEventLabel={task.calendar_event_id ? linkedEvents[task.calendar_event_id]?.title : null}
                              onSave={(draft) => saveEdit(task.id, draft)}
                              onCancel={() => setEditId(null)}
                              onDelete={() => deleteTask(task.id)}
                            />
                          </div>
                        )
                      }

                      return (
                        <div
                          className={`life-list-row pri-edge-${task.priority}${isDone ? ' is-done' : ''}`}
                          key={task.id}
                          onClick={() => setEditId(task.id)}
                        >
                          <button
                            type="button"
                            className={`life-check${isDone ? ' is-done' : ''}`}
                            onClick={(event) => {
                              event.stopPropagation()
                              void updateTaskStatus(task.id, isDone ? 'open' : 'done')
                            }}
                            style={{ borderRadius: 0 }}
                            aria-label={isDone ? 'Reopen task' : 'Mark task done'}
                          >
                            ✓
                          </button>
                          <div className="life-list-row-body">
                            <div className={`life-task-title${isDone ? ' is-done' : ''}`}>{task.title}</div>
                            {task.details ? <div className="life-task-details">{task.details}</div> : null}
                          </div>
                          <div className="life-list-row-meta">
                            {showRowProject ? (
                              <span className="life-tag" style={tintFor(task.project_slug)}>
                                {project}
                              </span>
                            ) : null}
                            {eventChipFor(task)}
                            {cardDue ? (
                              <span className={`life-due-chip${isDone ? '' : ` due-${cardDue.tone}`}`}>{cardDue.text}</span>
                            ) : null}
                            <PrintControl
                              info={printInfo[task.id]}
                              busy={printBusyId === task.id}
                              onQueue={() => queuePrint(task.id)}
                              onReprint={() => reprintTask(task.id)}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            )
          })}

          {groupedItems.length === 0 ? <div className="life-empty">Nothing here.</div> : null}
        </div>
      ) : (
        renderBoard()
      )}
    </div>
    {printLayoutDialog}
    </>
  )
}
