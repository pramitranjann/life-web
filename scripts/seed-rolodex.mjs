// Populate the Rolodex from a plain-text file. Run:
//   node scripts/seed-rolodex.mjs people.txt          # dry run, prints only
//   node scripts/seed-rolodex.mjs people.txt --write  # actually inserts
//
// Format: one person per block, blank line between blocks. Only `name` is
// required — every other line is `key: value` and any you skip stay empty.
//
//   name: Ivan Tan
//   role: Design lead, Swipey
//   relationship: mentor
//   channel: Telegram
//   cadence: 30
//   why: Reports into him; keep looped on ship dates so review never blocks.
//   email: ivan@swipey.co
//   phone: +65 8123 4567
//   links: Site https://ivandsgn.com, LinkedIn https://linkedin.com/in/ivan
//   likes: type systems, vinyl
//   dislikes: last-minute scope creep
//   last: 2026-06-26 call Talked through the admin rebuild.
//
// `last` seeds one interaction, which is what drives "6w ago" and the whole
// overdue calculation. Without it a person reads as never-contacted and sits
// permanently overdue. Repeat the line for more history.

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const RELATIONSHIPS = ['mentor', 'professor', 'alumni', 'recruiter', 'founder', 'collaborator', 'contact']
const KINDS = ['met', 'call', 'message', 'showed_work', 'note']

const [file, ...flags] = process.argv.slice(2)
const write = flags.includes('--write')
if (!file) {
  console.error('Usage: node scripts/seed-rolodex.mjs <people.txt> [--write]')
  process.exit(1)
}

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '')
}

const list = (value) => value.split(',').map((s) => s.trim()).filter(Boolean)

/** "Site https://x.com, LinkedIn https://y.com" -> [{label, url}] */
const parseLinks = (value) =>
  list(value)
    .map((chunk) => {
      const at = chunk.search(/https?:\/\//)
      if (at === -1) return null
      const url = chunk.slice(at).trim()
      return { label: chunk.slice(0, at).trim() || new URL(url).hostname, url }
    })
    .filter(Boolean)

/** "2026-06-26 call Talked through the rebuild." -> one interaction */
function parseLast(value) {
  const m = value.match(/^(\d{4}-\d{2}-\d{2})\s+(\S+)?\s*(.*)$/)
  if (!m) return null
  const kind = KINDS.includes(m[2]) ? m[2] : 'note'
  const summary = (KINDS.includes(m[2]) ? m[3] : `${m[2] ?? ''} ${m[3]}`).trim()
  return { local_date: m[1], kind, summary: summary || 'Contacted.' }
}

const people = readFileSync(file, 'utf8')
  .split(/\n\s*\n/)
  .map((block) => block.trim())
  .filter(Boolean)
  .map((block) => {
    const person = { links: [], likes: [], dislikes: [], interactions: [] }
    for (const line of block.split('\n')) {
      const m = line.match(/^\s*([a-zA-Z]+)\s*:\s*(.*)$/)
      if (!m) continue
      const [, rawKey, value] = m
      const key = rawKey.toLowerCase()
      if (!value.trim()) continue
      if (key === 'links') person.links.push(...parseLinks(value))
      else if (key === 'likes') person.likes.push(...list(value))
      else if (key === 'dislikes') person.dislikes.push(...list(value))
      else if (key === 'last') {
        const ix = parseLast(value)
        if (ix) person.interactions.push(ix)
      } else if (key === 'cadence') person.cadence_days = Number.parseInt(value, 10) || null
      else person[key] = value.trim()
    }
    return person
  })

const problems = []
people.forEach((p, i) => {
  if (!p.name) problems.push(`block ${i + 1}: no name`)
  if (p.relationship && !RELATIONSHIPS.includes(p.relationship)) {
    problems.push(`${p.name}: relationship "${p.relationship}" is not one of ${RELATIONSHIPS.join(', ')}`)
  }
})
if (problems.length) {
  console.error('Fix these first:\n' + problems.map((p) => `  - ${p}`).join('\n'))
  process.exit(1)
}

console.log(`${people.length} people parsed${write ? '' : ' (dry run — pass --write to insert)'}\n`)
for (const p of people) {
  console.log(
    `  ${p.name} — ${p.role ?? 'no role'} | ${p.relationship ?? 'contact'} | ${p.channel ?? 'no channel'} | ` +
      `every ${p.cadence_days ?? '—'}d | ${p.links.length} link(s) | ${p.interactions.length} interaction(s)`,
  )
}
if (!write) process.exit(0)

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const OWNER = 'owner'

for (const p of people) {
  const { interactions, ...fields } = p
  // Upsert by name so re-running edits people instead of duplicating them —
  // this script will be run several times while the list is still being built.
  const { data: existing } = await db
    .from('people')
    .select('id')
    .eq('user_id', OWNER)
    .eq('name', fields.name)
    .maybeSingle()

  const row = { ...fields, user_id: OWNER, relationship: fields.relationship ?? 'contact' }
  const { data: person, error } = existing
    ? await db.from('people').update(row).eq('id', existing.id).select('id').single()
    : await db.from('people').insert(row).select('id').single()

  if (error) {
    console.error(`  ✗ ${fields.name}: ${error.message}`)
    continue
  }

  for (const ix of interactions) {
    const { error: ixError } = await db
      .from('interactions')
      .insert({ ...ix, user_id: OWNER, person_id: person.id })
    if (ixError) console.error(`  ✗ ${fields.name} interaction: ${ixError.message}`)
  }
  console.log(`  ✓ ${fields.name}${existing ? ' (updated)' : ''}`)
}
