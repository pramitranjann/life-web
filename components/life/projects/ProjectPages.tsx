'use client'

import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

import DOMPurify from 'isomorphic-dompurify'

import { fetchJson } from '@/lib/life/client'
import { LifeRichEditor } from '@/components/life/ui/LifeRichEditor'
import { mergeLifePageMetadata, splitLifePageBody, stripLifePageMetadata, toggleNthHtmlCheckbox } from '@/lib/life/page-body'
import type { ProjectPageRecord, ProjectRefRecord, TaskRecord } from '@/lib/life/types'

import { formatYmd, relativeDueLabel } from './shared'

/** Compact age label for a timestamp: "now", "5m", "3h", "2d", then "12 Jun". */
function shortAgo(iso: string) {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  if (mins < 1440) return `${Math.floor(mins / 60)}h`
  const days = Math.floor(mins / 1440)
  if (days <= 30) return `${days}d`
  return formatYmd(iso.slice(0, 10))
}

export function ProjectPages({
  projectSlug,
  pages,
  tasks,
  refs,
  today,
  chromeless = false,
}: {
  projectSlug: string
  pages: ProjectPageRecord[]
  tasks: TaskRecord[]
  refs: ProjectRefRecord[]
  today: string
  /** Drop the internal page list — the project rail already shows it. */
  chromeless?: boolean
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const requestedPageId = searchParams.get('page')
  const [items, setItems] = useState<ProjectPageRecord[]>(pages)
  const initialPage = (requestedPageId && pages.find((page) => page.id === requestedPageId)) || pages[0] || null
  const [selectedId, setSelectedId] = useState<string | null>(initialPage?.id || null)
  const [title, setTitle] = useState(initialPage?.title || '')
  const [body, setBody] = useState(stripLifePageMetadata(initialPage?.body || ''))
  const [mode, setMode] = useState<'read' | 'edit'>(initialPage ? 'read' : 'edit')
  const [saveState, setSaveState] = useState<'saved' | 'unsaved' | 'saving' | 'error'>('saved')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setItems(pages)
    setSelectedId((current) => {
      if (current && pages.some((page) => page.id === current)) return current
      if (requestedPageId && pages.some((page) => page.id === requestedPageId)) return requestedPageId
      return pages[0]?.id || null
    })
  }, [pages, requestedPageId])

  const selectedPage = useMemo(
    () => items.find((page) => page.id === selectedId) || null,
    [items, selectedId],
  )

  useEffect(() => {
    const nextBody = stripLifePageMetadata(selectedPage?.body || '')
    setTitle(selectedPage?.title || '')
    setBody(nextBody)
    setSaveState('saved')
    // A page with nothing in it has nothing to read — that's a page just
    // created, so put the cursor where the writing happens.
    if (selectedPage) setMode(nextBody.trim() ? 'read' : 'edit')
  }, [selectedPage?.id])

  const selectedDraftBody = selectedPage ? stripLifePageMetadata(selectedPage.body) : ''
  const hasDraftChanges = Boolean(selectedPage && (title !== selectedPage.title || body !== selectedDraftBody))

  function pageMeta(page: ProjectPageRecord) {
    const { body: visibleBody, templateArchetype } = splitLifePageBody(page.body)
    if (templateArchetype) return templateArchetype.replaceAll('-', ' ')
    return visibleBody.trim() ? 'Page' : 'Empty page'
  }

  async function createPage() {
    setCreating(true)
    setError(null)
    try {
      const payload = await fetchJson<{ page: ProjectPageRecord }>(`/api/life/projects/${projectSlug}/pages`, {
        method: 'POST',
        body: JSON.stringify({ title: 'Untitled', body: '' }),
      })
      setItems((current) => [...current, payload.page])
      setSelectedId(payload.page.id)
      setMode('edit')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create page.')
    } finally {
      setCreating(false)
    }
  }

  const savePageDraft = useCallback(async (page: ProjectPageRecord, nextTitle: string, nextBody: string) => {
    setSaveState('saving')
    setError(null)
    try {
      const payload = await fetchJson<{ page: ProjectPageRecord }>(`/api/life/projects/${projectSlug}/pages/${page.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: nextTitle, body: mergeLifePageMetadata(page.body, nextBody) }),
      })
      setItems((current) => current.map((page) => (page.id === payload.page.id ? payload.page : page)))
      setSaveState('saved')
    } catch (err) {
      setSaveState('error')
      setError(err instanceof Error ? err.message : 'Failed to save page.')
    }
  }, [projectSlug])

  const saveSelectedPageNow = useCallback(() => {
    if (!selectedPage || !hasDraftChanges) return Promise.resolve()
    return savePageDraft(selectedPage, title, body)
  }, [body, hasDraftChanges, savePageDraft, selectedPage, title])

  useEffect(() => {
    if (!requestedPageId || requestedPageId === selectedId || !items.some((page) => page.id === requestedPageId)) return
    let cancelled = false
    void (async () => {
      await saveSelectedPageNow()
      if (cancelled) return
      setSelectedId(requestedPageId)
      setMode('read')
    })()
    return () => {
      cancelled = true
    }
  }, [items, requestedPageId, saveSelectedPageNow, selectedId])

  async function selectPage(pageId: string) {
    await saveSelectedPageNow()
    setSelectedId(pageId)
    setMode('read')
    // Keep the URL (and the project tree highlight) in sync with the selection.
    router.replace(`/projects/${projectSlug}?page=${pageId}`, { scroll: false })
  }

  useEffect(() => {
    if (!selectedPage || mode !== 'edit' || !hasDraftChanges) return
    // 'unsaved', not 'saving' — for these 900ms nothing is in flight, and
    // claiming otherwise is why a lost edit looks like a saved one.
    setSaveState('unsaved')
    const handle = window.setTimeout(() => {
      void savePageDraft(selectedPage, title, body)
    }, 900)
    return () => window.clearTimeout(handle)
  }, [body, hasDraftChanges, mode, savePageDraft, selectedPage, title])

  // Anything that leaves the page inside the 900ms debounce loses the edit.
  // In-app page switches already flush via saveSelectedPageNow(); these cover
  // the rest — closing the tab, and iOS killing a backgrounded PWA, which
  // never fires beforeunload at all.
  useEffect(() => {
    if (!hasDraftChanges) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault()
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') void saveSelectedPageNow()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [hasDraftChanges, saveSelectedPageNow])

  async function deletePage() {
    if (!selectedPage) return
    if (!window.confirm(`Delete "${selectedPage.title}"?`)) return
    setError(null)
    try {
      await fetchJson(`/api/life/projects/${projectSlug}/pages/${selectedPage.id}`, { method: 'DELETE' })
      const nextItems = items.filter((page) => page.id !== selectedPage.id)
      setItems(nextItems)
      setSelectedId(nextItems[0]?.id || null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete page.')
    }
  }

  function onReaderClick(event: MouseEvent<HTMLElement>) {
    // Don't hijack clicks on links inside the rendered markdown.
    if ((event.target as HTMLElement).closest('a')) return
    // Task-list checkboxes are disabled + pointer-events:none (clicks on disabled
    // inputs never fire), so find the item that was clicked and use its position
    // among its siblings — no geometry, and it survives wrapping and reflow.
    const item = (event.target as HTMLElement).closest('li[data-checked]')
    if (item) {
      if (!selectedPage) return
      const items = Array.from(event.currentTarget.querySelectorAll('li[data-checked]'))
      const next = toggleNthHtmlCheckbox(body, items.indexOf(item))
      setBody(next)
      void savePageDraft(selectedPage, title, next)
      return
    }
    setMode('edit')
  }

  const openTasks = tasks.filter((task) => task.status !== 'done').slice(0, 5)
  const topRefs = refs.slice(0, 5)
  const readerBody = body.trim()

  if (items.length === 0) {
    return (
      <div className="life-project-pages-empty">
        <span className="eyebrow">Pages</span>
        <p className="life-project-pages-empty-text">
          No pages yet. Notes, checklists, references — anything worth writing down lives here.
        </p>
        <button type="button" className="life-btn primary life-project-page-action" disabled={creating} onClick={() => void createPage()}>
          {creating ? 'Adding…' : '+ Page'}
        </button>
        {error ? <p className="error-text">{error}</p> : null}
      </div>
    )
  }

  return (
    <div className={`life-project-pages${chromeless ? ' is-chromeless' : ''}`}>
      {chromeless ? null : (
        <div className="life-project-pages-sidebar">
          <div className="life-project-pages-head">
            <span className="eyebrow">Pages</span>
            <button type="button" className="life-btn primary life-project-page-action" disabled={creating} onClick={() => void createPage()}>
              {creating ? 'Adding…' : '+ Page'}
            </button>
          </div>
          <div className="life-project-pages-list">
            {items.map((page) => (
              <button
                key={page.id}
                type="button"
                className={`life-project-page-link${page.id === selectedId ? ' is-active' : ''}`}
                onClick={() => void selectPage(page.id)}
              >
                <span className="life-project-page-link-title">{page.title}</span>
                <span className="life-project-page-link-meta" suppressHydrationWarning>
                  {pageMeta(page)} · {shortAgo(page.updated_at)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div
        className="life-project-page-editor"
        onBlur={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
          void saveSelectedPageNow()
        }}
      >
        {selectedPage ? (
          <>
            {mode === 'edit' ? (
              <input
                className="life-project-page-title"
                value={title}
                placeholder="Untitled"
                autoFocus={!selectedDraftBody.trim()}
                onChange={(event) => setTitle(event.target.value)}
                onBlur={() => void saveSelectedPageNow()}
              />
            ) : (
              <h2 className="life-project-page-read-title" onClick={() => setMode('edit')}>
                {selectedPage.title}
              </h2>
            )}
            <div className="life-project-page-meta" suppressHydrationWarning>
              <span>created {formatYmd(selectedPage.created_at.slice(0, 10))}</span>
              <span>·</span>
              <span>updated {shortAgo(selectedPage.updated_at)}</span>
              <span>·</span>
              <span className={`life-project-page-save-state is-${saveState}`}>
                {saveState === 'saving'
                  ? 'Saving…'
                  : saveState === 'unsaved'
                    ? 'Unsaved'
                    : saveState === 'error'
                      ? 'Not saved'
                      : 'Saved'}
              </span>
              {saveState === 'error' ? (
                // Without this the only way out of a failed save is to type
                // another character, and the draft sits unsaved meanwhile.
                <button
                  type="button"
                  className="life-project-page-retry"
                  onClick={() => void saveSelectedPageNow()}
                >
                  Retry
                </button>
              ) : null}
              <button type="button" className="life-project-page-delete" onClick={() => void deletePage()}>
                Delete
              </button>
            </div>
            {mode === 'edit' ? (
              <LifeRichEditor docKey={selectedPage.id} content={body} onChange={setBody} />
            ) : readerBody ? (
              <article
                className="life-project-page-reader"
                onClick={onReaderClick}
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(readerBody) }}
              />
            ) : (
              <article className="life-project-page-reader" onClick={onReaderClick}>
                <div className="life-project-page-empty-body">Empty page. Click to start writing.</div>
              </article>
            )}
            {openTasks.length > 0 || topRefs.length > 0 ? (
              <div className="life-project-page-related">
                {openTasks.length > 0 ? (
                  <div className="life-project-page-related-block">
                    <span className="eyebrow">Open tasks</span>
                    <div className="life-list">
                      {openTasks.map((task) => {
                        const due = relativeDueLabel(task.due_local_date, today)
                        return (
                          <div key={task.id} className="life-overview-row">
                            <span className="life-overview-row-title">{task.title}</span>
                            {due ? <span className={`life-due-chip due-${due.tone}`}>{due.text}</span> : null}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : null}
                {topRefs.length > 0 ? (
                  <div className="life-project-page-related-block">
                    <span className="eyebrow">References</span>
                    <div className="life-list">
                      {topRefs.map((ref) =>
                        ref.url ? (
                          <a key={ref.id} className="life-overview-row" href={ref.url} target="_blank" rel="noreferrer">
                            <span className="life-overview-row-title">{ref.title || ref.url}</span>
                          </a>
                        ) : (
                          <div key={ref.id} className="life-overview-row">
                            <span className="life-overview-row-title">{ref.title || 'Untitled'}</span>
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        ) : (
          <div className="life-empty">Select a page or create a new one.</div>
        )}

        {error ? <p className="error-text">{error}</p> : null}
      </div>
    </div>
  )
}
