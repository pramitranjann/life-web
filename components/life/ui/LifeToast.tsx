'use client'

// Undo affordance that pairs with LifeConfirm — destructive actions become
// forgiving instead of scary. Visual idiom is borrowed from the existing
// .autosave-chip countdown in VoiceCaptureControl.
// ponytail: one toast at a time, module-level emitter. A queue + provider is
// speculative for a single-user app; add a queue when two ever collide.

import { useEffect, useState } from 'react'

interface Toast {
  id: number
  message: string
  actionLabel?: string
  onAction?: () => void
  durationMs: number
}

type Listener = (toast: Toast | null) => void

const listeners = new Set<Listener>()
let current: Toast | null = null
let seq = 0

export function lifeToast(options: {
  message: string
  actionLabel?: string
  onAction?: () => void
  durationMs?: number
}) {
  current = { id: ++seq, durationMs: 6000, ...options }
  listeners.forEach((fn) => fn(current))
}

function dismiss() {
  current = null
  listeners.forEach((fn) => fn(null))
}

export function LifeToaster() {
  const [toast, setToast] = useState<Toast | null>(current)

  useEffect(() => {
    listeners.add(setToast)
    return () => {
      listeners.delete(setToast)
    }
  }, [])

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(dismiss, toast.durationMs)
    return () => window.clearTimeout(id)
  }, [toast])

  if (!toast) return null

  return (
    <div className="life-toast" role="status" aria-live="polite">
      <span className="life-toast-message">{toast.message}</span>
      {toast.actionLabel ? (
        <button
          type="button"
          className="life-toast-action"
          onClick={() => {
            toast.onAction?.()
            dismiss()
          }}
        >
          {toast.actionLabel}
        </button>
      ) : null}
      <button
        type="button"
        className="life-toast-close"
        onClick={dismiss}
        aria-label="Dismiss"
      >
        ×
      </button>
      <span
        className="life-toast-bar"
        style={{ animationDuration: `${toast.durationMs}ms` }}
        aria-hidden="true"
      />
    </div>
  )
}
