'use client'

// Edit form for LifeEventCalendar, matching what reui's c-event-calendar-3
// does: title, colour, all-day switch, start time, duration, save, delete.
// Its five colour buttons become Life's three calendars; its 7:00–19:00 start
// select covers a working day, which is too narrow for a life calendar.
// ponytail: native <dialog> again, and LifeMenu for the selects — the kit
// composes instead of growing a second dropdown.

import { useEffect, useId, useRef, useState } from 'react'

import { LifeMenu } from './LifeMenu'
import type { CalEvent } from './LifeEventCalendar'

const CALENDARS: { value: NonNullable<CalEvent['calendar']>; label: string }[] = [
  { value: 'personal', label: 'Personal' },
  { value: 'work', label: 'Work' },
  { value: 'health', label: 'Health' },
]

const DURATIONS = [
  { value: '15', label: '15 min' },
  { value: '30', label: '30 min' },
  { value: '60', label: '1 hour' },
  { value: '90', label: '1.5 hours' },
  { value: '120', label: '2 hours' },
  { value: '180', label: '3 hours' },
  { value: '240', label: '4 hours' },
]

// Every half hour, not reui's 7:00–19:00 — a life calendar has a 22:00 in it.
const START_TIMES = Array.from({ length: 48 }, (_, i) => {
  const minutes = i * 30
  const label = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
  return { value: String(minutes), label }
})

const REMINDERS = [
  { value: 10, label: '10m' },
  { value: 30, label: '30m' },
  { value: 60, label: '1h' },
  { value: 1440, label: '1d' },
]

type PersonOption = { id: string; name: string; email: string | null }

export function LifeEventDialog({
  event,
  open,
  onSave,
  onDelete,
  onCancel,
}: {
  /** null means "create new" */
  event: CalEvent | null
  open: boolean
  onSave: (event: CalEvent) => void
  onDelete: (id: string) => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [draft, setDraft] = useState<CalEvent | null>(event)
  const [people, setPeople] = useState<PersonOption[]>([])
  const [peopleError, setPeopleError] = useState<string | null>(null)

  useEffect(() => setDraft(event), [event])

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setPeopleError(null)
    fetch('/api/life/people')
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load people.')
        return response.json() as Promise<{ people?: PersonOption[] }>
      })
      .then((payload) => {
        if (!cancelled) setPeople((payload.people || []).filter((person) => !!person.email))
      })
      .catch((cause: unknown) => {
        if (!cancelled) setPeopleError(cause instanceof Error ? cause.message : 'Could not load people.')
      })
    return () => { cancelled = true }
  }, [open])

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    const onClose = () => onCancel()
    dialog.addEventListener('close', onClose)
    return () => dialog.removeEventListener('close', onClose)
  }, [onCancel])

  if (!draft) return <dialog className="life-confirm life-event-dialog" ref={ref} />

  const allDay = draft.start === null
  const duration = allDay ? 60 : (draft.end ?? draft.start! + 60) - draft.start!
  const isNew = !draft.id

  const patch = (next: Partial<CalEvent>) => setDraft({ ...draft, ...next })
  const attendeeEmails = draft.attendeeEmails || []
  const reminderMinutes = draft.reminderMinutes || []
  const toggleEmail = (email: string) => patch({
    attendeeEmails: attendeeEmails.includes(email)
      ? attendeeEmails.filter((value) => value !== email)
      : [...attendeeEmails, email],
  })
  const toggleReminder = (minutes: number) => patch({
    reminderMinutes: reminderMinutes.includes(minutes)
      ? reminderMinutes.filter((value) => value !== minutes)
      : [...reminderMinutes, minutes],
  })

  return (
    <dialog
      className="life-confirm life-event-dialog"
      ref={ref}
      onClick={(e) => {
        if (e.target === ref.current) onCancel()
      }}
    >
      <form
        className="life-confirm-inner"
        onSubmit={(e) => {
          e.preventDefault()
          if (!draft.title.trim()) return
          onSave({ ...draft, id: draft.id || `e${Date.now()}` })
        }}
      >
        <h2 className="life-confirm-title">{isNew ? 'New event' : 'Edit event'}</h2>

        <div className="life-event-dialog-grid">
          <div className="life-event-dialog-column">
            <div className="life-event-field">
              <label className="life-event-label" htmlFor={titleId}>
                Title
              </label>
              <input
                id={titleId}
                className="text-input"
                value={draft.title}
                autoFocus
                onChange={(e) => patch({ title: e.target.value })}
                placeholder="What is it?"
              />
            </div>

            <div className="life-event-field">
              <span className="life-event-label">Calendar</span>
              <div className="life-event-swatches">
                {CALENDARS.map((cal) => (
                  <button
                    key={cal.value}
                    type="button"
                    className={`life-event-swatch cal-${cal.value}${
                      (draft.calendar || 'personal') === cal.value ? ' is-active' : ''
                    }`}
                    onClick={() => patch({ calendar: cal.value })}
                    aria-pressed={(draft.calendar || 'personal') === cal.value}
                  >
                    <span className="life-event-swatch-dot" aria-hidden="true" />
                    {cal.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="life-event-field is-row">
              <span className="life-event-label">All day</span>
              <button
                type="button"
                className={`life-week-toggle${allDay ? ' is-active' : ''}`}
                role="switch"
                aria-checked={allDay}
                aria-label="All day"
                onClick={() =>
                  patch(allDay ? { start: 540, end: 600 } : { start: null, end: null })
                }
              >
                <span className="life-week-toggle-thumb" />
              </button>
            </div>

            {!allDay ? (
              <div className="life-event-field is-row">
                <span className="life-event-label">Time</span>
                <div className="life-event-time-row">
                  <LifeMenu
                    ariaLabel="Start time"
                    value={String(draft.start)}
                    options={START_TIMES}
                    onChange={(value) =>
                      patch({ start: Number(value), end: Number(value) + duration })
                    }
                  />
                  <LifeMenu
                    ariaLabel="Duration"
                    value={String(duration)}
                    options={DURATIONS}
                    onChange={(value) => patch({ end: draft.start! + Number(value) })}
                  />
                </div>
              </div>
            ) : null}

            <label className="life-event-field">
              <span className="life-event-label">Location</span>
              <input className="text-input" value={draft.location || ''} onChange={(e) => patch({ location: e.target.value })} placeholder="Where is it?" />
            </label>
          </div>

          <div className="life-event-dialog-column">
            <label className="life-event-field">
              <span className="life-event-label">Notes</span>
              <textarea className="text-input life-event-notes" value={draft.notes || ''} onChange={(e) => patch({ notes: e.target.value })} placeholder="Anything to remember?" />
            </label>

            <div className="life-event-field">
              <span className="life-event-label">People</span>
              {people.length ? (
                <div className="life-event-people">
                  {people.map((person) => (
                    <button key={person.id} type="button" className={`life-event-chip${attendeeEmails.includes(person.email as string) ? ' is-active' : ''}`} onClick={() => toggleEmail(person.email as string)} aria-pressed={attendeeEmails.includes(person.email as string)}>
                      {person.name}
                    </button>
                  ))}
                </div>
              ) : null}
              <input className="text-input" value={attendeeEmails.join(', ')} onChange={(e) => patch({ attendeeEmails: e.target.value.split(',').map((email) => email.trim()).filter(Boolean) })} placeholder="Add email addresses, comma separated" aria-label="Attendee email addresses" />
              {peopleError ? <p className="life-event-help" role="status">{peopleError}</p> : null}
            </div>

            <div className="life-event-field">
              <span className="life-event-label">Reminders</span>
              <div className="life-event-reminders">
                {REMINDERS.map((reminder) => <button key={reminder.value} type="button" className={`life-event-chip${reminderMinutes.includes(reminder.value) ? ' is-active' : ''}`} onClick={() => toggleReminder(reminder.value)} aria-pressed={reminderMinutes.includes(reminder.value)}>{reminder.label}</button>)}
              </div>
            </div>
          </div>
        </div>

        <div className="life-confirm-actions">
          {!isNew ? (
            <button
              type="button"
              className="life-btn is-danger life-event-delete"
              onClick={() => onDelete(draft.id)}
            >
              Delete
            </button>
          ) : null}
          <button type="button" className="life-btn ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="life-btn primary" disabled={!draft.title.trim()}>
            {isNew ? 'Add event' : 'Save changes'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
