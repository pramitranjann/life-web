import type { EntryRecord } from '@/lib/life/types'

export type EntryKind = 'Note' | 'Idea' | 'Task' | 'Event'

export interface EntryPresentation {
  kind: EntryKind
  color: string
}

const ENTRY_COLORS: Record<EntryKind, string> = {
  Note: 'var(--life-muted)',
  Idea: 'var(--life-accent)',
  Task: 'var(--life-amber)',
  Event: 'var(--life-green)',
}

const TASK_RE = /\b(?:need to|todo|to-do|must|should|book|reply|refine|prep|review|read|buy|call|email|send|draft|ship|fix|finish|submit|update|write)\b/i
const IDEA_RE = /^(?:what if|idea:|maybe\b|could\b|should we\b)|\?$|^note to self:.*\?/i
const EVENT_RE = /\b(?:meeting|call|event|appointment|flight|run|gym|lunch|dinner|crit|class|review|tomorrow|tonight|today|weekend)\b|\b\d{1,2}(?::\d{2})?\s?(?:am|pm)\b/i

export function inferEntryKind(content: string): EntryKind {
  const trimmed = content.trim()
  if (!trimmed) return 'Note'
  if (IDEA_RE.test(trimmed)) return 'Idea'
  if (TASK_RE.test(trimmed)) return 'Task'
  if (EVENT_RE.test(trimmed)) return 'Event'
  return 'Note'
}

export function getEntryPresentation(entry: Pick<EntryRecord, 'content'>): EntryPresentation {
  const kind = inferEntryKind(entry.content)
  return {
    kind,
    color: ENTRY_COLORS[kind],
  }
}
