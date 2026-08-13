"use client";

import { useDeferredValue, useEffect, useRef, useState } from "react";

import { useViewportMode } from '@/hooks/useViewportMode'
import { useLifeProjects } from '@/components/life/LifeProjectsProvider'
import { getEntryPresentation } from '@/lib/life/entries'
import { fetchJson } from '@/lib/life/client'
import { getLocalTimeLabel, localDateTimeToUtc } from '@/lib/life/time'
import type { DayHistory, EntryRecord, ReportRecord } from '@/lib/life/types'

interface HistoryPayload {
  timezone: string;
  selectedDate: string;
  days: DayHistory[];
  detail: {
    entries: EntryRecord[];
    reports: ReportRecord[];
  };
}

interface HistoryClientProps {
  initialPayload?: HistoryPayload
  initialQuery?: string
}

function phoneDayLabel(localDate: string, timeZone: string) {
  const date = localDateTimeToUtc(localDate, timeZone, 12, 0)
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(date)
}

function desktopDayLabel(localDate: string, timeZone: string) {
  const date = localDateTimeToUtc(localDate, timeZone, 12, 0)
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: 'numeric',
    month: 'short',
  }).format(date)
}

export function HistoryClient({
  initialPayload,
  initialQuery = '',
}: HistoryClientProps = {}) {
  const viewport = useViewportMode()
  const { projects } = useLifeProjects()
  const [query, setQuery] = useState(initialQuery);
  const deferredQuery = useDeferredValue(query);
  const [selectedDate, setSelectedDate] = useState(initialPayload?.selectedDate || "");
  const [timezone, setTimezone] = useState(initialPayload?.timezone || "UTC");
  const [days, setDays] = useState<DayHistory[]>(initialPayload?.days || []);
  const [entries, setEntries] = useState<EntryRecord[]>(initialPayload?.detail.entries || []);
  const [loading, setLoading] = useState(!initialPayload);
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editProject, setEditProject] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const skippedInitialFetch = useRef(false)

  useEffect(() => {
    if (
      !skippedInitialFetch.current &&
      initialPayload &&
      deferredQuery.trim() === initialQuery.trim() &&
      selectedDate === initialPayload.selectedDate
    ) {
      skippedInitialFetch.current = true
      return
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (deferredQuery.trim()) params.set("q", deferredQuery.trim());
        if (selectedDate) params.set("date", selectedDate);

        const payload = await fetchJson<HistoryPayload>(`/api/life/history?${params.toString()}`);
        if (cancelled) return;

        setTimezone(payload.timezone);
        setDays(payload.days);
        setEntries(payload.detail.entries);
        if (!selectedDate && payload.days[0]) {
          setSelectedDate(payload.days[0].localDate);
        } else if (selectedDate && payload.selectedDate !== selectedDate) {
          setSelectedDate(payload.selectedDate);
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Failed to load entries.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [deferredQuery, initialPayload, initialQuery, selectedDate]);

  async function deleteEntry(entry: EntryRecord) {
    if (deletingEntryId) return

    const confirmed = window.confirm('Delete this entry? This cannot be undone.')
    if (!confirmed) return

    setDeleteError(null)
    setDeletingEntryId(entry.id)

    try {
      await fetchJson<{ ok: true }>(`/api/life/entries/${entry.id}`, {
        method: 'DELETE',
      })

      const nextEntries = entries.filter((candidate) => candidate.id !== entry.id)
      const nextDays = days.flatMap((day) => {
        if (day.localDate !== entry.local_date) return [day]
        if (day.entryCount <= 1) return []
        return [{ ...day, entryCount: day.entryCount - 1 }]
      })

      setEntries(nextEntries)
      setDays(nextDays)

      if (selectedDate && !nextDays.some((day) => day.localDate === selectedDate)) {
        setSelectedDate(nextDays[0]?.localDate || '')
      }
    } catch (deleteRequestError) {
      setDeleteError(
        deleteRequestError instanceof Error ? deleteRequestError.message : 'Failed to delete entry.',
      )
    } finally {
      setDeletingEntryId(null)
    }
  }

  function startEdit(entry: EntryRecord) {
    setEditingEntryId(entry.id)
    setEditContent(entry.content)
    setEditProject(entry.project_slug || '')
    setEditError(null)
  }

  function cancelEdit() {
    setEditingEntryId(null)
    setEditError(null)
  }

  async function saveEdit(entry: EntryRecord) {
    const content = editContent.trim()
    if (!content) {
      setEditError('Content is required.')
      return
    }

    setSavingEdit(true)
    setEditError(null)

    try {
      const { entry: updated } = await fetchJson<{ entry: EntryRecord }>(`/api/life/entries/${entry.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ content, projectSlug: editProject || null }),
      })

      setEntries((current) => current.map((candidate) => (candidate.id === entry.id ? updated : candidate)))
      setEditingEntryId(null)
    } catch (saveRequestError) {
      setEditError(saveRequestError instanceof Error ? saveRequestError.message : 'Failed to save entry.')
    } finally {
      setSavingEdit(false)
    }
  }

  function renderEntryEditor(entry: EntryRecord) {
    return (
      <div className="life-entry-edit">
        <textarea
          className="text-input life-entry-edit-text"
          value={editContent}
          autoFocus
          rows={3}
          onChange={(event) => setEditContent(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              cancelEdit()
            }
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              void saveEdit(entry)
            }
          }}
        />
        <div className="life-entry-edit-row">
          <select
            className="text-input"
            value={editProject}
            onChange={(event) => setEditProject(event.target.value)}
            aria-label="Project"
          >
            <option value="">Unassigned</option>
            {projects.map((project) => (
              <option key={project.slug} value={project.slug}>
                {project.name}
              </option>
            ))}
          </select>
        </div>
        {editError ? <span className="error-text">{editError}</span> : null}
        <div className="life-entry-edit-actions">
          <button type="button" className="primary-button" onClick={() => void saveEdit(entry)} disabled={savingEdit}>
            {savingEdit ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="secondary-button" onClick={cancelEdit} disabled={savingEdit}>
            Cancel
          </button>
        </div>
      </div>
    )
  }

  function renderEditButton(entry: EntryRecord, variant: 'default' | 'mobile' = 'default') {
    return (
      <button
        type="button"
        className={`life-entry-edit-btn${variant === 'mobile' ? ' life-entry-edit-btn-mobile' : ''}`}
        onClick={() => startEdit(entry)}
        disabled={Boolean(deletingEntryId)}
        aria-label={`Edit entry from ${getLocalTimeLabel(entry.created_at, timezone)}`}
      >
        Edit
      </button>
    )
  }

  function renderDeleteButton(entry: EntryRecord, variant: 'default' | 'mobile' = 'default') {
    const isDeleting = deletingEntryId === entry.id

    return (
      <button
        type="button"
        className={`life-entry-delete${variant === 'mobile' ? ' life-entry-delete-mobile' : ''}${isDeleting ? ' is-loading' : ''}`}
        onClick={() => { void deleteEntry(entry) }}
        disabled={Boolean(deletingEntryId)}
        aria-label={`Delete entry from ${getLocalTimeLabel(entry.created_at, timezone)}`}
      >
        {isDeleting ? 'Deleting…' : 'Delete'}
      </button>
    )
  }

  if (viewport === 'phone') {
    return (
      <div>
        <div style={{ padding: '18px 16px 0' }}>
          <div className="life-page-head">
            <div>
              <p className="eyebrow">Entries</p>
              <h1>Everything you captured</h1>
            </div>
          </div>
        </div>

        {error ? <p className="error-text" style={{ padding: '0 16px' }}>{error}</p> : null}
        {deleteError ? <p className="error-text" style={{ padding: '0 16px' }}>{deleteError}</p> : null}

        <div style={{ display: 'grid', gap: 6, padding: '0 16px 12px' }}>
          {days.map((day) => (
            <button
              key={day.localDate}
              type="button"
              className={`life-reports-row${selectedDate === day.localDate ? ' is-selected' : ''}`}
              onClick={() => setSelectedDate(day.localDate)}
            >
              <span className="life-reports-row-date">{phoneDayLabel(day.localDate, timezone)}</span>
              <span className="life-reports-row-type">{day.entryCount} {day.entryCount === 1 ? 'entry' : 'entries'}</span>
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gap: 0, padding: '0 16px 32px' }}>
          {loading && entries.length === 0 ? (
            <p className="muted-text">Loading…</p>
          ) : null}

          {!loading && selectedDate && entries.length === 0 ? (
            <p className="muted-text">No entries for this day.</p>
          ) : null}

          {entries.map((entry) => {
            const presentation = getEntryPresentation(entry)
            return (
              <article
                key={entry.id}
                className="life-history-entry"
              >
                <div className="life-history-entry-head">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--life-label)' }}>
                      {getLocalTimeLabel(entry.created_at, timezone)}
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 10,
                        letterSpacing: '.1em',
                        textTransform: 'uppercase',
                        color: presentation.color,
                      }}
                    >
                      {presentation.kind}
                    </span>
                    {entry.project_slug ? <span className="life-tag">{entry.project_slug}</span> : null}
                  </div>
                </div>
                {editingEntryId === entry.id ? (
                  renderEntryEditor(entry)
                ) : (
                  <>
                    <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--life-muted)' }}>
                      {entry.content}
                    </p>
                    <div className="life-history-entry-actions">
                      {renderEditButton(entry, 'mobile')}
                      {renderDeleteButton(entry, 'mobile')}
                    </div>
                  </>
                )}
              </article>
            )
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="life-history-shell">
      <div className="life-page-head">
        <div>
          <p className="eyebrow">Entries</p>
          <h1>Everything you captured</h1>
        </div>
        <div className="life-page-stat">{days.length}</div>
      </div>

      {error ? <p className="error-text">{error}</p> : null}
      {deleteError ? <p className="error-text">{deleteError}</p> : null}

      <div className="life-history-grid">
        <aside className="life-card life-history-sidebar">
          <div className="life-card-head">
            <h2>Entries</h2>
            <span className="count-pill">{days.length}</span>
          </div>

          <div className="life-history-search">
            <label className="field">
              <span>Search</span>
              <input
                className="text-input"
                type="search"
                value={query}
                placeholder="Search entries"
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          </div>

          {loading && days.length === 0 ? (
            <div className="life-history-loading">
              <p className="muted-text">Loading…</p>
            </div>
          ) : null}

          <div className="life-history-days">
            {days.map((day) => (
              <button
                key={day.localDate}
                type="button"
                className={`life-history-day${selectedDate === day.localDate ? ' is-selected' : ''}`}
                onClick={() => setSelectedDate(day.localDate)}
              >
                <strong>{desktopDayLabel(day.localDate, timezone)}</strong>
                <span className="muted-text">
                  {day.entryCount} {day.entryCount === 1 ? 'entry' : 'entries'}
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="life-card life-history-detail">
          <div className="life-card-head">
            <div>
              <p className="eyebrow">Selected day</p>
              <h2>{selectedDate ? desktopDayLabel(selectedDate, timezone) : 'No date selected'}</h2>
            </div>
          </div>

          <div className="life-history-detail-body">
            <div className="life-history-list">
              {loading && entries.length === 0 ? (
                <p className="muted-text">Loading…</p>
              ) : null}

              {!loading && selectedDate && entries.length === 0 ? (
                <p className="muted-text">No entries for this day.</p>
              ) : null}

              {entries.map((entry) => {
                const presentation = getEntryPresentation(entry)
                return (
                  <article key={entry.id} className="life-history-entry">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 1 }}>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 12,
                          color: 'var(--life-muted)',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {getLocalTimeLabel(entry.created_at, timezone)}
                      </span>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 9,
                          letterSpacing: '.1em',
                          textTransform: 'uppercase',
                          color: presentation.color,
                        }}
                      >
                        {presentation.kind}
                      </span>
                    </div>
                    <div style={{ minWidth: 0, display: 'grid', gap: 8 }}>
                      <div className="life-history-entry-head">
                        <div>
                          {entry.project_slug ? <span className="life-tag">{entry.project_slug}</span> : null}
                        </div>
                        {editingEntryId === entry.id ? null : (
                          <div className="life-history-entry-head-actions">
                            {renderEditButton(entry)}
                            {renderDeleteButton(entry)}
                          </div>
                        )}
                      </div>
                      {editingEntryId === entry.id ? (
                        renderEntryEditor(entry)
                      ) : (
                        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: '#e6e3dd' }}>{entry.content}</p>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
