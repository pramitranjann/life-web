'use client'

// Select replacement, built on the existing .life-pill / .life-pill-menu
// pattern from TaskForm so there is only ever one dropdown look in Life.
// Shared by PrintManagement, ProjectsOverview, PersonDetail, and HistoryClient.

import { useEffect, useId, useRef, useState } from 'react'

export interface LifeMenuOption {
  value: string
  label: string
  /** Optional colour swatch — matches .life-pill-menu .swatch */
  tone?: 'high' | 'med' | 'low' | string
  /** Right-aligned secondary text, e.g. a time or count */
  meta?: string
}

export function LifeMenu({
  value,
  options,
  onChange,
  placeholder = 'Select',
  ariaLabel,
  square = false,
}: {
  value: string
  options: LifeMenuOption[]
  onChange: (value: string) => void
  placeholder?: string
  ariaLabel: string
  /** Square swatches instead of dots, for project colours */
  square?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const listId = useId()

  const selected = options.find((o) => o.value === value)

  useEffect(() => {
    if (!open) return
    setActive(Math.max(0, options.findIndex((o) => o.value === value)))
    // Focus moves into the list so arrow keys work the way a native
    // <select> would; aria-activedescendant tracks the highlighted option.
    listRef.current?.focus()
  }, [open, options, value])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const commit = (index: number) => {
    const option = options[index]
    if (!option) return
    onChange(option.value)
    setOpen(false)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Escape':
        e.preventDefault()
        setOpen(false)
        break
      case 'ArrowDown':
        e.preventDefault()
        setActive((i) => Math.min(i + 1, options.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setActive((i) => Math.max(i - 1, 0))
        break
      case 'Home':
        e.preventDefault()
        setActive(0)
        break
      case 'End':
        e.preventDefault()
        setActive(options.length - 1)
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        commit(active)
        break
    }
  }

  return (
    <div className="life-pill-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`life-pill${selected ? ' set' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        {selected?.tone ? (
          <span className={`pdot ${selected.tone}`} aria-hidden="true" />
        ) : null}
        <span className="life-menu-value">{selected?.label || placeholder}</span>
        <span className="ic" aria-hidden="true">
          ▾
        </span>
      </button>

      {open ? (
        <ul
          className="life-pill-menu open"
          role="listbox"
          id={listId}
          ref={listRef}
          tabIndex={-1}
          aria-label={ariaLabel}
          aria-activedescendant={`${listId}-${active}`}
          onKeyDown={onKeyDown}
        >
          {options.map((option, i) => (
            <li key={option.value} role="none">
              <button
                type="button"
                id={`${listId}-${i}`}
                role="option"
                aria-selected={option.value === value}
                className={`life-pill-menu-item${i === active ? ' is-active' : ''}`}
                onClick={() => commit(i)}
                onMouseEnter={() => setActive(i)}
                tabIndex={-1}
              >
                {option.tone ? (
                  <span
                    className={`swatch${square ? ' sq' : ''} ${option.tone}`}
                    style={
                      option.tone.startsWith('#') ? { background: option.tone } : undefined
                    }
                    aria-hidden="true"
                  />
                ) : null}
                <span className="life-menu-item-label">{option.label}</span>
                {option.meta ? <span className="ev-time">{option.meta}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
