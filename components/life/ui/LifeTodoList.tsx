'use client'

// Todo list management — the list view, not the board. Built from reui's
// Item + Checkbox + Sortable pattern on @dnd-kit, the same engine reui uses.
//
// Why a drag HANDLE and not whole-row drag (what LifeSortable does for the
// kanban): a todo row is full of interactive things — checkbox, priority,
// delete — and whole-row drag fights every one of them. The handle also gives
// keyboard reordering a focusable target, which whole-row drag cannot.

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useMemo, useState } from 'react'

export interface Todo {
  id: string
  title: string
  done: boolean
  priority?: 'high' | 'med' | 'low'
  project?: string
  due?: string
  /** Linked calendar event, shown as a chip — the task is on the calendar. */
  event?: string
  /** Sub-tasks render nested and reorder within their parent. */
  children?: Todo[]
}

export interface TodoGroup {
  id: string
  title: string
  todos: Todo[]
}

function TodoRow({
  todo,
  depth = 0,
  onToggle,
  onDelete,
}: {
  todo: Todo
  depth?: number
  onToggle: (id: string) => void
  onDelete: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: todo.id })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`life-todo-row${isDragging ? ' is-dragging' : ''}${todo.done ? ' is-done' : ''}`}
      data-depth={depth}
    >
      {/* Handle owns the drag listeners, so everything else stays clickable. */}
      <button
        type="button"
        className="life-todo-handle"
        aria-label={`Reorder ${todo.title}`}
        {...attributes}
        {...listeners}
      >
        <span aria-hidden="true">⠿</span>
      </button>

      <button
        type="button"
        role="checkbox"
        aria-checked={todo.done}
        aria-label={todo.title}
        className={`life-todo-check${todo.done ? ' is-checked' : ''}`}
        onClick={() => onToggle(todo.id)}
      >
        {todo.done ? '✓' : ''}
      </button>

      <span className="life-todo-title">{todo.title}</span>

      <span className="life-todo-meta">
        {todo.priority ? (
          <span className={`pdot ${todo.priority}`} title={todo.priority} aria-hidden="true" />
        ) : null}
        {todo.project ? <span className="life-todo-tag">{todo.project}</span> : null}
        {todo.due ? (
          <span className={`life-todo-due${todo.due === 'Today' ? ' is-today' : ''}`}>
            {todo.due}
          </span>
        ) : null}
        {todo.event ? (
          <span className="life-ev-chip" title={`On the calendar: ${todo.event}`}>
            <span aria-hidden="true">📅</span>
            <span className="sr-only">On the calendar: {todo.event}</span>
          </span>
        ) : null}
      </span>

      <button
        type="button"
        className="life-todo-delete"
        aria-label={`Delete ${todo.title}`}
        onClick={() => onDelete(todo.id)}
      >
        ×
      </button>
    </div>
  )
}

export function LifeTodoList({
  groups,
  onChange,
}: {
  groups: TodoGroup[]
  onChange: (next: TodoGroup[]) => void
}) {
  const [collapsed, setCollapsed] = useState<string[]>([])
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [adding, setAdding] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const sensors = useSensors(
    // A small distance threshold so a click on the handle isn't read as a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const flatById = useMemo(() => {
    const map = new Map<string, Todo>()
    const walk = (list: Todo[]) =>
      list.forEach((t) => {
        map.set(t.id, t)
        if (t.children) walk(t.children)
      })
    groups.forEach((g) => walk(g.todos))
    return map
  }, [groups])

  const mutate = (fn: (list: Todo[]) => Todo[]) =>
    onChange(groups.map((g) => ({ ...g, todos: fn(g.todos) })))

  const toggle = (id: string) => {
    const walk = (list: Todo[]): Todo[] =>
      list.map((t) =>
        t.id === id
          ? { ...t, done: !t.done }
          : t.children
            ? { ...t, children: walk(t.children) }
            : t,
      )
    mutate(walk)
  }

  const remove = (id: string) => {
    const walk = (list: Todo[]): Todo[] =>
      list
        .filter((t) => t.id !== id)
        .map((t) => (t.children ? { ...t, children: walk(t.children) } : t))
    mutate(walk)
  }

  const onDragEnd = (event: DragEndEvent) => {
    setDraggingId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return

    // Reorder within whichever list both ids belong to — top level or one
    // parent's children. Re-parenting by drag is deliberately not supported.
    const reorder = (list: Todo[]): Todo[] => {
      const from = list.findIndex((t) => t.id === active.id)
      const to = list.findIndex((t) => t.id === over.id)
      if (from !== -1 && to !== -1) return arrayMove(list, from, to)
      return list.map((t) => (t.children ? { ...t, children: reorder(t.children) } : t))
    }
    mutate(reorder)
  }

  const addTodo = (groupId: string) => {
    const title = draft.trim()
    if (!title) return
    onChange(
      groups.map((g) =>
        g.id === groupId
          ? { ...g, todos: [...g.todos, { id: `t${Date.now()}`, title, done: false }] }
          : g,
      ),
    )
    setDraft('')
  }

  const activeTodo = draggingId ? flatById.get(draggingId) : null

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={(e: DragStartEvent) => setDraggingId(String(e.active.id))}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDraggingId(null)}
    >
      <div className="life-todo">
        {groups.map((group) => {
          const isCollapsed = collapsed.includes(group.id)
          const openCount = group.todos.filter((t) => !t.done).length
          const ids = group.todos.map((t) => t.id)

          return (
            <section key={group.id} className="life-todo-group">
              <div className="life-todo-group-head">
                <button
                  type="button"
                  className="life-todo-group-toggle"
                  aria-expanded={!isCollapsed}
                  onClick={() =>
                    setCollapsed((prev) =>
                      prev.includes(group.id)
                        ? prev.filter((id) => id !== group.id)
                        : [...prev, group.id],
                    )
                  }
                >
                  <span aria-hidden="true">{isCollapsed ? '▸' : '▾'}</span>
                  {group.title}
                </button>
                <span className="life-todo-group-count">{openCount}</span>
              </div>

              {!isCollapsed ? (
                <>
                  <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                    {group.todos.map((todo) => (
                      <div key={todo.id}>
                        <TodoRow todo={todo} onToggle={toggle} onDelete={remove} />
                        {todo.children?.length ? (
                          <SortableContext
                            items={todo.children.map((c) => c.id)}
                            strategy={verticalListSortingStrategy}
                          >
                            {todo.children.map((child) => (
                              <TodoRow
                                key={child.id}
                                todo={child}
                                depth={1}
                                onToggle={toggle}
                                onDelete={remove}
                              />
                            ))}
                          </SortableContext>
                        ) : null}
                      </div>
                    ))}
                  </SortableContext>

                  {adding === group.id ? (
                    <form
                      className="life-todo-add"
                      onSubmit={(e) => {
                        e.preventDefault()
                        addTodo(group.id)
                      }}
                    >
                      <input
                        className="life-todo-add-input"
                        value={draft}
                        autoFocus
                        placeholder="What needs doing?"
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={() => {
                          addTodo(group.id)
                          setAdding(null)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            setDraft('')
                            setAdding(null)
                          }
                        }}
                      />
                      <span className="life-todo-add-hint">
                        <kbd className="life-kbd">⏎</kbd> add
                        <kbd className="life-kbd">esc</kbd> cancel
                      </span>
                    </form>
                  ) : (
                    <button
                      type="button"
                      className="life-todo-add-btn"
                      onClick={() => setAdding(group.id)}
                    >
                      + Add task
                    </button>
                  )}
                </>
              ) : null}
            </section>
          )
        })}
      </div>

      {/* Floating clone, so the row being dragged reads as lifted. */}
      <DragOverlay>
        {activeTodo ? (
          <div className="life-todo-row is-overlay">
            <span className="life-todo-handle" aria-hidden="true">⠿</span>
            <span className="life-todo-check" aria-hidden="true" />
            <span className="life-todo-title">{activeTodo.title}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
