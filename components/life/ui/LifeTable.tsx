'use client'

// PrintManagement renders four sections of rows as divs — real columns never
// line up, and nothing is sortable. This is a table, not a data grid:
// no virtualization, no column pinning, no resizing. A personal print queue
// runs ~20 rows; the grid features would be dead weight.
// ponytail: add TanStack Table only if a screen ever passes ~200 rows.

import { useMemo, useState } from 'react'

export interface TableColumn<T> {
  key: keyof T & string
  label: string
  numeric?: boolean
  /** Renders the cell; defaults to the raw value. */
  render?: (row: T) => React.ReactNode
  /** Marks the identity column — gets display type instead of muted. */
  title?: boolean
}

// The generic is deliberately unconstrained. Requiring `T extends Record<string,
// unknown>` forces every caller holding a plain `interface` (TaskRecord,
// PrintJobRecord — interfaces get no implicit index signature) to launder it
// through a cast at the boundary. `key: keyof T & string` already gives safe
// indexing without pushing that cost onto callers.
export function LifeTable<T>({
  columns,
  rows,
  getRowId,
  selectable = false,
  rowActions,
  onBulk,
  bulkLabel = 'Apply to selected',
}: {
  columns: TableColumn<T>[]
  rows: T[]
  getRowId: (row: T) => string
  /** Row checkboxes + a bulk bar — what PrintManagement actually needs. */
  selectable?: boolean
  rowActions?: (row: T) => React.ReactNode
  /** Return false to keep the selection — the action failed and retry is likely. */
  onBulk?: (ids: string[]) => void | boolean | Promise<void | boolean>
  /** Names the bulk action, so the bar reads like the screen it sits on. */
  bulkLabel?: string
}) {
  const [sort, setSort] = useState<{ key: keyof T & string; dir: 1 | -1 } | null>(null)
  const [selected, setSelected] = useState<string[]>([])

  const allIds = rows.map(getRowId)
  const allChecked = allIds.length > 0 && selected.length === allIds.length
  const toggleRow = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]))

  const sorted = useMemo(() => {
    if (!sort) return rows
    return [...rows].sort((a, b) => {
      const av = a[sort.key]
      const bv = b[sort.key]
      if (av === bv) return 0
      return (av! > bv! ? 1 : -1) * sort.dir
    })
  }, [rows, sort])

  const toggle = (key: keyof T & string) =>
    setSort((prev) => (prev?.key === key ? { key, dir: prev.dir === 1 ? -1 : 1 } : { key, dir: 1 }))

  return (
    <div className="life-table-wrap">
      {selectable && selected.length > 0 ? (
        <div className="life-table-bulk">
          <span>{selected.length} selected</span>
          <button
            type="button"
            className="life-btn ghost"
            onClick={() => {
              // Owning the selection means owning the reset — but only on
              // success. Clearing after a failed bulk action would make the
              // user re-pick every row to retry.
              void Promise.resolve(onBulk?.(selected)).then((ok) => {
                if (ok !== false) setSelected([])
              })
            }}
          >
            {bulkLabel}
          </button>
          <button type="button" className="life-table-bulk-clear" onClick={() => setSelected([])}>
            Clear
          </button>
        </div>
      ) : null}
      <table className="life-table">
        <thead>
          <tr>
            {selectable ? (
              <th className="is-check">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={allChecked}
                  aria-label="Select all"
                  className={`life-todo-check${allChecked ? ' is-checked' : ''}`}
                  onClick={() => setSelected(allChecked ? [] : allIds)}
                >
                  {allChecked ? '✓' : ''}
                </button>
              </th>
            ) : null}
            {columns.map((col) => (
              <th
                key={col.key}
                className={[col.numeric ? 'is-num' : '', sort?.key === col.key ? 'is-sorted' : '']
                  .filter(Boolean)
                  .join(' ')}
                aria-sort={
                  sort?.key === col.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'
                }
              >
                <button type="button" onClick={() => toggle(col.key)}>
                  {col.label}
                  <span aria-hidden="true">
                    {sort?.key === col.key ? (sort.dir === 1 ? '↑' : '↓') : ''}
                  </span>
                </button>
              </th>
            ))}
            {rowActions ? <th aria-label="Actions" /> : null}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={getRowId(row)} className={selected.includes(getRowId(row)) ? 'is-selected' : ''}>
              {selectable ? (
                <td className="is-check">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={selected.includes(getRowId(row))}
                    aria-label={`Select row`}
                    className={`life-todo-check${selected.includes(getRowId(row)) ? ' is-checked' : ''}`}
                    onClick={() => toggleRow(getRowId(row))}
                  >
                    {selected.includes(getRowId(row)) ? '✓' : ''}
                  </button>
                </td>
              ) : null}
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={[col.numeric ? 'is-num' : '', col.title ? 'is-title' : '']
                    .filter(Boolean)
                    .join(' ')}
                >
                  {col.render ? col.render(row) : String(row[col.key] ?? '')}
                </td>
              ))}
              {rowActions ? <td className="is-actions">{rowActions(row)}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
