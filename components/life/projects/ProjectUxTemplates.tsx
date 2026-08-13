'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import { fetchJson } from '@/lib/life/client'
import type { ProjectRecord } from '@/lib/life/types'

interface UxTemplateSectionView {
  key: string
  name: string
  phase: string
  summary: string
  color: string
}

export function ProjectUxTemplates({
  projectSlug,
  subprojects,
  templates,
}: {
  projectSlug: string
  subprojects: ProjectRecord[]
  templates: UxTemplateSectionView[]
}) {
  const router = useRouter()
  const existingNames = useMemo(() => new Set(subprojects.map((project) => project.name.trim().toLowerCase())), [subprojects])
  const addedTemplates = useMemo(
    () => templates.filter((template) => existingNames.has(template.name.toLowerCase())),
    [existingNames, templates],
  )
  const hasAddedTemplates = addedTemplates.length > 0
  const [selected, setSelected] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(!hasAddedTemplates)

  useEffect(() => {
    setIsOpen(!hasAddedTemplates)
  }, [hasAddedTemplates, projectSlug])

  function toggle(key: string) {
    setSelected((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]))
  }

  async function addSections() {
    if (selected.length === 0 || saving) return
    setSaving(true)
    setError(null)
    try {
      await fetchJson(`/api/life/projects/${projectSlug}/ux-templates`, {
        method: 'POST',
        body: JSON.stringify({ templateKeys: selected }),
      })
      setSelected([])
      setIsOpen(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add UX sections.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="life-ux-templates-inline">
      {isOpen ? (
        <div className="life-ux-templates-head">
          <span className="eyebrow">Templates</span>
          <div className="life-ux-templates-actions">
            <button type="button" className="life-btn ghost" onClick={() => setIsOpen(false)}>
              Close
            </button>
            <button type="button" className="life-btn primary" disabled={saving || selected.length === 0} onClick={() => void addSections()}>
              {saving ? 'Adding…' : `Add ${selected.length || ''} section${selected.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      ) : (
        <div className="life-ux-template-inline-bar">
          <span className="life-ux-template-inline-note">Templates</span>
          <button type="button" className="life-btn ghost" onClick={() => setIsOpen(true)}>
            Templates
          </button>
        </div>
      )}
      {isOpen ? (
        <div className="life-ux-template-grid">
          {templates.map((template) => {
            const isAdded = existingNames.has(template.name.toLowerCase())
            const isSelected = selected.includes(template.key)
            return (
              <button
                key={template.key}
                type="button"
                className={`life-ux-template-card${isSelected ? ' is-selected' : ''}${isAdded ? ' is-added' : ''}`}
                disabled={isAdded}
                onClick={() => toggle(template.key)}
              >
                <span className="life-ux-template-mark" style={{ background: template.color }} />
                <span className="life-ux-template-body">
                  <span className="life-ux-template-top">
                    <span className="life-ux-template-name">{template.name}</span>
                    <span className="life-ux-template-phase">{isAdded ? 'Added' : template.phase}</span>
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      ) : null}
      {error ? <p className="error-text">{error}</p> : null}
    </div>
  )
}
