'use client'

// reui's Hover Card in Life's tokens. Used to connect workspace events to the
// calendar: hover a timeline row to preview it, then edit or jump to it.
// ponytail: reuses LifePopover for positioning and the shell portal rather
// than re-deriving anchor maths.

import { useRef, useState } from 'react'

import { LifePopover } from './LifePopover'

const OPEN_DELAY = 220
const CLOSE_DELAY = 140

export function LifeHoverCard({
  children,
  card,
  className = '',
  style,
}: {
  children: React.ReactNode
  card: React.ReactNode
  /**
   * Positioning belongs HERE, not on the child. This wrapper is the element
   * the card measures against, so an absolutely-positioned child leaves the
   * anchor box behind as a zero-height strip at its container's edge — and
   * the card opens there instead of on the thing you hovered.
   */
  className?: string
  style?: React.CSSProperties
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [open, setOpen] = useState(false)
  const timer = useRef<number | null>(null)

  const clear = () => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = null
  }

  // Delayed both ways: opening instantly makes a list feel twitchy, and closing
  // instantly makes the card impossible to move the pointer into.
  const show = () => {
    clear()
    timer.current = window.setTimeout(() => setOpen(true), OPEN_DELAY)
  }
  const hide = () => {
    clear()
    timer.current = window.setTimeout(() => setOpen(false), CLOSE_DELAY)
  }

  return (
    <>
      <div
        ref={setAnchor}
        className={`life-hovercard-trigger ${className}`.trim()}
        style={style}
        onPointerEnter={show}
        onPointerLeave={hide}
        onFocusCapture={show}
        onBlurCapture={hide}
      >
        {children}
      </div>
      <LifePopover open={open} anchor={anchor} onClose={() => setOpen(false)}>
        <div onPointerEnter={clear} onPointerLeave={hide}>
          {card}
        </div>
      </LifePopover>
    </>
  )
}

export function LifeEventCard({
  title,
  date,
  time,
  kind,
  onEdit,
  onOpenCalendar,
}: {
  title: string
  date: string
  time: string
  kind: string
  onEdit: () => void
  onOpenCalendar: () => void
}) {
  return (
    <div className="life-eventcard">
      <div className="life-eventcard-head">
        <span className={`life-ev-dot kind-${kind}`} aria-hidden="true" />
        <span className="life-eventcard-when">
          {date} · {time}
        </span>
      </div>
      <p className="life-eventcard-title">{title}</p>
      <p className="life-eventcard-kind">{kind}</p>
      <div className="life-eventcard-actions">
        <button type="button" className="life-eventcard-btn" onClick={onEdit}>
          Edit
        </button>
        <button type="button" className="life-eventcard-btn is-primary" onClick={onOpenCalendar}>
          Open in calendar ↗
        </button>
      </div>
    </div>
  )
}
