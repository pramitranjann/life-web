'use client'

// One anchored overlay. Life currently has three ad-hoc implementations:
// TaskForm's calendar portal (positioned from a stored DOMRect),
// ProjectWorkspace's property menus, and WeekClient's composer.
// ponytail: portal + rect math, ~70 lines. Radix would be a dep for this alone.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export function LifePopover({
  open,
  anchor,
  onClose,
  align = 'start',
  children,
}: {
  open: boolean
  /** The trigger element to position against. */
  anchor: HTMLElement | null
  onClose: () => void
  align?: 'start' | 'end'
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const [host, setHost] = useState<HTMLElement | null>(null)
  const [visible, setVisible] = useState(false)

  // Every --life-* variable is defined ON .life-shell, not :root, and every
  // rule is scoped under it. Portalling to document.body drops both, so the
  // panel renders with no border, no background and unstyled children.
  // .life-shell has no transform, so position: fixed still resolves against
  // the viewport from in here.
  useEffect(() => {
    setHost(document.querySelector<HTMLElement>('.life-shell') ?? document.body)
  }, [])

  // Measure after paint so the panel's own size is known — needed to flip it
  // above the trigger, or pull it left, when it would leave the viewport.
  useLayoutEffect(() => {
    if (!open || !anchor || !ref.current) return

    const place = () => {
      const trigger = anchor.getBoundingClientRect()
      const panel = ref.current!.getBoundingClientRect()
      const margin = 8

      let top = trigger.bottom + 4
      if (top + panel.height > window.innerHeight - margin) {
        const above = trigger.top - panel.height - 4
        if (above > margin) top = above
        else top = Math.max(margin, window.innerHeight - panel.height - margin)
      }

      let left = align === 'end' ? trigger.right - panel.width : trigger.left
      left = Math.min(left, window.innerWidth - panel.width - margin)
      left = Math.max(margin, left)

      setPos({ top, left })
    }

    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, anchor, align])

  // Outlives `open` by the length of the exit transition. React would remove
  // the node the instant `open` flipped, so there was nothing left on screen
  // to animate — the panel appeared and vanished with no motion either way.
  // Must stay AHEAD of the 0.15s exit in globals.css: unmounting early cuts
  // the animation off mid-flight and the panel disappears anyway.
  const EXIT_MS = 170
  useEffect(() => {
    if (open) {
      setVisible(true)
      return
    }
    const id = window.setTimeout(() => setVisible(false), EXIT_MS)
    return () => window.clearTimeout(id)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (ref.current?.contains(target) || anchor?.contains(target)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, anchor, onClose])

  if (!host || (!open && !visible)) return null

  return createPortal(
    <div
      ref={ref}
      className="life-popover"
      role="dialog"
      // The exit state is a data attribute rather than an unmount, so CSS has
      // something to transition. `pos` is deliberately not cleared on close —
      // the panel holds its last position while it fades instead of jumping.
      data-open={open ? 'true' : 'false'}
      // Hidden until measured, so it never paints at 0,0 first.
      style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? 'visible' : 'hidden' }}
    >
      {children}
    </div>,
    host,
  )
}
