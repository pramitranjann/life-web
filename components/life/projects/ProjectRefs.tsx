'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import { fetchJson } from '@/lib/life/client'
import type { ProjectRefKind, ProjectRefRecord } from '@/lib/life/types'

const KINDS: Array<{ key: ProjectRefKind; label: string }> = [
  { key: 'link', label: 'Link' },
  { key: 'note', label: 'Note' },
  { key: 'image', label: 'Image' },
]

function hostOf(url: string | null) {
  if (!url) return ''
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function ProjectRefs({ projectSlug, refs }: { projectSlug: string; refs: ProjectRefRecord[] }) {
  const router = useRouter()
  const [kind, setKind] = useState<ProjectRefKind>('link')
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function reset() {
    setTitle('')
    setUrl('')
    setBody('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function addRef() {
    setSaving(true)
    setError(null)
    try {
      if (kind === 'image') {
        const file = fileInputRef.current?.files?.[0]
        if (!file) {
          setError('Choose an image to upload.')
          return
        }
        const form = new FormData()
        form.append('file', file)
        if (title.trim()) form.append('title', title.trim())
        const response = await fetch(`/api/life/projects/${projectSlug}/refs`, { method: 'POST', body: form })
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null
          throw new Error(payload?.error || 'Upload failed.')
        }
      } else {
        await fetchJson(`/api/life/projects/${projectSlug}/refs`, {
          method: 'POST',
          body: JSON.stringify({ kind, title: title.trim() || null, url: url.trim() || null, body: body.trim() || null }),
        })
      }
      reset()
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add reference.')
    } finally {
      setSaving(false)
    }
  }

  async function deleteRef(id: string) {
    try {
      await fetchJson(`/api/life/projects/${projectSlug}/refs/${id}`, { method: 'DELETE' })
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete reference.')
    }
  }

  return (
    <div className="life-project-refs">
      <div className="life-ref-composer">
        <div className="segmented life-ref-kinds">
          {KINDS.map((option) => (
            <button
              key={option.key}
              type="button"
              className={`segmented-item${kind === option.key ? ' is-active' : ''}`}
              onClick={() => setKind(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="life-ref-fields">
          {kind === 'link' ? (
            <>
              <input className="text-input" value={url} placeholder="https://…" onChange={(event) => setUrl(event.target.value)} />
              <input className="text-input" value={title} placeholder="Label (optional)" onChange={(event) => setTitle(event.target.value)} />
            </>
          ) : null}
          {kind === 'note' ? (
            <textarea className="text-input life-ref-note-input" value={body} placeholder="Write a note…" rows={2} onChange={(event) => setBody(event.target.value)} />
          ) : null}
          {kind === 'image' ? (
            <>
              <input ref={fileInputRef} className="text-input life-ref-file" type="file" accept="image/*" />
              <input className="text-input" value={title} placeholder="Caption (optional)" onChange={(event) => setTitle(event.target.value)} />
            </>
          ) : null}
          <button type="button" className="life-btn primary" disabled={saving} onClick={() => void addRef()}>
            {saving ? 'Saving…' : 'Add'}
          </button>
        </div>
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      <div className="life-refs-grid">
        {refs.length === 0 ? <div className="life-empty">No references yet.</div> : null}
        {refs.map((ref) => (
          <div className={`life-ref-card life-ref-${ref.kind}`} key={ref.id}>
            <button type="button" className="life-ref-delete" aria-label="Delete reference" onClick={() => void deleteRef(ref.id)}>
              ×
            </button>
            {ref.kind === 'image' && ref.url ? (
              <a href={ref.url} target="_blank" rel="noreferrer" className="life-ref-image-wrap">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ref.url} alt={ref.title || 'Project image'} className="life-ref-image" />
              </a>
            ) : null}
            {ref.kind === 'link' && ref.url ? (
              <a href={ref.url} target="_blank" rel="noreferrer" className="life-ref-link">
                <span className="life-ref-host">{hostOf(ref.url)}</span>
                <span className="life-ref-title">{ref.title || ref.url}</span>
              </a>
            ) : null}
            {ref.kind === 'note' ? (
              <div className="life-ref-note">
                {ref.title ? <span className="life-ref-title">{ref.title}</span> : null}
                <p>{ref.body}</p>
              </div>
            ) : null}
            {ref.kind === 'image' && ref.title ? <span className="life-ref-caption">{ref.title}</span> : null}
          </div>
        ))}
      </div>
    </div>
  )
}
