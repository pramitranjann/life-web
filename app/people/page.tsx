import { redirect } from 'next/navigation'

import { RolodexScreen, type RolodexPerson } from '@/components/life/labs/RolodexV2'
import { isAdminSession } from '@/lib/admin-auth'
import { latestInteractionDates, listPeople } from '@/lib/life/people'
import { getOwnerSettings } from '@/lib/life/settings'
import { getCurrentLocalDate } from '@/lib/life/time'

import './rolodex.css'

/** Whole days between two YYYY-MM-DD strings. UTC noon on both sides so a DST
 *  shift can't round the difference to the wrong day. */
function daysBetween(from: string, to: string) {
  const a = Date.parse(`${from}T12:00:00Z`)
  const b = Date.parse(`${to}T12:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.max(0, Math.round((b - a) / 86_400_000))
}

// Identity colour. The table has no colour column and doesn't need one — the
// stripe only has to be stable per person, not chosen.
const TONES = ['#e9b765', '#7fd899', '#e58fb8', '#9aa6ff', '#6fcfd6', '#c79bff', '#ff6c61', '#8d8d8d']
function toneFor(id: string) {
  let hash = 0
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return TONES[hash % TONES.length]
}

export default async function LifePeoplePage() {
  if (!(await isAdminSession())) {
    redirect('/login?next=/people')
  }

  const settings = await getOwnerSettings()
  const today = getCurrentLocalDate(settings.timezone)

  // 008/010 may not be applied yet — render the screen empty with a note rather
  // than 500ing the whole route on an unknown column.
  let people: RolodexPerson[] = []
  let unavailable = false
  try {
    const [rows, lastByPerson] = await Promise.all([listPeople(), latestInteractionDates()])
    people = rows.map((person) => {
      // No logged interaction means we genuinely don't know when you last
      // spoke. Falling back to created_at would invent a contact that never
      // happened, so `since` is null and the UI says so.
      const last = lastByPerson.get(person.id) ?? null
      return {
        id: person.id,
        name: person.name,
        role: person.role,
        relationship: person.relationship,
        since: last ? daysBetween(last, today) : null,
        cadence: person.cadence_days,
        channel: person.channel,
        how: person.how,
        why: person.why,
        email: person.email,
        phone: person.phone,
        links: person.links ?? [],
        likes: person.likes ?? [],
        dislikes: person.dislikes ?? [],
        tone: toneFor(person.id),
      }
    })
  } catch (error) {
    console.error('Rolodex: failed to load people (010 migration applied?)', error)
    unavailable = true
  }

  return <RolodexScreen people={people} today={today} unavailable={unavailable} />
}
