'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import { LifeCalendar } from '@/components/life/tasks/LifeCalendar'
import { TaskForm } from '@/components/life/tasks/TaskForm'
import { LifeConfirm } from '@/components/life/ui/LifeConfirm'
import { LifeTodoList, type Todo, type TodoGroup } from '@/components/life/ui/LifeTodoList'
import { fetchJson } from '@/lib/life/client'
import type {
  ProjectMilestoneRecord,
  TaskDraft,
  TaskLinkedEvent,
  TaskPriority,
  TaskRecord,
  TaskStatus,
} from '@/lib/life/types'
import { progressPct, relativeDueLabel } from './shared'

const BACKLOG = '__backlog__'
const PRIORITY_TO_TODO: Record<TaskPriority, 'high' | 'med' | 'low'> = { high: 'high', medium: 'med', low: 'low' }

function taskToTodo(task: TaskRecord, today: string, linked?: TaskLinkedEvent): Todo {
  return {
    id: task.id,
    title: task.title,
    done: task.status === 'done',
    priority: PRIORITY_TO_TODO[task.priority],
    due: relativeDueLabel(task.due_local_date, today)?.text,
    event: linked?.title,
  }
}

export function ProjectTasks({
  projectSlug,
  tasks,
  milestones,
  linkedEvents,
  today,
  timezone,
}: {
  projectSlug: string
  tasks: TaskRecord[]
  milestones: ProjectMilestoneRecord[]
  linkedEvents: Record<string, TaskLinkedEvent>
  today: string
  timezone: string
}) {
  const router = useRouter()
  const [items, setItems] = useState<TaskRecord[]>(tasks)
  const [composer, setComposer] = useState<string | null>(null)
  const [addingMilestone, setAddingMilestone] = useState(false)
  const [milestoneName, setMilestoneName] = useState('')
  const [pendingDeleteMilestone, setPendingDeleteMilestone] = useState<{ id: string; name: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setItems(tasks)
  }, [tasks])

  const groups = useMemo(() => {
    const realGroups = milestones.map((milestone) => ({
      key: milestone.id,
      name: milestone.name,
      targetDate: milestone.target_date,
      isBacklog: false,
      items: items.filter((task) => task.milestone_id === milestone.id),
    }))
    const backlog = {
      key: BACKLOG,
      name: 'Backlog',
      targetDate: null as string | null,
      isBacklog: true,
      items: items.filter((task) => !task.milestone_id),
    }
    return [...realGroups, backlog]
  }, [items, milestones])

  async function createTask(draft: TaskDraft, milestoneId: string | null) {
    await fetchJson('/api/life/tasks', {
      method: 'POST',
      body: JSON.stringify({
        title: draft.title,
        details: draft.details,
        projectSlug,
        priority: draft.priority,
        dueLocalDate: draft.dueLocalDate,
        calendar: draft.calendar,
        milestoneId,
        status: 'open',
      }),
    })
    setError(null)
    router.refresh()
  }

  async function toggleDone(task: TaskRecord) {
    const next: TaskStatus = task.status === 'done' ? 'open' : 'done'
    const previous = items
    setItems((current) => current.map((entry) => (entry.id === task.id ? { ...entry, status: next } : entry)))
    try {
      await fetchJson(`/api/life/tasks/${task.id}`, { method: 'POST', body: JSON.stringify({ status: next }) })
      router.refresh()
    } catch {
      setItems(previous)
      setError('Failed to update task.')
    }
  }

  async function deleteTask(taskId: string) {
    setItems((current) => current.filter((entry) => entry.id !== taskId))
    try {
      await fetchJson(`/api/life/tasks/${taskId}`, { method: 'POST', body: JSON.stringify({ status: 'dismissed' }) })
      router.refresh()
    } catch {
      setError('Failed to delete task.')
      router.refresh()
    }
  }

  // LifeTodoList hands back the whole (single-group) list on every toggle,
  // delete, and drag reorder. Diff it against the milestone's previous tasks
  // and route each change through the same endpoints the old rows used.
  function handleGroupChange(previousItems: TaskRecord[], nextTodos: Todo[]) {
    const nextIds = new Set(nextTodos.map((todo) => todo.id))
    const byId = new Map(previousItems.map((task) => [task.id, task]))

    for (const task of previousItems) {
      if (!nextIds.has(task.id)) void deleteTask(task.id)
    }
    for (const todo of nextTodos) {
      const task = byId.get(todo.id)
      if (task && (task.status === 'done') !== todo.done) void toggleDone(task)
    }

    // TaskRecord has no persisted order field, so a drag reorder is reflected
    // locally only — nothing to send to the API for that part of the diff.
    const reordered = nextTodos.map((todo) => byId.get(todo.id)).filter((t): t is TaskRecord => !!t)
    const previousIds = new Set(previousItems.map((task) => task.id))
    setItems((current) => [...current.filter((task) => !previousIds.has(task.id)), ...reordered])
  }

  async function createMilestone() {
    const name = milestoneName.trim()
    if (!name) return
    try {
      await fetchJson(`/api/life/projects/${projectSlug}/milestones`, { method: 'POST', body: JSON.stringify({ name }) })
      setMilestoneName('')
      setAddingMilestone(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add phase.')
    }
  }

  async function deleteMilestone(id: string) {
    try {
      await fetchJson(`/api/life/projects/${projectSlug}/milestones/${id}`, { method: 'DELETE' })
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete phase.')
    }
  }

  return (
    <div className="life-project-tasks">
      <div className="life-project-tasks-toolbar">
        {addingMilestone ? (
          <div className="life-milestone-add">
            <input
              className="life-list-add-input"
              autoFocus
              value={milestoneName}
              placeholder="Phase name (e.g. Research, Launch)…"
              onChange={(event) => setMilestoneName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void createMilestone()
                }
                if (event.key === 'Escape') setAddingMilestone(false)
              }}
            />
            <button type="button" className="life-btn primary" onClick={() => void createMilestone()}>
              Add phase
            </button>
            <button type="button" className="life-btn ghost" onClick={() => setAddingMilestone(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" className="life-btn ghost" onClick={() => setAddingMilestone(true)}>
            + Add phase
          </button>
        )}
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      {groups.map((group) => {
        if (group.isBacklog && group.items.length === 0 && groups.length > 1) return null
        const groupDone = group.items.filter((task) => task.status === 'done').length
        const pct = progressPct(groupDone, group.items.length)
        const groupDue = relativeDueLabel(group.targetDate, today)
        const todoGroup: TodoGroup = {
          id: group.key,
          title: group.name,
          todos: group.items.map((task) => taskToTodo(task, today, linkedEvents[task.id])),
        }
        return (
          <section className="life-milestone" key={group.key}>
            <div className="life-milestone-head">
              <span className="life-milestone-name">{group.name}</span>
              {groupDue ? <span className={`life-due-chip due-${groupDue.tone}`}>{groupDue.text}</span> : null}
              <span className="life-milestone-count">
                {groupDone}/{group.items.length}
              </span>
              <div className="life-milestone-bar">
                <div className="life-progress-track">
                  <div className="life-progress-fill" style={{ width: `${pct}%` }} />
                </div>
              </div>
              <button
                type="button"
                className="life-milestone-add-btn"
                aria-label={`Add task to ${group.name}`}
                onClick={() => setComposer((current) => (current === group.key ? null : group.key))}
              >
                +
              </button>
              {!group.isBacklog ? (
                <button
                  type="button"
                  className="life-milestone-delete"
                  aria-label={`Delete phase ${group.name}`}
                  onClick={() => setPendingDeleteMilestone({ id: group.key, name: group.name })}
                >
                  ×
                </button>
              ) : null}
            </div>

            {composer === group.key ? (
              <div className="life-milestone-composer">
                <TaskForm
                  mode="create"
                  today={today}
                  timezone={timezone}
                  initial={{ projectSlug }}
                  onSubmit={(draft) => createTask(draft, group.isBacklog ? null : group.key)}
                  onCancel={() => setComposer(null)}
                  resetOnSubmit
                  LifeCalendarComponent={LifeCalendar}
                />
              </div>
            ) : null}

            <LifeTodoList
              groups={[todoGroup]}
              onChange={(next) => handleGroupChange(group.items, next[0]?.todos ?? [])}
            />
          </section>
        )
      })}

      <LifeConfirm
        open={!!pendingDeleteMilestone}
        title={`Delete phase "${pendingDeleteMilestone?.name ?? ''}"?`}
        body="Its tasks move to the backlog."
        confirmLabel="Delete phase"
        onCancel={() => setPendingDeleteMilestone(null)}
        onConfirm={() => {
          if (pendingDeleteMilestone) void deleteMilestone(pendingDeleteMilestone.id)
          setPendingDeleteMilestone(null)
        }}
      />
    </div>
  )
}
