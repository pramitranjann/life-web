'use client'

// The piece the first survey got wrong. reui has two calendar categories:
// `Calendar` (react-day-picker, date picking) and `Event Calendar` — month,
// week, day and agenda views with drag-to-reschedule. Only the second one
// overlaps WeekClient, and it's the one worth porting.
//
// ponytail: one component, four views. They share the event model, the
// selection state and the popover; splitting them into four files would mean
// four copies of the same date maths.

import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useRef, useState, type TouchEvent } from 'react'

import { LifeEventDialog } from './LifeEventDialog'

export interface CalEvent {
  id: string
  /** YYYY-MM-DD */
  date: string
  /** Minutes from midnight. Null for all-day. */
  start: number | null
  /** Minutes from midnight. */
  end: number | null
  title: string
  calendar?: 'personal' | 'work' | 'health'
  location?: string
  notes?: string
  attendeeEmails?: string[]
  reminderMinutes?: number[]
}

type View = 'month' | 'week' | 'day' | 'agenda'

const VIEWS: { id: View; label: string }[] = [
  { id: 'month', label: 'Month' },
  { id: 'week', label: 'Week' },
  { id: 'day', label: 'Day' },
  { id: 'agenda', label: 'Agenda' },
]

const HOUR_HEIGHT = 48
const SNAP_MINUTES = 15
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const pad = (n: number) => String(n).padStart(2, '0')
const toKey = (d: Date) =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
const parse = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}
const addDays = (key: string, n: number) =>
  toKey(new Date(parse(key).getTime() + n * 86400000))

/** Monday on or before the given date. */
const weekStart = (key: string) => addDays(key, -((parse(key).getUTCDay() + 6) % 7))

function timeLabel(minutes: number) {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`
}

function hourLabel(hour: number) {
  if (hour === 0 || hour === 24) return '12 AM'
  if (hour === 12) return '12 PM'
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`
}

/** Side-by-side columns for events whose times overlap. */
function packDay(events: CalEvent[]) {
  const timed = events
    .filter((e) => e.start !== null)
    .sort((a, b) => a.start! - b.start!)
  const packed: { event: CalEvent; col: number; cols: number }[] = []
  let cluster: CalEvent[] = []
  let clusterEnd = -1

  const flush = () => {
    if (!cluster.length) return
    const columns: CalEvent[][] = []
    for (const event of cluster) {
      let placed = false
      for (const column of columns) {
        if ((column[column.length - 1].end ?? 0) <= event.start!) {
          column.push(event)
          placed = true
          break
        }
      }
      if (!placed) columns.push([event])
    }
    columns.forEach((column, col) =>
      column.forEach((event) => packed.push({ event, col, cols: columns.length })),
    )
    cluster = []
    clusterEnd = -1
  }

  for (const event of timed) {
    if (cluster.length && event.start! >= clusterEnd) flush()
    cluster.push(event)
    clusterEnd = Math.max(clusterEnd, event.end ?? event.start! + 60)
  }
  flush()
  return packed
}

export function LifeEventCalendar({
  events,
  onChange,
  today,
  initialView = 'week',
  onCursorChange,
}: {
  events: CalEvent[]
  onChange: (next: CalEvent[]) => void
  today: string
  initialView?: View
  /** Fires when the visible date moves, so a caller can widen its fetch. */
  onCursorChange?: (date: string) => void
}) {
  const [view, setView] = useState<View>(initialView)
  const [cursor, setCursor] = useState(today)

  useEffect(() => {
    onCursorChange?.(cursor)
  }, [cursor, onCursorChange])
  const [editing, setEditing] = useState<CalEvent | null>(null)
  const [resizing, setResizing] = useState<{ id: string; edge: 'top' | 'bottom' } | null>(null)
  const resizeBase = useRef<{ startY: number; start: number; end: number } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()

  // Resize runs on raw pointer events rather than motion's drag: the handles
  // live inside a draggable parent, and two drag systems on nested elements
  // fight over the same pointer.
  useEffect(() => {
    if (!resizing) return
    const onMove = (e: PointerEvent) => {
      const base = resizeBase.current
      if (!base) return
      const delta =
        Math.round(((e.clientY - base.startY) / HOUR_HEIGHT) * 60 / SNAP_MINUTES) *
        SNAP_MINUTES
      onChange(
        events.map((ev) => {
          if (ev.id !== resizing.id) return ev
          if (resizing.edge === 'bottom') {
            return { ...ev, end: Math.min(24 * 60, Math.max(base.start + SNAP_MINUTES, base.end + delta)) }
          }
          return { ...ev, start: Math.max(0, Math.min(base.end - SNAP_MINUTES, base.start + delta)) }
        }),
      )
    }
    const onUp = () => setResizing(null)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [resizing, events, onChange])

  const byDate = useMemo(() => {
    const map = new Map<string, CalEvent[]>()
    for (const event of events) {
      const list = map.get(event.date) || []
      list.push(event)
      map.set(event.date, list)
    }
    return map
  }, [events])

  // Open on the working day, not on midnight.
  useEffect(() => {
    if (view !== 'week' && view !== 'day') return
    if (scrollRef.current) scrollRef.current.scrollTop = 8 * HOUR_HEIGHT
  }, [view])

  const days =
    view === 'day'
      ? [cursor]
      : Array.from({ length: 7 }, (_, i) => addDays(weekStart(cursor), i))

  const shift = (delta: number) => {
    if (view === 'month') {
      const d = parse(cursor)
      setCursor(toKey(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1))))
    } else if (view === 'day') {
      setCursor(addDays(cursor, delta))
    } else {
      setCursor(addDays(cursor, delta * 7))
    }
  }

  // Swipe-to-navigate on phones: same shift() the prev/next buttons use, so
  // month/week/day/agenda all move exactly as they already do. Only decided
  // on touchend (no preventDefault on touchmove) so vertical scroll of the
  // grid is untouched, and skipped entirely when the gesture starts on an
  // event card so it doesn't fight the drag-to-move / drag-to-resize handlers.
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const onTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) return
    if ((e.target as HTMLElement).closest('.life-evcal-event')) return
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  const onTouchEnd = (e: TouchEvent<HTMLDivElement>) => {
    const start = touchStart.current
    touchStart.current = null
    if (!start) return
    const dx = e.changedTouches[0].clientX - start.x
    const dy = e.changedTouches[0].clientY - start.y
    if (Math.abs(dx) > 60 && Math.abs(dx) > 1.5 * Math.abs(dy)) shift(dx > 0 ? -1 : 1)
  }

  const reschedule = (event: CalEvent, deltaMinutes: number, deltaDays: number) => {
    const duration = (event.end ?? 0) - (event.start ?? 0)
    const snapped =
      Math.round((event.start! + deltaMinutes) / SNAP_MINUTES) * SNAP_MINUTES
    const start = Math.max(0, Math.min(snapped, 24 * 60 - duration))
    onChange(
      events.map((e) =>
        e.id === event.id
          ? { ...e, date: addDays(e.date, deltaDays), start, end: start + duration }
          : e,
      ),
    )
  }

  const rangeLabel = () => {
    const d = parse(cursor)
    if (view === 'month') return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
    if (view === 'day')
      return `${WEEKDAYS[(d.getUTCDay() + 6) % 7]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
    const start = parse(days[0])
    const end = parse(days[6])
    return start.getUTCMonth() === end.getUTCMonth()
      ? `${start.getUTCDate()} – ${end.getUTCDate()} ${MONTHS[end.getUTCMonth()]}`
      : `${start.getUTCDate()} ${MONTHS[start.getUTCMonth()]} – ${end.getUTCDate()} ${MONTHS[end.getUTCMonth()]}`
  }

  return (
    <div className="life-evcal">
      <div className="life-evcal-toolbar">
        <div className="life-evcal-range">
          <button type="button" className="life-cal-nav" onClick={() => shift(-1)} aria-label="Previous">
            ‹
          </button>
          <strong>{rangeLabel()}</strong>
          <button type="button" className="life-cal-nav" onClick={() => shift(1)} aria-label="Next">
            ›
          </button>
          <button type="button" className="life-cal-today-btn" onClick={() => setCursor(today)}>
            Today
          </button>
        </div>

        <div className="life-evcal-actions">
          <div className="segmented life-evcal-views" role="tablist" aria-label="Calendar view">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                role="tab"
                aria-selected={view === v.id}
                className={`segmented-item${view === v.id ? ' is-active' : ''}`}
                onClick={() => setView(v.id)}
              >
                {v.label}
              </button>
            ))}
          </div>

          {/* reui's own note on variant 2: a stray drag shouldn't carve out a
              booking — creation is a button. Same call here. */}
          <button
            type="button"
            className="life-evcal-new"
            onClick={() =>
              setEditing({ id: '', date: cursor, start: 540, end: 600, title: '', calendar: 'personal' })
            }
            aria-label="New event"
            title="New event"
          >
            <span aria-hidden="true">+</span>
          </button>
        </div>
      </div>

      <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {view === 'month' ? (
        <MonthView
          cursor={cursor}
          today={today}
          byDate={byDate}
          onPick={(d) => { setCursor(d); setView('day') }}
          onCreate={(d) => setEditing({ id: '', date: d, start: 540, end: 600, title: '', calendar: 'personal' })}
        />
      ) : view === 'agenda' ? (
        <AgendaView days={days} byDate={byDate} today={today} onSelect={setEditing} />
      ) : (
        <div className={`life-evcal-grid${view === 'day' ? ' is-day' : ''}`}>
          <div className="life-evcal-head">
            <span className="life-evcal-corner" />
            {days.map((day) => {
              const d = parse(day)
              return (
                <div key={day} className={`life-evcal-col-head${day === today ? ' is-today' : ''}`}>
                  <span className="life-evcal-col-weekday">{WEEKDAYS[(d.getUTCDay() + 6) % 7]}</span>
                  <span className="life-evcal-col-date">{d.getUTCDate()}</span>
                </div>
              )
            })}
          </div>

          <div className="life-evcal-allday">
            <span className="life-evcal-allday-label">All day</span>
            {days.map((day) => (
              <div key={day} className="life-evcal-allday-cell">
                {(byDate.get(day) || [])
                  .filter((e) => e.start === null)
                  .map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      className="life-evcal-allday-chip"
                      onClick={() => setEditing(e)}
                    >
                      {e.title}
                    </button>
                  ))}
              </div>
            ))}
          </div>

          <div className="life-evcal-scroll" ref={scrollRef}>
            <div className="life-evcal-body" style={{ height: 24 * HOUR_HEIGHT }}>
              <div className="life-evcal-rail">
                {Array.from({ length: 24 }, (_, hour) => (
                  <span key={hour} className="life-evcal-hour" style={{ height: HOUR_HEIGHT }}>
                    {hour > 0 ? hourLabel(hour) : ''}
                  </span>
                ))}
              </div>

              {days.map((day) => (
                <div
                  key={day}
                  className="life-evcal-day-col"
                  data-date={day}
                  onDoubleClick={(e) => {
                    // Double-click, not single: a stray single click while
                    // reading shouldn't carve out an event, but the inline
                    // create that WeekClient always had needs to stay.
                    const rect = e.currentTarget.getBoundingClientRect()
                    const minutes =
                      Math.round((((e.clientY - rect.top) / HOUR_HEIGHT) * 60) / SNAP_MINUTES) *
                      SNAP_MINUTES
                    const start = Math.max(0, Math.min(minutes, 23 * 60))
                    setEditing({
                      id: '',
                      date: day,
                      start,
                      end: start + 60,
                      title: '',
                      calendar: 'personal',
                    })
                  }}
                  title="Double-click to add an event"
                >
                  {Array.from({ length: 24 }, (_, hour) => (
                    <span key={hour} className="life-evcal-hour-line" style={{ top: hour * HOUR_HEIGHT }} />
                  ))}

                  {packDay(byDate.get(day) || []).map(({ event, col, cols }) => {
                    const top = (event.start! / 60) * HOUR_HEIGHT
                    const height = Math.max(
                      18,
                      (((event.end ?? event.start! + 60) - event.start!) / 60) * HOUR_HEIGHT,
                    )
                    return (
                      <motion.div
                        key={event.id}
                        // Layout animation is disabled mid-resize: it would
                        // animate towards a height that changes every frame.
                        layout={!reduced && resizing?.id !== event.id}
                        className={`life-evcal-event cal-${event.calendar || 'personal'}`}
                        style={{
                          top,
                          height,
                          left: `calc(${(col / cols) * 100}% + 2px)`,
                          width: `calc(${100 / cols}% - 4px)`,
                        }}
                        drag={resizing ? false : view === 'day' ? 'y' : true}
                        dragMomentum={false}
                        dragSnapToOrigin
                        whileDrag={{ scale: 1.02, zIndex: 30 }}
                        onClick={() => setEditing(event)}
                        onDragEnd={(_, info) => {
                          const deltaMinutes = (info.offset.y / HOUR_HEIGHT) * 60
                          // Column width is uniform, so horizontal travel maps
                          // straight onto whole days.
                          const colWidth =
                            (document.querySelector('.life-evcal-day-col') as HTMLElement)
                              ?.offsetWidth || 1
                          const deltaDays =
                            view === 'day' ? 0 : Math.round(info.offset.x / colWidth)
                          if (Math.abs(deltaMinutes) < 4 && deltaDays === 0) return
                          reschedule(event, deltaMinutes, deltaDays)
                        }}
                      >
                        <span
                          className="life-evcal-resize is-top"
                          onPointerDown={(e) => {
                            e.stopPropagation()
                            e.preventDefault()
                            resizeBase.current = {
                              startY: e.clientY,
                              start: event.start!,
                              end: event.end ?? event.start! + 60,
                            }
                            setResizing({ id: event.id, edge: 'top' })
                          }}
                          role="separator"
                          aria-label="Change start time"
                        />
                        <span className="life-evcal-event-time">{timeLabel(event.start!)}</span>
                        <span className="life-evcal-event-title">{event.title}</span>
                        <span
                          className="life-evcal-resize is-bottom"
                          onPointerDown={(e) => {
                            e.stopPropagation()
                            e.preventDefault()
                            resizeBase.current = {
                              startY: e.clientY,
                              start: event.start!,
                              end: event.end ?? event.start! + 60,
                            }
                            setResizing({ id: event.id, edge: 'bottom' })
                          }}
                          role="separator"
                          aria-label="Change end time"
                        />
                      </motion.div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      </div>

      <LifeEventDialog
        event={editing}
        open={!!editing}
        onCancel={() => setEditing(null)}
        onDelete={(id) => {
          onChange(events.filter((e) => e.id !== id))
          setEditing(null)
        }}
        onSave={(next) => {
          onChange(
            events.some((e) => e.id === next.id)
              ? events.map((e) => (e.id === next.id ? next : e))
              : [...events, next],
          )
          setEditing(null)
        }}
      />
    </div>
  )
}

function MonthView({
  cursor,
  today,
  byDate,
  onPick,
  onCreate,
}: {
  cursor: string
  today: string
  byDate: Map<string, CalEvent[]>
  onPick: (date: string) => void
  onCreate: (date: string) => void
}) {
  const d = parse(cursor)
  const first = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-01`
  const start = weekStart(first)
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  const offset = Math.round((parse(first).getTime() - parse(start).getTime()) / 86400000)
  const cells = Math.ceil((offset + lastDay) / 7) * 7

  return (
    <>
      <div className="life-evcal-month-weekdays">
        {WEEKDAYS.map((name) => (
          <span key={name} className="life-cal-weekday">{name}</span>
        ))}
      </div>
      <div className="life-evcal-month">
        {Array.from({ length: cells }, (_, i) => {
          const key = addDays(start, i)
          const day = parse(key)
          const inMonth = day.getUTCMonth() === d.getUTCMonth()
          const dayEvents = byDate.get(key) || []
          return (
            <button
              type="button"
              key={key}
              onClick={() => onPick(key)}
              onDoubleClick={(e) => {
                e.stopPropagation()
                onCreate(key)
              }}
              className={[
                'life-evcal-month-cell',
                inMonth ? '' : 'is-out',
                key === today ? 'is-today' : '',
              ].filter(Boolean).join(' ')}
            >
              <span className="life-evcal-month-date">{day.getUTCDate()}</span>
              <span className="life-evcal-month-events">
                {dayEvents.slice(0, 3).map((event) => (
                  <span key={event.id} className={`life-evcal-month-chip cal-${event.calendar || 'personal'}`}>
                    {event.start !== null ? <em>{timeLabel(event.start)}</em> : null}
                    {event.title}
                  </span>
                ))}
                {dayEvents.length > 3 ? (
                  <span className="life-evcal-month-more">+{dayEvents.length - 3}</span>
                ) : null}
              </span>
            </button>
          )
        })}
      </div>
    </>
  )
}

function AgendaView({
  days,
  byDate,
  today,
  onSelect,
}: {
  days: string[]
  byDate: Map<string, CalEvent[]>
  today: string
  onSelect: (event: CalEvent) => void
}) {
  const populated = days.filter((day) => (byDate.get(day) || []).length > 0)

  if (populated.length === 0) {
    return <p className="life-evcal-agenda-empty">Nothing scheduled this week.</p>
  }

  return (
    <div className="life-evcal-agenda">
      {populated.map((day) => {
        const d = parse(day)
        const dayEvents = [...(byDate.get(day) || [])].sort(
          (a, b) => (a.start ?? -1) - (b.start ?? -1),
        )
        return (
          <div key={day} className={`life-evcal-agenda-day${day === today ? ' is-today' : ''}`}>
            <div className="life-evcal-agenda-date">
              <span className="life-evcal-agenda-num">{d.getUTCDate()}</span>
              <span className="life-evcal-agenda-weekday">{WEEKDAYS[(d.getUTCDay() + 6) % 7]}</span>
            </div>
            <div className="life-evcal-agenda-list">
              {dayEvents.map((event) => (
                <button
                  key={event.id}
                  type="button"
                  className="life-evcal-agenda-row"
                  onClick={() => onSelect(event)}
                >
                  <span className="life-evcal-agenda-time">
                    {event.start === null ? 'All day' : timeLabel(event.start)}
                  </span>
                  <span className={`life-evcal-agenda-mark cal-${event.calendar || 'personal'}`} aria-hidden="true" />
                  <span className="life-evcal-agenda-title">{event.title}</span>
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
