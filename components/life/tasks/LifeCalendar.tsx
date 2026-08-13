'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

function toYMD(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function todayYMD() {
  const now = new Date()
  return toYMD(now.getFullYear(), now.getMonth(), now.getDate())
}

/**
 * A dark, mono, life-styled calendar popover. Rendered in a portal so it floats
 * above the fixed-height (no-scroll) board columns without being clipped.
 */
export function LifeCalendar({
  value,
  onChange,
  onClose,
  anchorRect,
}: {
  value: string | null
  onChange: (value: string | null) => void
  onClose: () => void
  anchorRect: DOMRect | null
}) {
  const parsed = value ? value.split('-').map(Number) : null
  const [view, setView] = useState(() =>
    parsed ? { y: parsed[0], m: parsed[1] - 1 } : { y: new Date().getFullYear(), m: new Date().getMonth() },
  )
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const cells = useMemo(() => {
    const first = new Date(view.y, view.m, 1)
    const startDow = (first.getDay() + 6) % 7
    const daysInMonth = new Date(view.y, view.m + 1, 0).getDate()
    const prevDays = new Date(view.y, view.m, 0).getDate()
    const arr: Array<{ d: number; out: boolean; ymd?: string }> = []
    for (let i = 0; i < startDow; i += 1) arr.push({ d: prevDays - startDow + 1 + i, out: true })
    for (let d = 1; d <= daysInMonth; d += 1) arr.push({ d, out: false, ymd: toYMD(view.y, view.m, d) })
    while (arr.length < 42) arr.push({ d: arr.length - (startDow + daysInMonth) + 1, out: true })
    return arr
  }, [view])

  if (!mounted || !anchorRect) return null

  const width = 248
  const height = 322
  let left = anchorRect.left
  if (left + width > window.innerWidth) left = window.innerWidth - width - 8
  if (left < 8) left = 8
  let top = anchorRect.bottom + 6
  if (top + height > window.innerHeight) top = Math.max(8, anchorRect.top - height - 2)

  const today = todayYMD()
  const monthLabel = new Date(view.y, view.m, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })

  return createPortal(
    <>
      <div className="life-cal-backdrop" onClick={onClose} />
      <div className="life-cal" style={{ left, top }} onClick={(event) => event.stopPropagation()}>
        <div className="life-cal-head">
          <span className="life-cal-mon">{monthLabel}</span>
          <div className="life-cal-nav">
            <button type="button" aria-label="Previous month" onClick={() => setView((v) => (v.m - 1 < 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 }))}>‹</button>
            <button type="button" aria-label="This month" onClick={() => setView({ y: new Date().getFullYear(), m: new Date().getMonth() })}>•</button>
            <button type="button" aria-label="Next month" onClick={() => setView((v) => (v.m + 1 > 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }))}>›</button>
          </div>
        </div>
        <div className="life-cal-grid">
          {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => (
            <span key={d} className="life-cal-dow">{d}</span>
          ))}
          {cells.map((cell, index) =>
            cell.out ? (
              <span key={index} className="life-cal-day out">{cell.d}</span>
            ) : (
              <button
                key={index}
                type="button"
                className={`life-cal-day${cell.ymd === today ? ' today' : ''}${cell.ymd === value ? ' sel' : ''}`}
                onClick={() => {
                  onChange(cell.ymd as string)
                  onClose()
                }}
              >
                {cell.d}
              </button>
            ),
          )}
        </div>
        <div className="life-cal-foot">
          <button type="button" onClick={() => { onChange(null); onClose() }}>Clear</button>
          <button type="button" onClick={onClose}>Close</button>
        </div>
      </div>
    </>,
    document.body,
  )
}
