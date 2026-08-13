'use client'

import { createContext, useContext, useMemo, type CSSProperties, type ReactNode } from 'react'

import type { LifeProjectClient } from '@/lib/life/types'

// Deterministic fallback palette for projects without an explicit colour.
const PROJECT_TINTS = ['#e9b765', '#7fd899', '#9aa6ff', '#e58fb8', '#6fcfd6', '#c79bff']

function hexToRgb(hex: string): [number, number, number] | null {
  const clean = hex.replace('#', '').trim()
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  if (full.length !== 6) return null
  const value = Number.parseInt(full, 16)
  if (Number.isNaN(value)) return null
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

/** Turn a hex colour into the chip's text / border / background tint set. */
export function tintStyleFromHex(hex: string | null | undefined): CSSProperties | undefined {
  if (!hex) return undefined
  const rgb = hexToRgb(hex)
  if (!rgb) return undefined
  const [r, g, b] = rgb
  return {
    color: hex,
    borderColor: `rgba(${r},${g},${b},0.3)`,
    background: `rgba(${r},${g},${b},0.08)`,
  }
}

interface LifeProjectsContextValue {
  projects: LifeProjectClient[]
  topLevelProjects: LifeProjectClient[]
  labelFor: (slug: string | null | undefined) => string
  tintFor: (slug: string | null | undefined) => CSSProperties | undefined
  colorFor: (slug: string | null | undefined) => string
  projectFor: (slug: string | null | undefined) => LifeProjectClient | null
  childrenOf: (slug: string | null | undefined) => LifeProjectClient[]
}

function buildValue(projects: LifeProjectClient[]): LifeProjectsContextValue {
  const map = new Map(projects.map((project) => [project.slug, project]))
  const indexBySlug = new Map(projects.map((project, index) => [project.slug, index]))
  const topLevelProjects = projects.filter((project) => !project.parent_slug)

  const colorFor = (slug: string | null | undefined) => {
    if (!slug) return '#6f6f6f'
    const project = map.get(slug)
    if (project?.color) return project.color
    const index = indexBySlug.get(slug) ?? slug.length
    return PROJECT_TINTS[index % PROJECT_TINTS.length]
  }

  return {
    projects,
    topLevelProjects,
    colorFor,
    labelFor: (slug) => (slug ? map.get(slug)?.name || slug : ''),
    tintFor: (slug) => (slug ? tintStyleFromHex(colorFor(slug)) : undefined),
    projectFor: (slug) => (slug ? map.get(slug) || null : null),
    childrenOf: (slug) => projects.filter((project) => project.parent_slug === (slug || null)),
  }
}

const LifeProjectsContext = createContext<LifeProjectsContextValue>(buildValue([]))

export function LifeProjectsProvider({
  projects,
  children,
}: {
  projects: LifeProjectClient[]
  children: ReactNode
}) {
  const value = useMemo(() => buildValue(projects), [projects])
  return <LifeProjectsContext.Provider value={value}>{children}</LifeProjectsContext.Provider>
}

export function useLifeProjects() {
  return useContext(LifeProjectsContext)
}
