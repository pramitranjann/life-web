import type { ProjectStatus } from '@/lib/life/types'

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  active: 'Active',
  on_hold: 'On hold',
  done: 'Done',
}

export const STATUS_OPTIONS: ProjectStatus[] = ['active', 'on_hold', 'done']

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function diffDays(ymd: string, today: string) {
  const [ay, am, ad] = ymd.split('-').map(Number)
  const [by, bm, bd] = today.split('-').map(Number)
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86400000)
}

/** Format a YYYY-MM-DD as "3 Jul" without pulling in timezone math. */
export function formatYmd(ymd: string) {
  const [, m, d] = ymd.split('-').map(Number)
  return `${d} ${MONTHS[(m - 1) % 12]}`
}

export type DueTone = 'overdue' | 'today' | 'soon' | 'normal'

/** A relative label for a project/milestone target date. */
export function relativeDueLabel(ymd: string | null, today: string): { text: string; tone: DueTone } | null {
  if (!ymd) return null
  const diff = diffDays(ymd, today)
  if (diff < 0) return { text: `${-diff}d over`, tone: 'overdue' }
  if (diff === 0) return { text: 'Today', tone: 'today' }
  if (diff === 1) return { text: 'Tomorrow', tone: 'soon' }
  if (diff <= 14) return { text: `${formatYmd(ymd)} · ${diff}d`, tone: 'soon' }
  return { text: formatYmd(ymd), tone: 'normal' }
}

export function progressPct(done: number, total: number) {
  if (total <= 0) return 0
  return Math.round((done / total) * 100)
}

export type HealthTone = 'red' | 'amber' | 'green' | 'grey'

/** At-a-glance project health from its task counts and status. */
export function healthTone(item: {
  status: ProjectStatus
  open: number
  overdue: number
  total: number
}): HealthTone {
  if (item.overdue > 0) return 'red'
  if (item.total > 0 && item.open === 0) return 'green'
  if (item.status === 'on_hold') return 'amber'
  return 'grey'
}
