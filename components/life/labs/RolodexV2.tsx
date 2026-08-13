'use client'

// Rolodex v2, wired to the `people` + `interactions` tables. The page component
// loads the list and derives `since`; this file owns the views and mutations.
//
// The nullable trio is the thing to keep straight: `role`, `channel` and
// `cadence_days` are all nullable, and `since` is null whenever nothing has
// been logged. Null is never zero here — an unlogged person is unknown, not
// freshly contacted — so every decay path refuses rather than guesses.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { LifeHoverCard } from '../ui/LifeHoverCard'
import { LifeModal } from '../ui/LifeModal'

export interface RolodexPerson {
  id: string
  name: string
  role: string | null
  relationship: string
  /**
   * Days since the last logged interaction, or null when there is no history.
   * Null is not zero: an unlogged person is unknown, not freshly contacted,
   * and every decay calculation has to refuse rather than guess.
   */
  since: number | null
  /** Target gap between contacts. Null = no cadence set. */
  cadence: number | null
  channel: string | null
  /** How you know them. */
  how: string | null
  /** What you want from the relationship. */
  why: string | null
  email: string | null
  phone: string | null
  links: { label: string; url: string }[]
  likes: string[]
  dislikes: string[]
  /** Derived from the id server-side; no colour column exists. */
  tone: string
}

/** One row of the History list, from the `interactions` table. */
interface Interaction {
  id: string
  local_date: string
  kind: string
  summary: string
}

/**
 * Negative = overdue by that many days. Null when it cannot be known: no
 * cadence set, or no interaction ever logged. Both are genuinely "no answer",
 * and treating an unlogged person as contacted today would silently mark
 * everyone healthy.
 */
const dueIn = (c: RolodexPerson) =>
  c.cadence == null || c.since == null ? null : c.cadence - c.since

const AXIS_MIN = -30
const AXIS_MAX = 45
const NOW_PCT = ((0 - AXIS_MIN) / (AXIS_MAX - AXIS_MIN)) * 100

function axisPct(days: number) {
  const clamped = Math.max(AXIS_MIN, Math.min(AXIS_MAX, days))
  return ((clamped - AXIS_MIN) / (AXIS_MAX - AXIS_MIN)) * 100
}

function dayLabel(days: number | null) {
  if (days == null) return '—'
  if (days < 0) return `+${Math.abs(days)}d`
  if (days === 0) return 'today'
  return `${days}d`
}

/** "2026-06-26" -> "26 Jun". Parsed at UTC noon so no timezone shifts the day. */
function shortDate(localDate: string) {
  const d = new Date(`${localDate}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return localDate
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d)
}

function agoLabel(days: number | null) {
  if (days == null) return 'never logged'
  if (days === 0) return 'today'
  if (days < 14) return `${days}d ago`
  if (days < 60) return `${Math.round(days / 7)}w ago`
  return `${Math.round(days / 30)}mo ago`
}

function byUrgency(a: RolodexPerson, b: RolodexPerson) {
  const av = dueIn(a)
  const bv = dueIn(b)
  // Both unknown: the one you have gone longest without still sorts first,
  // and never-logged outranks any known gap.
  if (av == null && bv == null) return (b.since ?? Infinity) - (a.since ?? Infinity)
  if (av == null) return 1
  if (bv == null) return -1
  return av - bv
}

function ContactList({ rows, onOpen }: { rows: RolodexPerson[]; onOpen: (id: string) => void }) {
  return (
    <div className="lab-clist">
      {rows.map((person) => {
        const due = dueIn(person)
        const overdue = due != null && due < 0
        return (
          <button
            key={person.id}
            type="button"
            className={`lab-clist-row${overdue ? ' is-over' : ''}`}
            onClick={() => onOpen(person.id)}
          >
            <span className="lab-clist-stripe" style={{ background: person.tone }} />
            <span className="lab-clist-id">
              <span className="lab-clist-name">{person.name}</span>
              <span className="lab-clist-role">{person.role}</span>
            </span>
            <span className="lab-clist-channel">{person.channel}</span>
            <span className="lab-clist-last">{agoLabel(person.since)}</span>
            <span className={`lab-clist-state${overdue ? ' is-over' : ''}`}>
              {person.cadence == null ? (
                <span className="lab-clist-nocadence">no cadence</span>
              ) : (
                <><span className="lab-clist-state-dot" />{dayLabel(due)}</>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}

const METER_CELLS = 12

function meter(person: RolodexPerson) {
  if (person.cadence == null || person.since == null) return '·'.repeat(METER_CELLS)
  const remaining = Math.max(0, Math.min(1, (person.cadence - person.since) / person.cadence))
  const filled = Math.round(remaining * METER_CELLS)
  return '█'.repeat(filled) + '░'.repeat(METER_CELLS - filled)
}

/* ── Contact horizon ───────────────────────────────────────────────────── */

// Same values drive the footer labels and the per-row gridlines, so a line
// always sits directly under the tick that names it.
const AXIS_TICKS = [-30, 14, 45]

function ContactHorizon({ rows, onOpen }: { rows: RolodexPerson[]; onOpen: (id: string) => void }) {
  // Filter on dueIn, not on cadence: dueIn is ALSO null when nothing has been
  // logged, so `cadence != null` let those through to a `dueIn(c)!` assertion
  // that handed null to axisPct.
  const scheduled = rows.filter((c) => dueIn(c) != null)
  const loose = rows.filter((c) => dueIn(c) == null)

  return (
    <div className="lab-horizon">
      <div className="lab-horizon-body">
        {scheduled.map((c) => {
          const days = dueIn(c)!
          const over = days < 0
          const pct = axisPct(days)
          return (
            <div key={c.id} className={`lab-horizon-row${over ? ' is-over' : ''}`}>
              <span className="lab-horizon-id">
                <span className="lab-horizon-name">{c.name}</span>
                <span className="lab-horizon-role">{c.role}</span>
              </span>
              <span className="lab-horizon-track">
                {/* Gridlines and the now-line both live inside the track, not
                    the row: positioned on the row they'd be in a different
                    coordinate space from the dots (the id and days columns
                    aren't part of the axis), so they could never line up with
                    what they're supposed to mark. */}
                {AXIS_TICKS.map((tick) => (
                  <span key={tick} className="lab-horizon-grid" style={{ left: `${axisPct(tick)}%` }} aria-hidden="true" />
                ))}
                <span className="lab-horizon-now" style={{ left: `${NOW_PCT}%` }} aria-hidden="true" />
                <span
                  className="lab-horizon-bar"
                  style={{
                    left: `${Math.min(pct, NOW_PCT)}%`,
                    width: `${Math.abs(pct - NOW_PCT)}%`,
                  }}
                />
                {/* The wrapper carries the axis position, not the dot: the
                    hover card anchors to this element, so if the dot were the
                    absolute one the card would open at the track's left edge. */}
                <LifeHoverCard
                  className="lab-horizon-dotwrap"
                  style={{ left: `${pct}%` }}
                  card={
                    // A button, not a link: opening a person is in-page state
                    // here, not a route. The card is still the whole target.
                    <button type="button" className="life-hc" onClick={() => onOpen(c.id)}>
                      <span className="life-hc-title">{c.name}</span>
                      <span className="life-hc-sub">{c.role}</span>
                      <span className="life-hc-row">
                        <span>Last contact</span>
                        <span>{agoLabel(c.since)}</span>
                      </span>
                      <span className="life-hc-row">
                        <span>Cadence</span>
                        <span>every {c.cadence}d</span>
                      </span>
                      <span className="life-hc-row">
                        <span>Next due</span>
                        <span className={over ? 'is-alert' : ''}>{dayLabel(days)}</span>
                      </span>
                    </button>
                  }
                >
                  <button
                    type="button"
                    className="lab-horizon-dot"
                    style={{ background: c.tone }}
                    onClick={() => onOpen(c.id)}
                    aria-label={`Open ${c.name}, ${dayLabel(days)}`}
                  />
                </LifeHoverCard>
              </span>
              {/* No due-day number here. The dot's position on the axis IS
                  that number — printing "+12d" beside it states the same fact
                  twice in two notations. "6w ago" is the fact the axis does
                  not carry, so it stays. */}
              <span className="lab-horizon-last">{agoLabel(c.since)}</span>
            </div>
          )
        })}
      </div>

      {/* Same columns as a row, so the ticks sit under the dots. */}
      <div className="lab-horizon-foot" aria-hidden="true">
        <span />
        <span className="lab-horizon-axis">
          <span className="lab-horizon-tick" style={{ left: `${axisPct(-30)}%` }}>30d late</span>
          <span className="lab-horizon-tick is-now" style={{ left: `${NOW_PCT}%` }}>now</span>
          <span className="lab-horizon-tick" style={{ left: `${axisPct(14)}%` }}>+14</span>
          <span className="lab-horizon-tick" style={{ left: `${axisPct(45)}%` }}>+45</span>
        </span>
        <span />
      </div>

      {loose.length ? (
        <div className="lab-horizon-loose">
          <span className="lab-horizon-loose-label">Not on the axis</span>
          {loose.map((c) => (
            <span key={c.id} className="lab-horizon-chip">
              <span className="lab-horizon-chip-dot" style={{ background: c.tone }} />
              {c.name}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}


/* ── Person detail ─────────────────────────────────────────────────────── */

/**
 * One field that reads as text until editing is on, then becomes an input in
 * the same box. The class that styles the read view also styles the input, so
 * the two match in size and weight by construction instead of by two rules
 * someone has to keep in sync — and nothing shifts when you toggle.
 */
function Editable({
  editing,
  value,
  onChange,
  className,
  placeholder,
  multiline = false,
}: {
  editing: boolean
  value: string
  onChange: (next: string) => void
  className: string
  placeholder: string
  multiline?: boolean
}) {
  if (!editing) {
    return value ? (
      <span className={className}>{value}</span>
    ) : (
      <span className="lab-person-dash">—</span>
    )
  }
  const cls = `${className} lab-person-edit`
  return multiline ? (
    <textarea
      className={cls}
      value={value}
      placeholder={placeholder}
      rows={2}
      onChange={(e) => onChange(e.target.value)}
    />
  ) : (
    <input
      className={cls}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

const parseList = (raw: string) =>
  raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

function PersonDetail({
  person,
  today,
  onBack,
  onSaved,
}: {
  person: RolodexPerson
  today: string
  onBack: () => void
  onSaved: () => void
}) {
  // History and linked tasks arrive in one round trip from the person GET —
  // they are not in the list payload, because the index would then load every
  // interaction for every person to render rows that never show them.
  const [history, setHistory] = useState<Interaction[] | null>(null)
  const [linked, setLinked] = useState<{ id: string; title: string }[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadDetail = useCallback(async () => {
    try {
      const res = await fetch(`/api/life/people/${person.id}`)
      if (!res.ok) throw new Error('Could not load history.')
      const data = await res.json()
      setHistory(data.interactions ?? [])
      setLinked((data.tasks ?? []).map((t: { id: string; title: string }) => ({ id: t.id, title: t.title })))
    } catch {
      // A failed history load must not blank the page — the person's own
      // fields came from the server render and are still valid.
      setHistory([])
    }
  }, [person.id])

  useEffect(() => {
    void loadDetail()
  }, [loadDetail])

  // ponytail: local draft, no save. The lab has nothing to persist to, and
  // wiring this to the real table is the same onChange either way.
  const [draft, setDraft] = useState(person)
  const [editing, setEditing] = useState(false)
  const set = <K extends keyof RolodexPerson>(key: K, value: RolodexPerson[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const setLink = (index: number, patch: Partial<{ label: string; url: string }>) =>
    setDraft((d) => ({
      ...d,
      links: (d.links ?? []).map((l, i) => (i === index ? { ...l, ...patch } : l)),
    }))
  const addLink = () =>
    setDraft((d) => ({ ...d, links: [...(d.links ?? []), { label: '', url: '' }] }))
  const removeLink = (index: number) =>
    setDraft((d) => ({ ...d, links: (d.links ?? []).filter((_, i) => i !== index) }))

  const due = dueIn(draft)
  const over = due != null && due < 0

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/life/people/${person.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: draft.name,
          role: draft.role,
          how: draft.how,
          why: draft.why,
          email: draft.email,
          phone: draft.phone,
          links: draft.links,
          likes: draft.likes,
          dislikes: draft.dislikes,
        }),
      })
      if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string })?.error || 'Save failed.')
      setEditing(false)
      onSaved()
    } catch (e) {
      // Stay in edit mode on failure. Dropping out would look like a save.
      setError(e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  async function logContact() {
    setError(null)
    try {
      const res = await fetch(`/api/life/people/${person.id}/interactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ localDate: today, kind: 'message', summary: `Contacted via ${draft.channel || 'unknown'}.` }),
      })
      if (!res.ok) throw new Error('Could not log the contact.')
      await loadDetail()
      // The list behind this page derives "days since" from interactions, so
      // it is now stale — re-render it from the server.
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not log the contact.')
    }
  }

  return (
    <div className={`lab-person${editing ? ' is-editing' : ''}`}>
      <nav className="lab-person-nav">
        <button type="button" className="lab-person-back" onClick={onBack}>
          ← People
        </button>
      </nav>

      <header className="lab-person-head">
        <span className="lab-person-stripe" style={{ background: draft.tone }} />
        <div className="lab-person-id">
          <Editable
            editing={editing}
            value={draft.name ?? ''}
            onChange={(v) => set('name', v)}
            className="lab-person-name"
            placeholder="Name"
          />
          <Editable
            editing={editing}
            value={draft.role ?? ''}
            onChange={(v) => set('role', v)}
            className="lab-person-role"
            placeholder="Role, company"
          />
        </div>
        <div className="lab-person-actions">
          {/* Edit only. "Log contact" used to sit here too and again below —
              it belongs with the cadence state it resolves, not in a corner. */}
          <button
            type="button"
            className={`life-btn ${editing ? 'primary' : 'ghost'}`}
            aria-pressed={editing}
            disabled={saving}
            onClick={() => (editing ? void save() : setEditing(true))}
          >
            {saving ? 'Saving…' : editing ? 'Done' : 'Edit'}
          </button>
        </div>
      </header>

      {error ? <p className="lab-person-error" role="alert">{error}</p> : null}

      {/* Asymmetric split: who-they-are and the cadence instrument lead on
          the left (roughly 1.6fr), contact facts and preferences trail on
          the right (1fr) — the left column is what you read, the right is
          what you look up. */}
      <div className="lab-person-split">
        <div className="lab-person-col-main">
          {/* Who they are, first: the sentence that tells you why this row
              exists before you get to when you last spoke to them. */}
          {/* How and Want were reading as one paragraph. They now differ on
              three axes at once — colour, label, and a left rule — because
              one is background and the other is the thing you act on. */}
          <section className="lab-person-who">
            <Editable
              editing={editing}
              value={draft.how ?? ''}
              onChange={(v) => set('how', v)}
              className="lab-person-how"
              placeholder="How you know them"
              multiline
            />
            {draft.why || editing ? (
              <div className="lab-person-want">
                <span className="lab-person-want-label">Want</span>
                <Editable
                  editing={editing}
                  value={draft.why ?? ''}
                  onChange={(v) => set('why', v)}
                  className="lab-person-want-value"
                  placeholder="What you want from this"
                  multiline
                />
              </div>
            ) : null}
          </section>

          {/* The move: the cadence readout IS the control. You never read
              "12 days overdue" and then go looking for the button — resolving
              the state is part of the same object that reports it. Not
              editable: this is derived from the contact log, not typed. */}
          <div className={`lab-person-state${over ? ' is-over' : ''}`}>
            <div className="lab-person-state-main">
              <span className="lab-person-state-value">
                {draft.cadence == null
                  ? 'No cadence'
                  : over
                    ? `${Math.abs(due!)} days overdue`
                    : dayLabel(due)}
              </span>
              <span className="lab-person-state-sub">
                Last spoke {agoLabel(draft.since)}
                {draft.cadence != null ? ` · every ${draft.cadence} days` : ''}
                {draft.channel ? ` · ${draft.channel}` : ''}
              </span>
              <span className={`lab-person-meter${over ? ' is-over' : ''}`}>{meter(draft)}</span>
            </div>
            <button type="button" className="lab-person-cta" onClick={() => void logContact()}>
              <span className="lab-person-cta-label">Contact now</span>
              <span className="lab-person-cta-sub">
                {draft.channel ? `via ${draft.channel}` : 'log it'}
              </span>
            </button>
          </div>

          <section className="lab-person-block">
            <h4>History</h4>
            {history == null ? (
              <div className="life-empty">Loading…</div>
            ) : history.length === 0 ? (
              <div className="life-empty">Nothing logged yet.</div>
            ) : (
              <div className="lab-person-history">
                {history.map((h) => (
                  <div key={h.id} className="lab-person-event">
                    <span className="lab-person-event-at">{shortDate(h.local_date)}</span>
                    <span className="lab-person-event-kind">{h.kind.replace('_', ' ')}</span>
                    <span className="lab-person-event-note">{h.summary}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Three sizes, three jobs: section heading (12px mono, ruled) >
            field label (9px mono) > value (14px body). Everything here used
            to sit at one size, so "Contact" and "Email" and the address all
            read as the same kind of thing. */}
        <div className="lab-person-col-side">
          <section className="lab-person-block">
            <h4>Contact</h4>
            <div className="lab-person-contact">
              <div className="lab-person-contact-row">
                <span className="lab-person-contact-label">Email</span>
                <Editable
                  editing={editing}
                  value={draft.email ?? ''}
                  onChange={(v) => set('email', v)}
                  className="lab-person-contact-value"
                  placeholder="name@example.com"
                />
              </div>
              <div className="lab-person-contact-row">
                <span className="lab-person-contact-label">Phone</span>
                <Editable
                  editing={editing}
                  value={draft.phone ?? ''}
                  onChange={(v) => set('phone', v)}
                  className="lab-person-contact-value"
                  placeholder="+65 8000 0000"
                />
              </div>
              <div className="lab-person-contact-row">
                <span className="lab-person-contact-label">Links</span>
                {editing ? (
                  <span className="lab-person-linkedit">
                    {(draft.links ?? []).map((l, i) => (
                      <span key={i} className="lab-person-linkrow">
                        <input
                          className="lab-person-contact-value lab-person-edit"
                          value={l.label}
                          placeholder="Label"
                          aria-label={`Link ${i + 1} label`}
                          onChange={(e) => setLink(i, { label: e.target.value })}
                        />
                        <input
                          className="lab-person-contact-value lab-person-edit"
                          value={l.url}
                          placeholder="https://…"
                          aria-label={`Link ${i + 1} URL`}
                          onChange={(e) => setLink(i, { url: e.target.value })}
                        />
                        <button
                          type="button"
                          className="lab-person-linkdel"
                          aria-label={`Remove ${l.label || `link ${i + 1}`}`}
                          onClick={() => removeLink(i)}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    <button type="button" className="lab-person-linkadd" onClick={addLink}>
                      + Add link
                    </button>
                  </span>
                ) : draft.links?.length ? (
                  <span className="lab-person-contact-links">
                    {draft.links.map((l) => (
                      <a key={l.url} className="lab-person-link" href={l.url} target="_blank" rel="noreferrer">
                        {l.label}
                      </a>
                    ))}
                  </span>
                ) : (
                  <span className="lab-person-dash">—</span>
                )}
              </div>
            </div>
          </section>

          <section className="lab-person-block">
            <h4>Preferences</h4>
            <div className="lab-person-contact">
              <div className="lab-person-contact-row">
                <span className="lab-person-contact-label">Likes</span>
                {editing ? (
                  <input
                    className="lab-person-contact-value lab-person-edit"
                    value={(draft.likes ?? []).join(', ')}
                    placeholder="Comma separated"
                    onChange={(e) => set('likes', parseList(e.target.value))}
                  />
                ) : draft.likes?.length ? (
                  <span className="lab-person-chips">
                    {draft.likes.map((l) => (
                      <span key={l} className="lab-horizon-chip">{l}</span>
                    ))}
                  </span>
                ) : (
                  <span className="lab-person-dash">—</span>
                )}
              </div>
              <div className="lab-person-contact-row">
                <span className="lab-person-contact-label">Dislikes</span>
                {editing ? (
                  <input
                    className="lab-person-contact-value lab-person-edit"
                    value={(draft.dislikes ?? []).join(', ')}
                    placeholder="Comma separated"
                    onChange={(e) => set('dislikes', parseList(e.target.value))}
                  />
                ) : draft.dislikes?.length ? (
                  <span className="lab-person-chips">
                    {draft.dislikes.map((d) => (
                      <span key={d} className="lab-horizon-chip">{d}</span>
                    ))}
                  </span>
                ) : (
                  <span className="lab-person-dash">—</span>
                )}
              </div>
            </div>
          </section>

          <aside className="lab-person-block">
            {/* Notes was a hardcoded placeholder with no column behind it.
                `how` and `why` on the left already carry the prose. */}
            <h4 className="lab-person-subhead">In Life</h4>
            {linked.length === 0 ? (
              <span className="lab-person-dash">No open follow-ups</span>
            ) : (
              <div className="lab-person-chips">
                {linked.map((task) => (
                  <Link key={task.id} className="lab-horizon-chip lab-person-ref" href="/tasks">
                    {task.title}
                    <span className="lab-person-ref-arrow" aria-hidden="true">→</span>
                  </Link>
                ))}
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  )
}

/* ── The whole Rolodex screen ──────────────────────────────────────────── */

// Mirrors the DB check in lib/people.ts — anything else normalises to
// 'contact' server-side, so offering free text here would silently discard it.
const RELATIONSHIPS = ['contact', 'mentor', 'professor', 'alumni', 'recruiter', 'founder', 'collaborator']

const BLANK_ADD = {
  name: '', role: '', relationship: 'contact', channel: '', cadence: '',
  email: '', phone: '', link: '', how: '', why: '', likes: '', dislikes: '',
}

type Mode = 'list' | 'horizon'

const MODES: { id: Mode; label: string }[] = [
  { id: 'list', label: 'List' },
  { id: 'horizon', label: 'Horizon' },
]

export function RolodexScreen({
  people,
  today,
  unavailable = false,
}: {
  people: RolodexPerson[]
  today: string
  unavailable?: boolean
}) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('list')
  const [query, setQuery] = useState('')
  const [onlyDue, setOnlyDue] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [add, setAdd] = useState(BLANK_ADD)
  const [addBusy, setAddBusy] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  async function submitAdd() {
    setAddBusy(true)
    setAddError(null)
    try {
      // "Site https://x.com" -> {label, url}. A bare URL still works; the
      // hostname becomes the label rather than leaving it blank.
      const raw = add.link.trim()
      const at = raw.search(/https?:\/\//)
      const links = at === -1 ? [] : [{
        label: raw.slice(0, at).trim() || new URL(raw.slice(at)).hostname,
        url: raw.slice(at).trim(),
      }]
      const cadence = Number.parseInt(add.cadence, 10)
      const res = await fetch('/api/life/people', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: add.name,
          role: add.role || null,
          relationship: add.relationship,
          channel: add.channel || null,
          cadenceDays: Number.isFinite(cadence) ? cadence : null,
          email: add.email || null,
          phone: add.phone || null,
          how: add.how || null,
          why: add.why || null,
          links,
          likes: add.likes.split(',').map((t) => t.trim()).filter(Boolean),
          dislikes: add.dislikes.split(',').map((t) => t.trim()).filter(Boolean),
        }),
      })
      if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string })?.error || 'Could not add.')
      setAdd(BLANK_ADD)
      setAdding(false)
      router.refresh()
    } catch (e) {
      // Modal stays open with the draft intact — closing it would lose typing.
      setAddError(e instanceof Error ? e.message : 'Could not add.')
    } finally {
      setAddBusy(false)
    }
  }

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return people
      .filter((c) => {
        if (onlyDue && (dueIn(c) ?? 1) >= 0) return false
        if (!q) return true
        // role is nullable in the real schema; searching it must not throw.
        return c.name.toLowerCase().includes(q) || (c.role ?? '').toLowerCase().includes(q)
      })
      .sort(byUrgency)
  }, [people, query, onlyDue])

  const overdue = rows.filter((c) => (dueIn(c) ?? 1) < 0).length

  const openPerson = people.find((c) => c.id === openId) || null
  if (openPerson) {
    return (
      <div className="lab-rolodex">
        {/* key: the draft and editing state are seeded from props, so opening a
            different person has to remount rather than keep the old draft. */}
        <PersonDetail
          key={openPerson.id}
          person={openPerson}
          today={today}
          onBack={() => setOpenId(null)}
          onSaved={() => router.refresh()}
        />
      </div>
    )
  }

  return (
    <div className="lab-rolodex">
      <div className="lab-rolodex-head">
        <div className="lab-rolodex-title">
          <p className="eyebrow">Rolodex</p>
          <h3>People</h3>
        </div>
        <div className="lab-rolodex-headright">
          <div className="lab-rolodex-count">
            <strong>{rows.length}</strong> shown
            {overdue > 0 ? <em>{overdue} overdue</em> : null}
          </div>
          <button
            type="button"
            className="life-btn primary"
            onClick={() => setAdding(true)}
          >
            + Person
          </button>
        </div>
      </div>

      <div className="lab-rolodex-bar">
        <input
          className="lab-rolodex-search"
          type="search"
          value={query}
          placeholder="Search name or role…"
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search contacts"
        />
        <button
          type="button"
          className={`lab-rolodex-filter${onlyDue ? ' is-on' : ''}`}
          aria-pressed={onlyDue}
          onClick={() => setOnlyDue((v) => !v)}
        >
          Due only
        </button>
        <div className="lab-rolodex-modes" role="tablist" aria-label="View mode">
          {MODES.map((option) => (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={mode === option.id}
              className={`lab-rolodex-mode${mode === option.id ? ' is-active' : ''}`}
              onClick={() => setMode(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <LifeModal
        open={adding}
        title="Add person"
        onClose={() => setAdding(false)}
        footer={
          <>
            <button type="button" className="life-btn ghost" onClick={() => setAdding(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="life-btn primary"
              disabled={!add.name.trim() || addBusy}
              onClick={() => void submitAdd()}
            >
              {addBusy ? 'Adding…' : 'Add'}
            </button>
          </>
        }
      >
        <div className="lab-rolodex-add">
          {addError ? (
            <p className="lab-person-error lab-rolodex-field-wide" role="alert">{addError}</p>
          ) : null}
          <label className="lab-rolodex-field">
            <span className="lab-rolodex-field-label">Name</span>
            <input className="lab-rolodex-search" placeholder="Full name" aria-label="Name" autoFocus
              value={add.name} onChange={(e) => setAdd((a) => ({ ...a, name: e.target.value }))} />
          </label>
          <label className="lab-rolodex-field">
            <span className="lab-rolodex-field-label">Role</span>
            <input className="lab-rolodex-search" placeholder="Role, company" aria-label="Role"
              value={add.role} onChange={(e) => setAdd((a) => ({ ...a, role: e.target.value }))} />
          </label>
          {/* Relationship and Channel are real columns the form never had —
              relationship is a fixed set, so it's a select, not a text field. */}
          <label className="lab-rolodex-field">
            <span className="lab-rolodex-field-label">Relationship</span>
            <select className="lab-rolodex-search" aria-label="Relationship"
              value={add.relationship} onChange={(e) => setAdd((a) => ({ ...a, relationship: e.target.value }))}>
              {RELATIONSHIPS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <label className="lab-rolodex-field">
            <span className="lab-rolodex-field-label">Channel</span>
            <input className="lab-rolodex-search" placeholder="Telegram, email…" aria-label="Channel"
              value={add.channel} onChange={(e) => setAdd((a) => ({ ...a, channel: e.target.value }))} />
          </label>
          <label className="lab-rolodex-field">
            <span className="lab-rolodex-field-label">Cadence</span>
            <input className="lab-rolodex-search" placeholder="Days between check-ins" aria-label="Cadence in days" inputMode="numeric"
              value={add.cadence} onChange={(e) => setAdd((a) => ({ ...a, cadence: e.target.value }))} />
          </label>
          <label className="lab-rolodex-field">
            <span className="lab-rolodex-field-label">Email</span>
            <input className="lab-rolodex-search" type="email" placeholder="name@example.com" aria-label="Email"
              value={add.email} onChange={(e) => setAdd((a) => ({ ...a, email: e.target.value }))} />
          </label>
          <label className="lab-rolodex-field">
            <span className="lab-rolodex-field-label">Phone</span>
            <input className="lab-rolodex-search" type="tel" placeholder="+65 8000 0000" aria-label="Phone"
              value={add.phone} onChange={(e) => setAdd((a) => ({ ...a, phone: e.target.value }))} />
          </label>
          <label className="lab-rolodex-field">
            <span className="lab-rolodex-field-label">Link</span>
            <input className="lab-rolodex-search" placeholder="Site https://…" aria-label="Link"
              value={add.link} onChange={(e) => setAdd((a) => ({ ...a, link: e.target.value }))} />
          </label>
          <label className="lab-rolodex-field lab-rolodex-field-wide">
            <span className="lab-rolodex-field-label">How you know them</span>
            <input className="lab-rolodex-search" placeholder="One sentence" aria-label="How you know them"
              value={add.how} onChange={(e) => setAdd((a) => ({ ...a, how: e.target.value }))} />
          </label>
          <label className="lab-rolodex-field lab-rolodex-field-wide">
            <span className="lab-rolodex-field-label">What you want</span>
            <input className="lab-rolodex-search" placeholder="One sentence" aria-label="What you want from the relationship"
              value={add.why} onChange={(e) => setAdd((a) => ({ ...a, why: e.target.value }))} />
          </label>
          <label className="lab-rolodex-field">
            <span className="lab-rolodex-field-label">Likes</span>
            <input className="lab-rolodex-search" placeholder="Comma separated" aria-label="Likes"
              value={add.likes} onChange={(e) => setAdd((a) => ({ ...a, likes: e.target.value }))} />
          </label>
          <label className="lab-rolodex-field">
            <span className="lab-rolodex-field-label">Dislikes</span>
            <input className="lab-rolodex-search" placeholder="Comma separated" aria-label="Dislikes"
              value={add.dislikes} onChange={(e) => setAdd((a) => ({ ...a, dislikes: e.target.value }))} />
          </label>
        </div>
      </LifeModal>

      {unavailable ? (
        <div className="life-empty">
          People table unavailable — run the 010 migration.
        </div>
      ) : people.length === 0 ? (
        <div className="life-empty">No one in the Rolodex yet. Add someone.</div>
      ) : rows.length === 0 ? (
        <div className="life-empty">No one matches that.</div>
      ) : mode === 'list' ? (
        <ContactList rows={rows} onOpen={setOpenId} />
      ) : (
        <ContactHorizon rows={rows} onOpen={setOpenId} />
      )}
    </div>
  )
}
