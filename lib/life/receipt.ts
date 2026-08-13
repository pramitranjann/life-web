import { localDateTimeToUtc } from '@/lib/life/time'
import type { TaskRecord } from '@/lib/life/types'

// 58 mm thermal paper at Font A prints 32 columns. The ESP32 streams these
// lines verbatim; ESC/POS init, line feeds, and the paper cut are added in
// firmware, so this stays plain, human-readable, and unit-testable.
export const RECEIPT_WIDTH = 32

export type ReceiptLayout = 'compact' | 'standard' | 'focus'

const DIVIDER_HEAVY = '='.repeat(RECEIPT_WIDTH)
const DIVIDER_LIGHT = '-'.repeat(RECEIPT_WIDTH)
// Standard and focus need a small top margin so the cutter doesn't trim the
// first line, but 44 blank lines produced multiple inches of dead space.
const LEADING_LINES = 6

function centerLine(text: string, width = RECEIPT_WIDTH) {
  const trimmed = text.slice(0, width)
  const pad = Math.max(0, Math.floor((width - trimmed.length) / 2))
  return ' '.repeat(pad) + trimmed
}

/** Word-wrap to the paper width, hard-breaking any single word longer than it. */
function wrap(text: string, width = RECEIPT_WIDTH): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''

  for (const word of words) {
    if (word.length > width) {
      if (line) {
        lines.push(line)
        line = ''
      }
      for (let i = 0; i < word.length; i += width) {
        lines.push(word.slice(i, i + width))
      }
      continue
    }
    const candidate = line ? `${line} ${word}` : word
    if (candidate.length > width) {
      lines.push(line)
      line = word
    } else {
      line = candidate
    }
  }
  if (line) lines.push(line)
  return lines.length ? lines : ['']
}

function formatDate(now: Date, timeZone: string) {
  // "27 JUN 2026"
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
    .format(now)
    .toUpperCase()
}

function formatTime(now: Date, timeZone: string) {
  // "14:14" — 24h, always 2-digit
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const h = parts.find((p) => p.type === 'hour')?.value ?? '00'
  const m = parts.find((p) => p.type === 'minute')?.value ?? '00'
  return `${h}:${m}`
}

function headerTimestampLine(now: Date, timeZone: string) {
  // Centered "27 JUN 2026  14:14" (double-space between date and time)
  return centerLine(`${formatDate(now, timeZone)}  ${formatTime(now, timeZone)}`)
}

function footerLine(now: Date, timeZone: string, taskId: string) {
  // "27 JUN 2026 14:14          #A17C" — date left, code right, padded to width
  const left = `${formatDate(now, timeZone)} ${formatTime(now, timeZone)}`
  const right = shortTaskCode(taskId)
  const gap = RECEIPT_WIDTH - left.length - right.length
  return `${left}${' '.repeat(Math.max(1, gap))}${right}`
}

function dueWeekday(dueLocalDate: string, timeZone: string) {
  // "THU" — compact layout
  return new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short' })
    .format(localDateTimeToUtc(dueLocalDate, timeZone, 12, 0))
    .toUpperCase()
}

function dueWeekdayDate(dueLocalDate: string, timeZone: string) {
  // "THU 26 JUN" — standard/focus layout
  const noon = localDateTimeToUtc(dueLocalDate, timeZone, 12, 0)
  const weekday = new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short' }).format(noon).toUpperCase()
  const date = new Intl.DateTimeFormat('en-GB', { timeZone, day: '2-digit', month: 'short' }).format(noon).toUpperCase()
  return `${weekday} ${date}`
}

/** A short, human-readable tag for matching a paper receipt to a task. */
export function shortTaskCode(taskId: string) {
  return `#${taskId.replace(/-/g, '').slice(0, 4).toUpperCase()}`
}

function getAreaLine(projectName?: string | null, parentProjectName?: string | null) {
  const area = parentProjectName || projectName
  return area ? `    AREA: ${area.toUpperCase()}` : null
}

function getFromLine(projectName?: string | null, parentProjectName?: string | null) {
  return parentProjectName && projectName ? `    FROM: ${projectName.toUpperCase()}` : null
}

function buildCompact(input: {
  task: Pick<TaskRecord, 'id' | 'title' | 'status' | 'due_local_date' | 'details' | 'project_slug'>
  projectName?: string | null
  timeZone: string
}): string {
  const { task, projectName, timeZone } = input
  const lines: string[] = []

  lines.push(DIVIDER_HEAVY)
  lines.push(centerLine('PR LIFE_'))
  lines.push(DIVIDER_HEAVY)
  lines.push('')

  for (const line of wrap(task.title.toUpperCase(), RECEIPT_WIDTH)) lines.push(line)
  lines.push('')

  lines.push(task.status === 'done' ? '[x]' : '[ ]')
  lines.push('')

  const meta: string[] = []
  if (projectName) meta.push(projectName.toUpperCase())
  if (task.due_local_date) meta.push(`DUE ${dueWeekday(task.due_local_date, timeZone)}`)
  if (meta.length) lines.push(`    ${meta.join('  |  ')}`)

  lines.push(DIVIDER_HEAVY)

  return lines.join('\n')
}

function buildStandard(input: {
  task: Pick<TaskRecord, 'id' | 'title' | 'status' | 'due_local_date' | 'details' | 'project_slug'>
  projectName?: string | null
  parentProjectName?: string | null
  timeZone: string
  now: Date
}): string {
  const { task, projectName, parentProjectName, timeZone, now } = input
  const lines: string[] = []

  for (let i = 0; i < LEADING_LINES; i++) lines.push('')

  lines.push(DIVIDER_HEAVY)
  lines.push(centerLine('PR LIFE_'))
  lines.push(headerTimestampLine(now, timeZone))
  lines.push(DIVIDER_HEAVY)
  lines.push('')

  for (const line of wrap(task.title.toUpperCase(), RECEIPT_WIDTH)) lines.push(line)
  lines.push('')

  lines.push(task.status === 'done' ? '[x]' : '[ ]')
  lines.push('')

  const areaLine = getAreaLine(projectName, parentProjectName)
  if (areaLine) lines.push(areaLine)
  if (task.due_local_date) lines.push(`    DUE:  ${dueWeekdayDate(task.due_local_date, timeZone)}`)

  lines.push('')
  lines.push(DIVIDER_LIGHT)
  lines.push(footerLine(now, timeZone, task.id))

  return lines.join('\n')
}

function buildFocus(input: {
  task: Pick<TaskRecord, 'id' | 'title' | 'status' | 'due_local_date' | 'details' | 'project_slug'>
  projectName?: string | null
  parentProjectName?: string | null
  timeZone: string
  now: Date
}): string {
  const { task, projectName, parentProjectName, timeZone, now } = input
  const lines: string[] = []

  for (let i = 0; i < LEADING_LINES; i++) lines.push('')

  lines.push(DIVIDER_HEAVY)
  lines.push(centerLine('PR LIFE_'))
  lines.push(headerTimestampLine(now, timeZone))
  lines.push(DIVIDER_HEAVY)
  lines.push('')
  lines.push('')

  for (const line of wrap(task.title.toUpperCase(), RECEIPT_WIDTH)) lines.push(line)
  lines.push('')
  lines.push('')

  lines.push(task.status === 'done' ? '[x]' : '[ ]')
  lines.push('')

  const areaLine = getAreaLine(projectName, parentProjectName)
  if (areaLine) lines.push(areaLine)
  if (task.due_local_date) lines.push(`    DUE:  ${dueWeekdayDate(task.due_local_date, timeZone)}`)
  const fromLine = getFromLine(projectName, parentProjectName)
  if (fromLine) lines.push(fromLine)

  if (task.details?.trim()) {
    lines.push('')
    for (const line of wrap(task.details, RECEIPT_WIDTH - 4)) lines.push(`    ${line}`)
  }

  lines.push('')
  lines.push(DIVIDER_LIGHT)
  lines.push(footerLine(now, timeZone, task.id))

  return lines.join('\n')
}

/**
 * Render the ready-to-print receipt for a task. The result is stored on the
 * print job so the device never needs task data or any PR Life context — it just
 * prints the supplied bytes.
 */
export function buildReceiptPayload(input: {
  task: Pick<TaskRecord, 'id' | 'title' | 'status' | 'due_local_date' | 'details' | 'project_slug'>
  projectName?: string | null
  parentProjectName?: string | null
  timeZone: string
  layout?: ReceiptLayout
  now?: Date
}): string {
  const { layout = 'standard', now = new Date() } = input
  const base = { ...input, now }

  if (layout === 'compact') return buildCompact(input)
  if (layout === 'focus') return buildFocus(base)
  return buildStandard(base)
}
