import type { InteractionKind, PersonRelationship } from '@/lib/life/types'

export const RELATIONSHIP_OPTIONS: PersonRelationship[] = [
  'mentor',
  'professor',
  'alumni',
  'recruiter',
  'founder',
  'collaborator',
  'contact',
]

export const RELATIONSHIP_LABEL: Record<PersonRelationship, string> = {
  mentor: 'Mentor',
  professor: 'Professor',
  alumni: 'Alumni',
  recruiter: 'Recruiter',
  founder: 'Founder',
  collaborator: 'Collaborator',
  contact: 'Contact',
}

export const INTERACTION_KIND_OPTIONS: InteractionKind[] = ['met', 'call', 'message', 'showed_work', 'note']

export const INTERACTION_KIND_LABEL: Record<InteractionKind, string> = {
  met: 'Met',
  call: 'Call',
  message: 'Message',
  showed_work: 'Showed work',
  note: 'Note',
}

/** Days between two YYYY-MM-DD dates (a - b), no timezone math. */
export function daysBetween(a: string, b: string) {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86400000)
}

/** "today" / "3d ago" / "3w ago" / "2mo ago" / "1y ago" for a last-contact date. */
export function agoLabel(lastDate: string, today: string) {
  const days = daysBetween(today, lastDate)
  if (days <= 0) return 'today'
  if (days < 7) return `${days}d ago`
  if (days < 60) return `${Math.round(days / 7)}w ago`
  if (days < 365) return `${Math.round(days / 30)}mo ago`
  return `${Math.round(days / 365)}y ago`
}
