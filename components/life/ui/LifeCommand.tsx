'use client'

// ⌘K palette. Static navigation stays available beside live Life search
// results, while the core categories drill into their result set first.

import { useEffect, useMemo, useRef, useState } from 'react'

import type { LifeSearchResults } from '@/lib/life/types'

type CommandCategory = 'projects' | 'people' | 'tasks'

export interface CommandItem {
  id: string
  label: string
  group: string
  /** Right-aligned hint, e.g. a project name or a date */
  meta?: string
  /** Keeps the palette open and searches this category. */
  drillCategory?: CommandCategory
  onRun: () => void
}

function groupItems(items: CommandItem[]) {
  const groups: { group: string; items: CommandItem[] }[] = []
  for (const item of items) {
    const bucket = groups.find((group) => group.group === item.group)
    if (bucket) bucket.items.push(item)
    else groups.push({ group: item.group, items: [item] })
  }
  return groups
}

export function LifeCommand({
  items,
  onNavigate,
}: {
  items: CommandItem[]
  onNavigate?: (href: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [searchResults, setSearchResults] = useState<LifeSearchResults | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLDialogElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const requestRef = useRef<AbortController | null>(null)

  const navigationItems = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return normalized ? items.filter((item) => item.label.toLowerCase().includes(normalized)) : items
  }, [items, query])

  const resultItems = useMemo(() => {
    if (!searchResults) return []
    const navigate = (href: string) => () => {
      if (onNavigate) onNavigate(href)
      else window.location.assign(href)
    }
    return [
      ...searchResults.projects.map((project) => ({
        id: `search-project-${project.id}`,
        group: 'Projects',
        label: project.name,
        meta: project.summary || undefined,
        onRun: navigate(project.href),
      })),
      ...searchResults.people.map((person) => ({
        id: `search-person-${person.id}`,
        group: 'People',
        label: person.name,
        meta: [person.role, person.relationship, person.email].filter(Boolean).join(' · ') || undefined,
        onRun: navigate(person.href),
      })),
      ...searchResults.tasks.map((task) => ({
        id: `search-task-${task.id}`,
        group: 'Tasks',
        label: task.title,
        meta: [task.projectLabel, task.dueLabel].filter(Boolean).join(' · ') || undefined,
        onRun: navigate(task.href),
      })),
      ...searchResults.entries.map((entry) => ({
        id: `search-entry-${entry.id}`,
        group: 'Entries',
        label: entry.content,
        meta: [entry.projectLabel, entry.dayLabel].filter(Boolean).join(' · ') || undefined,
        onRun: navigate(entry.href),
      })),
      ...searchResults.events.map((event) => ({
        id: `search-event-${event.id}`,
        group: 'Events',
        label: event.title,
        meta: [event.dayLabel, event.timeLabel].filter(Boolean).join(' · '),
        onRun: navigate(event.href),
      })),
    ] satisfies CommandItem[]
  }, [onNavigate, searchResults])

  const results = useMemo(() => groupItems([...navigationItems, ...resultItems]), [navigationItems, resultItems])
  const flat = useMemo(() => results.flatMap((group) => group.items), [results])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((value) => !value)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      setQuery('')
      setActive(0)
      inputRef.current?.focus()
    }
    if (!open && dialog.open) dialog.close()
  }, [open])

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    const onClose = () => setOpen(false)
    dialog.addEventListener('close', onClose)
    return () => dialog.removeEventListener('close', onClose)
  }, [])

  useEffect(() => {
    if (!open) {
      requestRef.current?.abort()
      requestRef.current = null
      setLoading(false)
      setError(null)
      setSearchResults(null)
      return
    }

    const trimmed = query.trim()
    requestRef.current?.abort()
    requestRef.current = null
    if (trimmed.length < 2) {
      setLoading(false)
      setError(null)
      setSearchResults(null)
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
        if (!response.ok) throw new Error(payload.error || 'Search failed.')
        setSearchResults(payload)
      } catch (searchError) {
        if (controller.signal.aborted) return
        setSearchResults(null)
        setError(searchError instanceof Error ? searchError.message : 'Search failed.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 180)

    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [open, query])

  useEffect(() => setActive(0), [query, searchResults])

  const run = (item?: CommandItem) => {
    if (!item) return
    if (item.drillCategory) {
      setQuery(item.drillCategory)
      inputRef.current?.focus()
      return
    }
    item.onRun()
    setOpen(false)
  }

  return (
    <>
      <button type="button" className="life-btn ghost life-command-trigger" onClick={() => setOpen(true)}>
        Search
        <kbd className="life-kbd">⌘K</kbd>
      </button>

      <dialog
        className="life-command"
        ref={ref}
        onClick={(event) => {
          if (event.target === ref.current) setOpen(false)
        }}
      >
        <div className="life-command-inner">
          <input
            ref={inputRef}
            className="life-command-input"
            type="text"
            value={query}
            placeholder="Search projects, people, tasks, entries…"
            aria-label="Search"
            aria-activedescendant={flat[active] ? `cmd-${flat[active].id}` : undefined}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setActive((index) => Math.min(index + 1, flat.length - 1))
              } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                setActive((index) => Math.max(index - 1, 0))
              } else if (event.key === 'Enter') {
                event.preventDefault()
                run(flat[active])
              }
            }}
          />

          <div className="life-command-results" role="listbox" aria-label="Results">
            {loading ? <p className="life-command-empty">Searching…</p> : null}
            {error ? <p className="life-command-empty">{error}</p> : null}
            {!loading && !error && flat.length === 0 ? (
              <p className="life-command-empty">No matches for “{query}”.</p>
            ) : (
              results.map((group) => (
                <div key={group.group} className="life-command-group">
                  <p className="eyebrow">{group.group}</p>
                  {group.items.map((item) => {
                    const index = flat.indexOf(item)
                    return (
                      <button
                        key={item.id}
                        id={`cmd-${item.id}`}
                        type="button"
                        role="option"
                        aria-selected={index === active}
                        className={`life-command-item${index === active ? ' is-active' : ''}`}
                        onMouseEnter={() => setActive(index)}
                        onClick={() => run(item)}
                        tabIndex={-1}
                      >
                        <span className="life-command-item-label">{item.label}</span>
                        {item.meta ? <span className="life-command-item-meta">{item.meta}</span> : null}
                      </button>
                    )
                  })}
                </div>
              ))
            )}
          </div>

          <div className="life-command-foot">
            <span>
              <kbd className="life-kbd">↑</kbd>
              <kbd className="life-kbd">↓</kbd> navigate
            </span>
            <span>
              <kbd className="life-kbd">⏎</kbd> open
            </span>
            <span>
              <kbd className="life-kbd">esc</kbd> close
            </span>
          </div>
        </div>
      </dialog>
    </>
  )
}
