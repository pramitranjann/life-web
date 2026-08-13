'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

import type { LifeSearchResults } from '@/lib/life/types'

export function LifeInlineSearch({
  isOpen,
  onOpen,
  onClose,
}: {
  isOpen: boolean
  onOpen: () => void
  onClose: () => void
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const requestRef = useRef<AbortController | null>(null)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<LifeSearchResults | null>(null)

  useEffect(() => {
    if (!isOpen) {
      requestRef.current?.abort()
      requestRef.current = null
      setLoading(false)
      setError(null)
      setQuery('')
      setResults(null)
      return
    }

    const timer = window.setTimeout(() => inputRef.current?.focus(), 10)
    return () => window.clearTimeout(timer)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onClose])

  useEffect(() => {
    if (!isOpen) return

    const trimmed = query.trim()
    requestRef.current?.abort()
    requestRef.current = null

    if (trimmed.length < 2) {
      setLoading(false)
      setError(null)
      setResults(null)
      return
    }

    const controller = new AbortController()
    requestRef.current = controller

    setLoading(true)
    setError(null)

    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/life/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
          credentials: 'same-origin',
        })
        const payload = (await response.json()) as LifeSearchResults & { error?: string }

        if (!response.ok) {
          throw new Error(payload.error || 'Search failed.')
        }

        setResults(payload)
      } catch (fetchError) {
        if (controller.signal.aborted) return
        setResults(null)
        setError(fetchError instanceof Error ? fetchError.message : 'Search failed.')
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }, 180)

    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [isOpen, query])

  const totalResults = results?.totalResults || 0
  const hasQuery = query.trim().length > 0

  if (!isOpen) {
    return (
      <button
        className="life-add-btn life-header-phone-search life-inline-search-toggle"
        type="button"
        aria-label="Search life"
        aria-expanded={false}
        onClick={onOpen}
      >
        ⌕
      </button>
    )
  }

  return (
    <div className="life-inline-search-control is-open">
      <section className="life-inline-search" aria-label="Inline life search">
        <form className="life-inline-search-form" onSubmit={(event) => event.preventDefault()}>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search projects, people, tasks…"
            className="text-input"
            aria-label="Search life"
          />
        </form>
        <button
          type="button"
          className="life-add-btn life-inline-search-dismiss"
          aria-label="Close search"
          onClick={onClose}
        >
          ×
        </button>
      </section>

      {hasQuery || loading || error ? (
        <div className="life-inline-search-results">
          {loading ? (
            <p className="muted-text">Searching…</p>
          ) : error ? (
            <p className="error-text">{error}</p>
          ) : totalResults === 0 ? (
            <div className="life-empty">No matches for “{query.trim()}”.</div>
          ) : (
            <>
              <div className="life-inline-search-meta">
                <span className="eyebrow">Search</span>
                <span className="life-page-stat">{totalResults} results</span>
              </div>

              {results?.projects.length ? (
                <section className="life-card">
                  <div className="life-card-head">
                    <h2>Projects</h2>
                    <span className="count-pill">{results.projects.length}</span>
                  </div>
                  <ul className="life-rows">
                    {results.projects.map((project) => (
                      <li className="life-row" key={project.id} style={{ gridTemplateColumns: '1fr' }}>
                        <Link href={project.href} className="life-row-body" onClick={onClose}>
                          <span className="life-row-title">{project.name}</span>
                          {project.summary ? <span className="life-row-meta">{project.summary}</span> : null}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {results?.people.length ? (
                <section className="life-card">
                  <div className="life-card-head">
                    <h2>People</h2>
                    <span className="count-pill">{results.people.length}</span>
                  </div>
                  <ul className="life-rows">
                    {results.people.map((person) => (
                      <li className="life-row" key={person.id} style={{ gridTemplateColumns: '1fr' }}>
                        <Link href={person.href} className="life-row-body" onClick={onClose}>
                          <span className="life-row-title">{person.name}</span>
                          {person.role || person.relationship || person.email ? (
                            <span className="life-row-meta">
                              {[person.role, person.relationship, person.email].filter(Boolean).join(' · ')}
                            </span>
                          ) : null}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {results?.tasks.length ? (
                <section className="life-card">
                  <div className="life-card-head">
                    <h2>Tasks</h2>
                    <span className="count-pill">{results.tasks.length}</span>
                  </div>
                  <ul className="life-rows">
                    {results.tasks.map((task) => (
                      <li className="life-row" key={task.id} style={{ gridTemplateColumns: '1fr auto' }}>
                        <Link href={task.href} className="life-row-body" onClick={onClose}>
                          <span className={`life-row-title${task.status === 'done' ? ' is-done' : ''}`}>
                            {task.title}
                          </span>
                          <span className="life-row-meta">
                            {!task.isHome ? <span className={`pri-dot pri-${task.priority}`} /> : null}
                            {task.projectLabel}
                          </span>
                        </Link>
                        {task.dueLabel ? <span className="life-row-aside">{task.dueLabel}</span> : <span />}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {results?.entries.length ? (
                <section className="life-card">
                  <div className="life-card-head">
                    <h2>Entries</h2>
                    <span className="count-pill">{results.entries.length}</span>
                  </div>
                  <ul className="life-rows">
                    {results.entries.map((entry) => (
                      <li className="life-row life-entry-row" key={entry.id} style={{ gridTemplateColumns: '1fr auto' }}>
                        <Link href={entry.href} className="life-row-body" onClick={onClose}>
                          <span className="life-entry-text">{entry.content}</span>
                          <span className="life-row-meta">
                            <span className="life-entry-kind" style={{ color: entry.kindColor }}>
                              {entry.kind}
                            </span>
                            <span>{entry.dayLabel}</span>
                            {entry.projectLabel ? <span className="life-tag">{entry.projectLabel}</span> : null}
                          </span>
                        </Link>
                        <span className="life-row-aside">{entry.timeLabel}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {results?.events.length ? (
                <section className="life-card">
                  <div className="life-card-head">
                    <h2>Events</h2>
                    <span className="count-pill">{results.events.length}</span>
                  </div>
                  <ul className="life-rows">
                    {results.events.map((event) => (
                      <li className="life-row" key={event.id} style={{ gridTemplateColumns: 'auto 1fr auto' }}>
                        <span className="time-chip">{event.timeLabel}</span>
                        <Link href={event.href} className="life-row-title" onClick={onClose}>
                          {event.title}
                        </Link>
                        <span className="life-row-aside">{event.dayLabel}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}
