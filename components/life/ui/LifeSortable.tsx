'use client'

// Drag with motion. TasksClient and ProjectTasks both use raw HTML5 drag
// events today, so cards teleport to their new slot with no movement at all.
// ponytail: `motion` is already a dependency and StudioClient already uses
// layout springs for exactly this — no @dnd-kit, no new dep.
//
// One component covers both cases: a single list is a board with one column.

import { LayoutGroup, motion, useReducedMotion } from 'motion/react'
import { useRef, useState } from 'react'

export interface SortableCard {
  id: string
  title: string
  meta?: string
  tone?: 'high' | 'med' | 'low'
}

export interface SortableColumn {
  id: string
  title: string
  cards: SortableCard[]
}

// A flick carries momentum, so a little bounce is earned here — unlike a menu
// opening, which never gets any.
const SPRING = { type: 'spring', duration: 0.35, bounce: 0.18 } as const

export function LifeSortable({
  columns,
  onChange,
}: {
  columns: SortableColumn[]
  onChange: (next: SortableColumn[]) => void
}) {
  const [dragging, setDragging] = useState<string | null>(null)
  const [overColumn, setOverColumn] = useState<string | null>(null)
  const boardRef = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()

  /** Which column, and which slot inside it, is under this point. */
  const resolveDrop = (x: number, y: number) => {
    const stack = document.elementsFromPoint(x, y)
    const columnEl = stack.find((el) => el instanceof HTMLElement && el.dataset.columnId) as
      | HTMLElement
      | undefined
    if (!columnEl) return null

    const columnId = columnEl.dataset.columnId!
    const cardEls = Array.from(
      columnEl.querySelectorAll<HTMLElement>('[data-card-id]'),
    ).filter((el) => el.dataset.cardId !== dragging)

    // Index = how many cards' midpoints sit above the pointer.
    let index = cardEls.length
    for (let i = 0; i < cardEls.length; i++) {
      const rect = cardEls[i].getBoundingClientRect()
      if (y < rect.top + rect.height / 2) {
        index = i
        break
      }
    }
    return { columnId, index }
  }

  const move = (cardId: string, toColumn: string, toIndex: number) => {
    const next = columns.map((col) => ({ ...col, cards: [...col.cards] }))
    const from = next.find((col) => col.cards.some((c) => c.id === cardId))
    if (!from) return
    const fromIndex = from.cards.findIndex((c) => c.id === cardId)
    const [card] = from.cards.splice(fromIndex, 1)
    const target = next.find((col) => col.id === toColumn)
    if (!target) return
    // Removing first can shift the target index when moving down within the
    // same column — clamp rather than trusting the measured index.
    const clamped = Math.min(toIndex, target.cards.length)
    target.cards.splice(clamped, 0, card)
    onChange(next)
  }

  return (
    <LayoutGroup>
      <div className="life-sortable-board" ref={boardRef}>
        {columns.map((column) => (
          <div
            key={column.id}
            className={`life-sortable-col${overColumn === column.id ? ' is-over' : ''}`}
            data-column-id={column.id}
          >
            <div className="life-sortable-col-head">
              <p className="eyebrow">{column.title}</p>
              <span className="life-sortable-count">{column.cards.length}</span>
            </div>

            <div className="life-sortable-col-body">
              {column.cards.map((card) => (
                <motion.div
                  key={card.id}
                  layout={reduced ? false : true}
                  layoutId={card.id}
                  transition={SPRING}
                  data-card-id={card.id}
                  className={`life-sortable-card${dragging === card.id ? ' is-dragging' : ''}`}
                  drag
                  dragSnapToOrigin
                  dragElastic={0.12}
                  dragMomentum={false}
                  onDragStart={() => setDragging(card.id)}
                  onDrag={(_, info) => {
                    const hit = resolveDrop(info.point.x, info.point.y)
                    setOverColumn(hit?.columnId ?? null)
                  }}
                  onDragEnd={(_, info) => {
                    const hit = resolveDrop(info.point.x, info.point.y)
                    if (hit) move(card.id, hit.columnId, hit.index)
                    setDragging(null)
                    setOverColumn(null)
                  }}
                  whileDrag={{ scale: 1.03, zIndex: 40 }}
                >
                  <span className="life-sortable-card-title">{card.title}</span>
                  <span className="life-sortable-card-foot">
                    {card.tone ? (
                      <span className={`pdot ${card.tone}`} aria-hidden="true" />
                    ) : null}
                    {card.meta ? (
                      <span className="life-sortable-card-meta">{card.meta}</span>
                    ) : null}
                  </span>
                </motion.div>
              ))}

              {column.cards.length === 0 ? (
                <p className="life-sortable-col-empty">Drop here</p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </LayoutGroup>
  )
}
