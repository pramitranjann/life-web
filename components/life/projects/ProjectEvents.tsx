'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import { fetchJson } from '@/lib/life/client'
import type { CalendarEventRecord } from '@/lib/life/types'

function formatEventWhen(event: CalendarEventRecord, timezone: string) {
  if (!event.start_time) return event.local_date
  const date = new Date(event.start_time)
  const day = date.toLocaleDateString('en-GB', { timeZone: timezone, weekday: 'short', day: 'numeric', month: 'short' })
  if (event.all_day) return day
  const time = date.toLocaleTimeString('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit' })
  return `${day} · ${time}`
}

export function ProjectEvents({
  projectSlug,
  events,
  today,
  timezone,
}: {
  projectSlug: string
  events: CalendarEventRecord[]
  today: string
  timezone: string
}) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(today)
  const [startTime, setStartTime] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function createEvent() {
    const trimmed = title.trim()
    if (!trimmed) return
    setSaving(true)
    setError(null)
    try {
      await fetchJson(`/api/life/projects/${projectSlug}/events`, {
        method: 'POST',
        body: JSON.stringify({ title: trimmed, localDate: date || today, startTime: startTime || null }),
      })
      setTitle('')
      setStartTime('')
      setAdding(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add event.')
    } finally {
      setSaving(false)
    }
  }

  async function unlinkEvent(eventId: string) {
    try {
      await fetchJson(`/api/life/projects/${projectSlug}/events?eventId=${encodeURIComponent(eventId)}`, { method: 'DELETE' })
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove event.')
    }
  }

  return (
    <div className="life-project-events">
      <div className="life-project-tasks-toolbar">
        {adding ? (
          <div className="life-event-add">
            <input
              className="life-list-add-input"
              autoFocus
              value={title}
              placeholder="Event title…"
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void createEvent()
                }
                if (event.key === 'Escape') setAdding(false)
              }}
            />
            <input className="text-input life-event-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            <input className="text-input life-event-time" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
            <button type="button" className="life-btn primary" disabled={saving || !title.trim()} onClick={() => void createEvent()}>
              {saving ? 'Adding…' : 'Add'}
            </button>
            <button type="button" className="life-btn ghost" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" className="life-btn ghost" onClick={() => setAdding(true)}>
            + Add event
          </button>
        )}
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      <div className="life-list">
        {events.length === 0 ? <div className="life-empty">No events tied to this project yet.</div> : null}
        {events.map((event) => (
          <div className="life-event-row" key={event.id}>
            <span className="life-event-mark" />
            <div className="life-event-body">
              <span className="life-event-title">{event.title || 'Event'}</span>
              {event.location ? <span className="life-event-loc">{event.location}</span> : null}
            </div>
            <span className="life-row-aside">{formatEventWhen(event, timezone)}</span>
            <button
              type="button"
              className="life-kanban-delete"
              aria-label="Remove from project"
              onClick={() => void unlinkEvent(event.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
