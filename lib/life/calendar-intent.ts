import { createCalendarEventForTask } from '@/lib/life/calendar'
import { getOwnerSettings } from '@/lib/life/settings'
import { updateTask } from '@/lib/life/tasks'
import { getCurrentLocalDate } from '@/lib/life/time'
import type { TaskCalendarIntent, TaskRecord } from '@/lib/life/types'

/**
 * Apply a calendar intent to a freshly created or edited task: push a new
 * Google event, link an existing one, or unlink. Best-effort — a calendar
 * failure must not lose the task itself, so the caller catches.
 *
 * Lives here rather than in the tasks route: Next only permits route handlers
 * and known config keys as exports from a route file, so sharing it with
 * [taskId]/route.ts through that module is a type error.
 */
export async function applyCalendarIntent(
  task: TaskRecord,
  intent: TaskCalendarIntent | null | undefined,
): Promise<TaskRecord> {
  if (!intent || intent.mode === 'none') return task

  if (intent.mode === 'event') {
    const settings = await getOwnerSettings()
    const localDate = task.due_local_date || getCurrentLocalDate(settings.timezone)
    const eventId = await createCalendarEventForTask({
      title: task.title,
      localDate,
      startTime: intent.startTime ?? null,
      endTime: intent.endTime ?? null,
      notes: task.details,
    })
    if (eventId) return updateTask(task.id, { calendarEventId: eventId })
    return task
  }

  if (intent.mode === 'link' && intent.eventId) {
    return updateTask(task.id, { calendarEventId: intent.eventId })
  }

  if (intent.mode === 'unlink') {
    return updateTask(task.id, { calendarEventId: null })
  }

  return task
}
