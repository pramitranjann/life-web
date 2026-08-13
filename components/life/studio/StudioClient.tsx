'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, InputHTMLAttributes } from 'react'
import Link from 'next/link'
import { AnimatePresence, LayoutGroup, motion, useMotionValue } from 'motion/react'
import type { MotionStyle } from 'motion/react'

import { fetchJson } from '@/lib/life/client'
import type { LifeProjectClient, StudioItemKind, StudioItemRecord } from '@/lib/life/types'

const FILTERS: Array<{ key: StudioItemKind | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'image', label: 'Images' },
  { key: 'link', label: 'Links' },
  { key: 'moodboard', label: 'Boards' },
  { key: 'critique', label: 'Critiques' },
]

const SPRING = { type: 'spring', stiffness: 320, damping: 34 } as const
const DETAIL_ZOOM_RESET = { scale: 1, tx: 0, ty: 0 }
const VIEW_STORAGE_KEY = 'life-studio-view'

type StudioView = 'grid' | 'canvas'

function hostFor(url: string | null) {
  if (!url) return null
  try {
    return new URL(url).host.replace(/^www\./, '')
  } catch {
    return url
  }
}

function splitTags(value: string) {
  return value
    .split(',')
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
}

function imageFilesFromList(files: FileList | File[]) {
  return Array.from(files).filter((file) => file.type.startsWith('image/'))
}

function applyTileRatio(img: HTMLImageElement) {
  if (!img.naturalWidth || !img.naturalHeight) return
  const tile = img.closest('article') as HTMLElement | null
  tile?.style.setProperty('--ar', (img.naturalWidth / img.naturalHeight).toFixed(4))
}

// ponytail: phyllotaxis scatter in 3 fixed clusters from index; good enough until saved canvas layouts matter
function scatterPosition(index: number) {
  const cluster = index % 3
  const n = Math.floor(index / 3)
  const angle = n * 2.39996
  const radius = 40 + 90 * Math.sqrt(n)
  return {
    x: Math.round(260 + cluster * 560 + Math.cos(angle) * radius),
    y: Math.round(240 + Math.sin(angle) * radius * 0.8),
  }
}

function clampPan(scale: number, tx: number, ty: number, rect: DOMRect) {
  const maxX = (rect.width * (scale - 1)) / 2
  const maxY = (rect.height * (scale - 1)) / 2
  return {
    scale,
    tx: Math.min(maxX, Math.max(-maxX, tx)),
    ty: Math.min(maxY, Math.max(-maxY, ty)),
  }
}

async function postStudioImage(form: FormData) {
  const response = await fetch('/api/life/studio/upload', {
    method: 'POST',
    body: form,
  })
  const payload = (await response.json().catch(() => null)) as { item?: StudioItemRecord; error?: string } | null
  if (!response.ok || !payload?.item) {
    throw new Error(payload?.error || 'Failed to upload image.')
  }
  return payload.item
}

function StudioTile({
  item,
  project,
  view,
  pos,
  planeScale,
  onOpen,
  onDelete,
  onMove,
}: {
  item: StudioItemRecord
  project: LifeProjectClient | null
  view: StudioView
  pos: { x: number; y: number }
  planeScale: number
  onOpen: (id: string) => void
  onDelete: (id: string) => void
  onMove: (id: string, x: number, y: number) => void
}) {
  const dragX = useMotionValue(0)
  const dragY = useMotionValue(0)
  const lastDragAt = useRef(0)
  const canvas = view === 'canvas'
  const host = hostFor(item.url)
  const ratio = item.width && item.height ? item.width / item.height : null

  const style: MotionStyle = canvas
    ? { left: pos.x, top: pos.y, x: dragX, y: dragY }
    : {}
  if (ratio) (style as Record<string, unknown>)['--ar'] = ratio.toFixed(4)

  return (
    <motion.article
      layout
      transition={SPRING}
      drag={canvas}
      dragMomentum={false}
      onDragEnd={() => {
        lastDragAt.current = Date.now()
        const nx = Math.round(pos.x + dragX.get() / planeScale)
        const ny = Math.round(pos.y + dragY.get() / planeScale)
        dragX.set(0)
        dragY.set(0)
        if (nx !== pos.x || ny !== pos.y) onMove(item.id, nx, ny)
      }}
      className={`life-studio-tile studio-${item.kind}${canvas ? ' is-canvas' : ''}`}
      style={style}
    >
      <button type="button" className="life-studio-tile-delete" aria-label="Delete item" onClick={() => onDelete(item.id)}>
        x
      </button>
      {item.kind === 'image' && item.url ? (
        <button
          type="button"
          className="life-studio-image-link"
          onClick={() => {
            if (Date.now() - lastDragAt.current < 250) return
            onOpen(item.id)
          }}
          aria-label={item.title || 'Open image'}
        >
          <motion.div className="life-studio-image-wrap" layoutId={`studio-img-${item.id}`} transition={SPRING}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.url}
              alt={item.title || 'Studio image'}
              className="life-studio-image"
              draggable={false}
              ref={(img) => {
                if (img?.complete) applyTileRatio(img)
              }}
              onLoad={(event) => applyTileRatio(event.currentTarget)}
            />
          </motion.div>
        </button>
      ) : null}
      {item.kind === 'link' && item.url ? (
        <a href={item.url} target="_blank" rel="noreferrer" className="life-studio-link-tile">
          <span>{host}</span>
          <strong>{item.title || item.url}</strong>
        </a>
      ) : null}
      {item.kind === 'image' ? null : (
        <div className="life-studio-tile-meta">
          <strong>{item.title}</strong>
          {project ? <Link href={`/projects/${project.slug}`}>{project.name}</Link> : null}
          {item.tags.length > 0 ? (
            <div className="life-studio-tags">
              {item.tags.map((tag) => <span key={tag}>{tag}</span>)}
            </div>
          ) : null}
        </div>
      )}
    </motion.article>
  )
}

export function StudioClient({
  initialItems,
  projects,
}: {
  initialItems: StudioItemRecord[]
  projects: LifeProjectClient[]
}) {
  const [items, setItems] = useState(initialItems)
  const [filter, setFilter] = useState<StudioItemKind | 'all'>('all')
  const [linkUrl, setLinkUrl] = useState('')
  const [linkTitle, setLinkTitle] = useState('')
  const [tags, setTags] = useState('')
  const [projectSlug, setProjectSlug] = useState('')
  const [composeOpen, setComposeOpen] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(220)
  const [view, setView] = useState<StudioView>('grid')
  const [plane, setPlane] = useState({ x: 0, y: 0, scale: 1 })
  const [detailZoom, setDetailZoom] = useState(DETAIL_ZOOM_RESET)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const boardRef = useRef<HTMLElement>(null)
  const detailRef = useRef<HTMLDivElement>(null)
  const imgboxRef = useRef<HTMLDivElement>(null)

  const projectBySlug = useMemo(() => new Map(projects.map((project) => [project.slug, project])), [projects])
  const visibleItems = filter === 'all' ? items : items.filter((item) => item.kind === filter)
  const visibleImages = useMemo(
    () => visibleItems.filter((item): item is StudioItemRecord & { url: string } => item.kind === 'image' && typeof item.url === 'string' && item.url.length > 0),
    [visibleItems],
  )
  const selectedImageIndex = useMemo(
    () => (selectedImageId ? visibleImages.findIndex((item) => item.id === selectedImageId) : -1),
    [selectedImageId, visibleImages],
  )
  const selectedImage = selectedImageIndex >= 0 ? visibleImages[selectedImageIndex] : null
  const counts = useMemo(() => {
    return items.reduce<Record<string, number>>((acc, item) => {
      acc[item.kind] = (acc[item.kind] || 0) + 1
      return acc
    }, {})
  }, [items])
  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>()
    items.forEach((item, index) => {
      const fallback = scatterPosition(index)
      map.set(item.id, {
        x: typeof item.x === 'number' ? item.x : fallback.x,
        y: typeof item.y === 'number' ? item.y : fallback.y,
      })
    })
    return map
  }, [items])

  async function uploadFiles(files: File[]) {
    const images = imageFilesFromList(files)
    if (images.length === 0 || saving) return
    setSaving(true)
    setError(null)
    try {
      const created: StudioItemRecord[] = []
      for (const file of images) {
        const form = new FormData()
        form.append('file', file)
        if (projectSlug) form.append('projectSlug', projectSlug)
        if (tags.trim()) form.append('tags', tags)
        created.push(await postStudioImage(form))
      }
      setItems((current) => [...created, ...current])
      setComposeOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload images.')
    } finally {
      setSaving(false)
      setDragActive(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
      if (folderInputRef.current) folderInputRef.current.value = ''
    }
  }

  async function addLink() {
    const url = linkUrl.trim()
    if (!url || saving) return
    setSaving(true)
    setError(null)
    try {
      const payload = await fetchJson<{ item: StudioItemRecord }>('/api/life/studio', {
        method: 'POST',
        body: JSON.stringify({
          kind: 'link',
          title: linkTitle.trim() || url,
          url,
          tags: splitTags(tags),
          projectSlug: projectSlug || null,
        }),
      })
      setItems((current) => [payload.item, ...current])
      setLinkUrl('')
      setLinkTitle('')
      setComposeOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add link.')
    } finally {
      setSaving(false)
    }
  }

  async function deleteItem(id: string) {
    setError(null)
    try {
      await fetchJson(`/api/life/studio/${id}`, { method: 'DELETE' })
      setItems((current) => current.filter((item) => item.id !== id))
      setSelectedImageId((current) => (current === id ? null : current))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete item.')
    }
  }

  async function moveItem(id: string, x: number, y: number) {
    const previous = items.find((item) => item.id === id)
    setItems((current) => current.map((item) => (item.id === id ? { ...item, x, y } : item)))
    try {
      await fetchJson(`/api/life/studio/${id}`, { method: 'PATCH', body: JSON.stringify({ x, y }) })
    } catch {
      setItems((current) =>
        current.map((item) => (item.id === id ? { ...item, x: previous?.x ?? null, y: previous?.y ?? null } : item)),
      )
      setError('Failed to save item position.')
    }
  }

  function changeView(next: StudioView) {
    setView(next)
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next)
    } catch {
      // ignore storage failures
    }
  }

  function openImageDetail(id: string) {
    setDetailZoom(DETAIL_ZOOM_RESET)
    setSelectedImageId(id)
  }

  function closeImageDetail() {
    if (detailZoom.scale > 1) {
      // Reset zoom first so the close morph starts from the un-zoomed rect.
      setDetailZoom(DETAIL_ZOOM_RESET)
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => setSelectedImageId(null)))
      return
    }
    setSelectedImageId(null)
  }

  function showPrevImage() {
    if (selectedImageIndex <= 0) return
    setDetailZoom(DETAIL_ZOOM_RESET)
    setSelectedImageId(visibleImages[selectedImageIndex - 1]?.id ?? null)
  }

  function showNextImage() {
    if (selectedImageIndex < 0 || selectedImageIndex >= visibleImages.length - 1) return
    setDetailZoom(DETAIL_ZOOM_RESET)
    setSelectedImageId(visibleImages[selectedImageIndex + 1]?.id ?? null)
  }

  useEffect(() => {
    try {
      if (window.localStorage.getItem(VIEW_STORAGE_KEY) === 'canvas') setView('canvas')
    } catch {
      // ignore storage failures
    }
  }, [])

  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const files = Array.from(event.clipboardData?.files || [])
      const images = files.filter((file) => file.type.startsWith('image/'))
      if (images.length === 0) return
      event.preventDefault()
      void uploadFiles(images)
    }

    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [projectSlug, saving, tags])

  useEffect(() => {
    const el = boardRef.current
    if (!el) return
    function onWheel(event: WheelEvent) {
      if (view === 'grid') {
        if (!event.ctrlKey && !event.metaKey) return
        event.preventDefault()
        setZoom((current) => Math.round(Math.min(400, Math.max(150, current * (1 - event.deltaY * 0.002)))))
        return
      }
      event.preventDefault()
      if (event.ctrlKey || event.metaKey) {
        const rect = el!.getBoundingClientRect()
        const cx = event.clientX - rect.left
        const cy = event.clientY - rect.top
        setPlane((current) => {
          const scale = Math.min(2, Math.max(0.3, current.scale * (1 - event.deltaY * 0.002)))
          const k = scale / current.scale
          return { x: cx - (cx - current.x) * k, y: cy - (cy - current.y) * k, scale }
        })
      } else {
        setPlane((current) => ({ ...current, x: current.x - event.deltaX, y: current.y - event.deltaY }))
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [view])

  useEffect(() => {
    if (!selectedImageId) return
    const el = detailRef.current
    if (!el) return
    function onWheel(event: WheelEvent) {
      event.preventDefault()
      const rect = imgboxRef.current?.getBoundingClientRect()
      if (!rect) return
      if (event.ctrlKey || event.metaKey) {
        const px = event.clientX - rect.left - rect.width / 2
        const py = event.clientY - rect.top - rect.height / 2
        setDetailZoom((current) => {
          const scale = Math.min(4, Math.max(1, current.scale * (1 - event.deltaY * 0.002)))
          const k = scale / current.scale
          return clampPan(scale, px - (px - current.tx) * k, py - (py - current.ty) * k, rect)
        })
      } else {
        setDetailZoom((current) =>
          current.scale > 1 ? clampPan(current.scale, current.tx - event.deltaX, current.ty - event.deltaY, rect) : current,
        )
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [selectedImageId])

  useEffect(() => {
    if (!selectedImage) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') closeImageDetail()
      else if (event.key === 'ArrowLeft') showPrevImage()
      else if (event.key === 'ArrowRight') showNextImage()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const detailMeta = selectedImage
    ? [
        selectedImage.project_slug ? projectBySlug.get(selectedImage.project_slug)?.name ?? null : null,
        selectedImage.tags.length > 0 ? selectedImage.tags.join(' · ') : null,
      ]
        .filter(Boolean)
        .join('  ·  ')
    : ''

  return (
    <LayoutGroup>
    <div className="life-studio-shell">
      <section className="life-studio-toolbar">
        <div>
          <p className="eyebrow">Studio</p>
          <h1>Studio</h1>
        </div>
        <div className="life-studio-actions">
          <button type="button" className="life-btn primary" onClick={() => setComposeOpen(true)}>
            New
          </button>
        </div>
        <input
          ref={fileInputRef}
          className="life-studio-file-input"
          type="file"
          accept="image/*"
          multiple
          onChange={(event) => void uploadFiles(imageFilesFromList(event.target.files || []))}
        />
        <input
          ref={folderInputRef}
          className="life-studio-file-input"
          type="file"
          accept="image/*"
          multiple
          {...({ webkitdirectory: '', directory: '' } as InputHTMLAttributes<HTMLInputElement>)}
          onChange={(event) => void uploadFiles(imageFilesFromList(event.target.files || []))}
        />
      </section>

      <div className="life-studio-filters">
        {FILTERS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            className={`filter-chip${filter === entry.key ? ' is-active' : ''}`}
            onClick={() => setFilter(entry.key)}
          >
            {entry.label} <span className="chip-count">{entry.key === 'all' ? items.length : counts[entry.key] || 0}</span>
          </button>
        ))}
      </div>

      <section
        ref={boardRef}
        className={`life-studio-board-surface${view === 'canvas' ? ' is-canvas' : ''}${dragActive ? ' is-dragging' : ''}${items.length === 0 ? ' is-empty' : ''}`}
        onPointerDown={
          view === 'canvas'
            ? (event) => {
                if ((event.target as HTMLElement).closest('.life-studio-tile')) return
                const startX = event.clientX
                const startY = event.clientY
                const origin = { x: plane.x, y: plane.y }
                const onMove = (ev: PointerEvent) =>
                  setPlane((current) => ({ ...current, x: origin.x + ev.clientX - startX, y: origin.y + ev.clientY - startY }))
                const onUp = () => window.removeEventListener('pointermove', onMove)
                window.addEventListener('pointermove', onMove)
                window.addEventListener('pointerup', onUp, { once: true })
              }
            : undefined
        }
        onDragEnter={(event) => {
          event.preventDefault()
          setDragActive(true)
        }}
        onDragOver={(event) => {
          event.preventDefault()
          setDragActive(true)
        }}
        onDragLeave={(event) => {
          if (event.currentTarget === event.target) setDragActive(false)
        }}
        onDrop={(event) => {
          event.preventDefault()
          void uploadFiles(imageFilesFromList(event.dataTransfer.files))
        }}
      >
        {visibleItems.length > 0 ? (
          <div
            className={view === 'grid' ? 'life-studio-masonry' : 'life-studio-plane'}
            style={
              view === 'grid'
                ? ({ '--studio-row': `${zoom}px` } as CSSProperties)
                : { transform: `translate(${plane.x}px, ${plane.y}px) scale(${plane.scale})` }
            }
          >
            {visibleItems.map((item) => (
              <StudioTile
                key={item.id}
                item={item}
                project={item.project_slug ? projectBySlug.get(item.project_slug) ?? null : null}
                view={view}
                pos={positions.get(item.id) ?? { x: 0, y: 0 }}
                planeScale={plane.scale}
                onOpen={openImageDetail}
                onDelete={(id) => void deleteItem(id)}
                onMove={(id, x, y) => void moveItem(id, x, y)}
              />
            ))}
          </div>
        ) : (
          <div className="life-studio-drop-message">
            <span>{dragActive ? 'Drop images' : 'Drop images here'}</span>
            <small>or paste screenshots with Cmd+V</small>
          </div>
        )}
      </section>

      {view === 'grid' && visibleItems.length > 1 ? (
        <div className="life-studio-zoom" aria-label="Tile size">
          <input
            type="range"
            min={150}
            max={400}
            step={10}
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          />
          <span>x{(zoom / 220).toFixed(1)}</span>
        </div>
      ) : null}

      <div className="life-studio-viewswitch" role="group" aria-label="View mode">
        <button type="button" className={view === 'grid' ? 'is-active' : ''} onClick={() => changeView('grid')}>
          Grid
        </button>
        <button type="button" className={view === 'canvas' ? 'is-active' : ''} onClick={() => changeView('canvas')}>
          Canvas
        </button>
      </div>

      {saving ? <p className="life-studio-status">Saving...</p> : null}
      {error ? <p className="error-text">{error}</p> : null}

      <AnimatePresence>
        {selectedImage ? (
          <motion.div
            ref={detailRef}
            className="life-studio-detail"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <header className="life-studio-detail-head" onClick={(e) => e.stopPropagation()}>
              <strong>{selectedImage.title || 'Untitled'}</strong>
              {detailMeta ? <span>{detailMeta}</span> : null}
              {selectedImage.body ? <span>{selectedImage.body}</span> : null}
            </header>
            <div
              className="life-studio-detail-stage"
              onClick={closeImageDetail}
            >
              <motion.div
                ref={imgboxRef}
                className={`life-studio-detail-imgbox${detailZoom.scale > 1 ? ' is-zoomed' : ''}`}
                layoutId={`studio-img-${selectedImage.id}`}
                transition={SPRING}
                onClick={(e) => { if (detailZoom.scale > 1) e.stopPropagation() }}
                onDoubleClick={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect()
                  const px = event.clientX - rect.left - rect.width / 2
                  const py = event.clientY - rect.top - rect.height / 2
                  setDetailZoom((current) =>
                    current.scale > 1
                      ? DETAIL_ZOOM_RESET
                      : clampPan(2, px - (px - current.tx) * 2, py - (py - current.ty) * 2, rect),
                  )
                }}
                onPointerDown={(event) => {
                  if (detailZoom.scale <= 1) return
                  event.preventDefault()
                  const rect = event.currentTarget.getBoundingClientRect()
                  const startX = event.clientX
                  const startY = event.clientY
                  const origin = { tx: detailZoom.tx, ty: detailZoom.ty }
                  const scale = detailZoom.scale
                  const onMove = (ev: PointerEvent) =>
                    setDetailZoom(clampPan(scale, origin.tx + ev.clientX - startX, origin.ty + ev.clientY - startY, rect))
                  const onUp = () => window.removeEventListener('pointermove', onMove)
                  window.addEventListener('pointermove', onMove)
                  window.addEventListener('pointerup', onUp, { once: true })
                }}
              >
                <div
                  className="life-studio-detail-zoomlayer"
                  style={{ transform: `translate(${detailZoom.tx}px, ${detailZoom.ty}px) scale(${detailZoom.scale})` }}
                >
                  {/* ponytail: prev/next swaps src with a fade-in only (no shared-element morph between neighbours); upgrade to directional slides if nav feels flat */}
                  <motion.img
                    key={selectedImage.id}
                    src={selectedImage.url}
                    alt={selectedImage.title || 'Studio image'}
                    draggable={false}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.16 }}
                  />
                </div>
              </motion.div>
            </div>
            <footer className="life-studio-detail-foot" onClick={(e) => e.stopPropagation()}>
              <button type="button" disabled={selectedImageIndex <= 0} onClick={showPrevImage}>
                Prev
              </button>
              <span>
                {selectedImageIndex + 1} / {visibleImages.length}
              </span>
              <button type="button" disabled={selectedImageIndex >= visibleImages.length - 1} onClick={showNextImage}>
                Next
              </button>
              <button type="button" className="is-danger" onClick={() => void deleteItem(selectedImage.id)}>
                Delete
              </button>
              <button type="button" onClick={closeImageDetail}>
                Close
              </button>
            </footer>
            {detailZoom.scale > 1.01 ? (
              <span className="life-studio-detail-zoomtag" onClick={(e) => e.stopPropagation()}>x{detailZoom.scale.toFixed(1)}</span>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {composeOpen ? (
        <div className="life-studio-compose-backdrop" onClick={() => setComposeOpen(false)}>
          <section className="life-studio-compose" aria-label="New Studio entry" onClick={(event) => event.stopPropagation()}>
            <header className="life-studio-compose-head">
              <h2>New</h2>
              <button type="button" className="life-studio-compose-close" aria-label="Close" onClick={() => setComposeOpen(false)}>
                x
              </button>
            </header>

            <div className="life-studio-compose-picks">
              <button type="button" className="life-studio-pick" onClick={() => fileInputRef.current?.click()}>
                Images
              </button>
              <button type="button" className="life-studio-pick" onClick={() => folderInputRef.current?.click()}>
                Folder
              </button>
            </div>

            <div className="life-studio-compose-form">
              <input className="text-input" value={linkUrl} placeholder="Link" onChange={(event) => setLinkUrl(event.target.value)} />
              <input className="text-input" value={linkTitle} placeholder="Label" onChange={(event) => setLinkTitle(event.target.value)} />
              <input className="text-input" value={tags} placeholder="Tags" onChange={(event) => setTags(event.target.value)} />
              <select className="text-input" value={projectSlug} onChange={(event) => setProjectSlug(event.target.value)}>
                <option value="">No project</option>
                {projects.map((project) => (
                  <option key={project.slug} value={project.slug}>
                    {project.name}
                  </option>
                ))}
              </select>
              <button type="button" className="life-btn primary" disabled={saving || !linkUrl.trim()} onClick={() => void addLink()}>
                Add link
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
    </LayoutGroup>
  )
}
