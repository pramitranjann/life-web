'use client'

// Replaces the 5 window.confirm() calls: ProjectWorkspace:266, ProjectTasks:163,
// ProjectsOverview:79, PersonDetail:92, HistoryClient:115.
// ponytail: native <dialog> — focus trap, Escape, top-layer and inertness are
// free from the platform. A div would mean reimplementing all four.

import { useEffect, useRef } from 'react'

export function LifeConfirm({
  open,
  title,
  body,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  danger = true,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  body?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  // Escape and backdrop-dismiss both route through onCancel so the parent
  // state can never drift out of sync with the dialog's own open state.
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    const onClose = () => onCancel()
    dialog.addEventListener('close', onClose)
    return () => dialog.removeEventListener('close', onClose)
  }, [onCancel])

  return (
    <dialog
      className="life-confirm"
      ref={ref}
      onClick={(e) => {
        if (e.target === ref.current) onCancel()
      }}
    >
      <div className="life-confirm-inner">
        <h2 className="life-confirm-title">{title}</h2>
        {body ? <p className="life-confirm-body">{body}</p> : null}
        <div className="life-confirm-actions">
          <button type="button" className="life-btn ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`life-btn${danger ? ' is-danger' : ' primary'}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  )
}
