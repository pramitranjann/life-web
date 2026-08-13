'use client'

import { useEffect, useRef, useState } from 'react'

import { useViewportMode } from '@/hooks/useViewportMode'

const HOLD_THRESHOLD_MS = 300
const UNDO_WINDOW_MS = 2000

interface SpeechRecognitionResultLike {
  isFinal: boolean
  0: { transcript: string }
}

interface SpeechRecognitionEventLike extends Event {
  resultIndex: number
  results: ArrayLike<SpeechRecognitionResultLike>
}

interface SpeechRecognitionErrorEventLike extends Event {
  error?: string
}

interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  onend: (() => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  abort?(): void
  start(): void
  stop(): void
}

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRecognitionLike
    webkitSpeechRecognition?: new () => SpeechRecognitionLike
  }
  return w.SpeechRecognition || w.webkitSpeechRecognition || null
}

function getSpeechErrorMessage(error?: string) {
  switch (error) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Safari blocked speech recognition. Allow mic access and try again.'
    case 'audio-capture':
      return 'Safari could not access the microphone.'
    case 'network':
      return 'Speech recognition hit a network error.'
    case 'no-speech':
      return 'No speech detected.'
    case 'aborted':
      return null
    default:
      return 'Voice capture failed.'
  }
}

export function VoiceCaptureControl({
  textareaId,
  sourceInputId,
  liveTranscriptId,
}: {
  textareaId: string
  sourceInputId: string
  liveTranscriptId?: string
}) {
  const viewport = useViewportMode()
  const isHoldMode = viewport === 'phone' || viewport === 'tablet'

  const [mounted, setMounted] = useState(false)
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [countdownActive, setCountdownActive] = useState(false)

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const finalRef = useRef('')
  const interimRef = useRef('')
  const holdTimerRef = useRef<number | null>(null)
  const autosaveTimerRef = useRef<number | null>(null)
  const forceCleanupTimerRef = useRef<number | null>(null)
  const startedRef = useRef(false)
  const stoppingRef = useRef(false)

  function cancelAllTimers() {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current)
      holdTimerRef.current = null
    }
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = null
    }
    if (forceCleanupTimerRef.current !== null) {
      window.clearTimeout(forceCleanupTimerRef.current)
      forceCleanupTimerRef.current = null
    }
  }

  function destroyRecognition(recognition?: SpeechRecognitionLike | null) {
    if (!recognition) return
    recognition.onend = null
    recognition.onerror = null
    recognition.onresult = null
    if (recognitionRef.current === recognition) {
      recognitionRef.current = null
    }
  }

  // Calls both stop() and abort(): some iOS Safari builds honor only one, and
  // a session that isn't fully torn down keeps the mic (and the iOS orange
  // privacy indicator) alive.
  function hardStopRecognition(r: SpeechRecognitionLike) {
    try {
      r.stop()
    } catch {
      /* ignore */
    }
    try {
      if (typeof r.abort === 'function') r.abort()
    } catch {
      /* ignore */
    }
  }

  function forceStopRecognition() {
    const r = recognitionRef.current
    if (!r) return
    stoppingRef.current = true

    if (forceCleanupTimerRef.current !== null) {
      window.clearTimeout(forceCleanupTimerRef.current)
    }

    // Fallback: if neither onend nor onerror fires (a known iOS Safari bug),
    // hard-stop the SAME object again before discarding it. Nulling the ref
    // without re-stopping would orphan a still-live native session, which is
    // what leaves the orange mic indicator stuck on / flickering back.
    forceCleanupTimerRef.current = window.setTimeout(() => {
      forceCleanupTimerRef.current = null
      hardStopRecognition(r)
      setListening(false)
      destroyRecognition(r)
      stoppingRef.current = false
    }, 1000)

    hardStopRecognition(r)
  }

  useEffect(() => {
    setMounted(true)
    setSupported(Boolean(getRecognitionCtor()))

    const handlePageHide = () => {
      forceStopRecognition()
    }

    document.addEventListener('visibilitychange', handlePageHide)
    window.addEventListener('pagehide', handlePageHide)

    return () => {
      document.removeEventListener('visibilitychange', handlePageHide)
      window.removeEventListener('pagehide', handlePageHide)
      cancelAllTimers()
      forceStopRecognition()
      destroyRecognition(recognitionRef.current)
    }
  }, [])

  function writeToDraft(content: string) {
    const el = document.getElementById(textareaId) as HTMLTextAreaElement | null
    if (el) el.value = content
    const src = document.getElementById(sourceInputId) as HTMLInputElement | null
    if (src) src.value = 'voice'
    const live = liveTranscriptId
      ? (document.getElementById(liveTranscriptId) as HTMLElement | null)
      : null
    if (live) live.textContent = content
  }

  function combined() {
    return [finalRef.current, interimRef.current].filter(Boolean).join(' ').trim()
  }

  function startRecognition() {
    const Ctor = getRecognitionCtor()
    if (!Ctor) {
      setError('Voice capture is unavailable in this browser.')
      return
    }

    // If a previous session is somehow still alive, kill it before starting a
    // new one — prevents two overlapping native mic sessions (orphan → stuck
    // orange indicator).
    if (recognitionRef.current) {
      hardStopRecognition(recognitionRef.current)
      destroyRecognition(recognitionRef.current)
    }

    const existing = document.getElementById(textareaId) as HTMLTextAreaElement | null
    finalRef.current = existing?.value.trim() || ''
    interimRef.current = ''
    stoppingRef.current = false

    const recognition = new Ctor()
    // continuous = true keeps ONE session open for the whole hold. With
    // continuous = false, iOS Safari ends the session on the first pause and
    // then silently auto-restarts it — that restart is why the mic indicator
    // came back even though our UI showed idle. We stop explicitly on release.
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognition.onresult = (event) => {
      let finalText = ''
      let interimText = ''
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i]
        const transcript = result[0].transcript
        if (result.isFinal) finalText += transcript
        else interimText += transcript
      }
      if (finalText) finalRef.current = `${finalRef.current} ${finalText}`.trim()
      interimRef.current = interimText.trim()
      writeToDraft(combined())
    }
    recognition.onerror = (event) => {
      const wasStopping = stoppingRef.current
      setListening(false)
      destroyRecognition(recognition)
      if (forceCleanupTimerRef.current !== null) {
        window.clearTimeout(forceCleanupTimerRef.current)
        forceCleanupTimerRef.current = null
      }
      stoppingRef.current = false
      if (!(wasStopping && event.error === 'aborted')) {
        const msg = getSpeechErrorMessage(event.error)
        if (msg) setError(msg)
      }
    }
    recognition.onend = () => {
      setListening(false)
      interimRef.current = ''
      if (forceCleanupTimerRef.current !== null) {
        window.clearTimeout(forceCleanupTimerRef.current)
        forceCleanupTimerRef.current = null
      }
      destroyRecognition(recognition)
      stoppingRef.current = false
      const draft = combined()
      writeToDraft(draft)
      if (draft) scheduleAutosave()
    }
    recognitionRef.current = recognition
    try {
      recognition.start()
      setListening(true)
      startedRef.current = true
    } catch (startError) {
      setListening(false)
      recognitionRef.current = null
      setError(startError instanceof Error ? startError.message : 'Voice capture failed to start.')
    }
  }

  function scheduleAutosave() {
    setCountdownActive(true)
    autosaveTimerRef.current = window.setTimeout(() => {
      autosaveTimerRef.current = null
      setCountdownActive(false)
      const el = document.getElementById(textareaId) as HTMLTextAreaElement | null
      const form = el?.form
      if (form && (el?.value || '').trim()) {
        form.requestSubmit()
      }
    }, UNDO_WINDOW_MS)
  }

  function cancelAutosave() {
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = null
    }
    setCountdownActive(false)
  }

  function undoCapture() {
    cancelAutosave()
    finalRef.current = ''
    interimRef.current = ''
    writeToDraft('')
  }

  function onPointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (!isHoldMode) return
    if (!supported) return
    // Don't preventDefault or setPointerCapture here — that would block the
    // page from scrolling when the user pans vertically with a finger on the
    // mic. Instead, wait the HOLD_THRESHOLD_MS still-hold window before
    // engaging. If the browser interprets the gesture as a scroll it will
    // fire pointercancel, which clears the timer in onPointerEndLike.
    const target = event.currentTarget
    const pointerId = event.pointerId
    setError(null)
    startedRef.current = false
    cancelAutosave()
    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null
      // Now we're committing to the hold: capture the pointer, suppress the
      // iOS long-press selection/callout, and start recognition.
      try {
        target.setPointerCapture(pointerId)
      } catch {
        /* ignore */
      }
      if (navigator.vibrate) {
        try {
          navigator.vibrate(20)
        } catch {
          /* ignore */
        }
      }
      startRecognition()
    }, HOLD_THRESHOLD_MS)
  }

  function onPointerEndLike() {
    if (!isHoldMode) return
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current)
      holdTimerRef.current = null
      return
    }
    if (startedRef.current) {
      forceStopRecognition()
      startedRef.current = false
    }
  }

  function onToggleClick() {
    if (isHoldMode) return
    if (!supported) {
      setError('Voice capture is unavailable in this browser.')
      return
    }
    setError(null)
    if (listening) {
      forceStopRecognition()
      return
    }
    cancelAutosave()
    startRecognition()
  }

  useEffect(() => {
    if (!countdownActive) return
    const el = document.getElementById(textareaId) as HTMLTextAreaElement | null
    if (!el) return
    const onInput = () => cancelAutosave()
    el.addEventListener('input', onInput)
    return () => el.removeEventListener('input', onInput)
  }, [countdownActive, textareaId])

  const label = !mounted
    ? 'Hold to capture'
    : !supported
      ? 'Voice unavailable'
      : listening
        ? 'Listening…'
        : 'Hold to capture'

  return (
    <>
      <button
        className={`life-mic ${listening ? 'is-live' : ''} ${isHoldMode ? 'is-hold' : 'is-toggle'}`}
        disabled={!mounted || !supported}
        type="button"
        draggable={false}
        // Belt-and-braces with voice-phone.css: kill text selection / the
        // iOS callout menu so touch-and-hold never selects the label text.
        style={{
          WebkitUserSelect: 'none',
          userSelect: 'none',
          WebkitTouchCallout: 'none',
          // pan-y lets vertical page scroll initiate from a finger on the
          // mic; the hold timer in onPointerDown only engages after a 300 ms
          // still-hold, so scrolls cancel the timer via pointercancel.
          touchAction: isHoldMode ? 'pan-y' : 'manipulation',
        }}
        onContextMenu={(event) => {
          if (isHoldMode) event.preventDefault()
        }}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerEndLike}
        onPointerCancel={onPointerEndLike}
        onPointerLeave={onPointerEndLike}
        onClick={onToggleClick}
      >
        <span className="life-mic-dot" aria-hidden="true" />
        <span className="life-mic-label">{label}</span>
      </button>
      {countdownActive ? (
        <div className="autosave-chip">
          <span className="autosave-chip-label">Saving in 2s</span>
          <button type="button" onClick={undoCapture} className="autosave-undo">
            Undo
          </button>
          <span className="autosave-chip-bar" aria-hidden="true" />
        </div>
      ) : null}
      {error ? <p className="error-text">{error}</p> : null}
    </>
  )
}
