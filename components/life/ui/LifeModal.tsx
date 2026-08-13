'use client'

// General-purpose sibling to LifeConfirm: same native <dialog> primitive
// (focus trap, Escape, top layer all free from the platform) but arbitrary
// content instead of a fixed confirm/cancel body.

import { useEffect, useRef } from 'react'

export function LifeModal({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  // Escape and backdrop-dismiss both route through onClose so the parent
  // state can never drift out of sync with the dialog's own open state.
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    const onDialogClose = () => onClose()
    dialog.addEventListener('close', onDialogClose)
    return () => dialog.removeEventListener('close', onDialogClose)
  }, [onClose])

  return (
    <dialog
      className="life-modal"
      ref={ref}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
    >
      <div className="life-modal-inner">
        <div className="life-modal-head">
          <h2 className="life-modal-title">{title}</h2>
          <button type="button" className="life-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="life-modal-body">{children}</div>
        {footer ? <div className="life-modal-footer">{footer}</div> : null}
      </div>
    </dialog>
  )
}
