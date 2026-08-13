import 'server-only'

import { createProjectPage } from '@/lib/life/project-pages'
import { createProject, listProjects } from '@/lib/life/projects-db'
import type { ProjectRecord } from '@/lib/life/types'

type UxTemplateArchetype =
  | 'research-board'
  | 'problem-frame'
  | 'concept-review'
  | 'testing-review'
  | 'case-study-draft'

export interface UxTemplatePage {
  title: string
  body: string
}

export interface UxTemplateSection {
  key: string
  name: string
  phase: 'Discover' | 'Define' | 'Develop' | 'Deliver'
  summary: string
  color: string
  pages: UxTemplatePage[]
}

function archetypeBody(archetype: UxTemplateArchetype, body: string) {
  return `<!-- life:template-archetype=${archetype} -->\n\n${body.trim()}\n`
}

function researchBoardBody() {
  return archetypeBody(
    'research-board',
    `
What are we trying to understand?

## Questions
-

## Raw notes
-

## Quotes
>

## Screenshots / evidence
Paste references here.

## Patterns
-

## User needs
- As a..., I need..., so that...

## Open questions
-

## Next
-
`,
  )
}

function problemFrameBody() {
  return archetypeBody(
    'problem-frame',
    `
The problem in one sentence:

## User / Need / Barrier
| User | Need | Barrier |
| --- | --- | --- |
|  |  |  |

## Evidence
-

## Success looks like
-

## Constraints
-

## Principles
-

## Do not do
-

## Open questions
-
`,
  )
}

function conceptReviewBody() {
  return archetypeBody(
    'concept-review',
    `
What are we trying to improve?

## Concepts
| Concept | What it does | Strength | Risk |
| --- | --- | --- | --- |
|  |  |  |  |
|  |  |  |  |

## References / sketches
Paste screenshots, rough frames, or links here.

## Platform fit
- Web:
- iOS:
- Desktop:

## Selected direction
Why this one:

## Tradeoffs
-

## Prototype next
-
`,
  )
}

function testingReviewBody() {
  return archetypeBody(
    'testing-review',
    `
What was tested:

## Notes
-

## Observed issues
| Issue | Evidence | Severity | Fix |
| --- | --- | --- | --- |
|  |  |  |  |

## Accessibility checks
- Keyboard / focus:
- Contrast:
- Labels:
- Errors:
- Motion:

## Changes to make
-

## Retest
-

## Decisions
-
`,
  )
}

function caseStudyDraftBody() {
  return archetypeBody(
    'case-study-draft',
    `
Project summary:

Role:
Timeline:
Outcome:

## Challenge

## Process
- Discovery:
- Define:
- Develop:
- Deliver:

## Key decisions
| Decision | Why it mattered | Evidence |
| --- | --- | --- |
|  |  |  |

## Solution
Paste final screens or links here.

## Evidence
-

## Reflection
What changed in your thinking?
What would you improve next?
`,
  )
}

function archetypePage(archetype: UxTemplateArchetype): UxTemplatePage {
  switch (archetype) {
    case 'research-board':
      return { title: 'Research board', body: researchBoardBody() }
    case 'problem-frame':
      return { title: 'Problem frame', body: problemFrameBody() }
    case 'concept-review':
      return { title: 'Concept review', body: conceptReviewBody() }
    case 'testing-review':
      return { title: 'Testing review', body: testingReviewBody() }
    case 'case-study-draft':
      return { title: 'Case study draft', body: caseStudyDraftBody() }
  }
}

export const UX_TEMPLATE_SECTIONS: UxTemplateSection[] = [
  {
    key: 'research',
    name: 'Research',
    phase: 'Discover',
    summary: 'Collect evidence, notes, quotes, screenshots, patterns, and user needs in one place.',
    color: '#6fcfd6',
    pages: [archetypePage('research-board')],
  },
  {
    key: 'define',
    name: 'Define',
    phase: 'Define',
    summary: 'Turn messy research into a clear problem, success criteria, constraints, and open questions.',
    color: '#9aa6ff',
    pages: [archetypePage('problem-frame')],
  },
  {
    key: 'moodboard',
    name: 'Moodboard',
    phase: 'Develop',
    summary: 'Compare visual references and decide which direction belongs in the product.',
    color: '#e58fb8',
    pages: [archetypePage('concept-review')],
  },
  {
    key: 'ideation',
    name: 'Ideation',
    phase: 'Develop',
    summary: 'Compare solution directions against the user problem, evidence, risks, and next prototype move.',
    color: '#f1c45b',
    pages: [archetypePage('concept-review')],
  },
  {
    key: 'wireframes',
    name: 'Wireframes',
    phase: 'Develop',
    summary: 'Review flow options, layout decisions, platform fit, and the tradeoffs behind the chosen direction.',
    color: '#d9d0c4',
    pages: [archetypePage('concept-review')],
  },
  {
    key: 'prototype',
    name: 'Prototype',
    phase: 'Develop',
    summary: 'Keep prototype goals, references, interaction risks, and next test moves together.',
    color: '#83c47d',
    pages: [archetypePage('concept-review')],
  },
  {
    key: 'usability-testing',
    name: 'Usability Testing',
    phase: 'Deliver',
    summary: 'Convert sessions, critique notes, severity, accessibility checks, and fixes into decisions.',
    color: '#ff8c6b',
    pages: [archetypePage('testing-review')],
  },
  {
    key: 'iterations',
    name: 'Iterations',
    phase: 'Deliver',
    summary: 'Track what changed, what evidence drove it, and what needs another pass.',
    color: '#6fcfd6',
    pages: [archetypePage('testing-review')],
  },
  {
    key: 'presentation',
    name: 'Presentation',
    phase: 'Deliver',
    summary: 'Shape the project story around challenge, process, decisions, evidence, solution, and reflection.',
    color: '#e9b765',
    pages: [archetypePage('case-study-draft')],
  },
  {
    key: 'case-study',
    name: 'Case Study',
    phase: 'Deliver',
    summary: 'Draft the portfolio narrative while the evidence, decisions, visuals, and reflection are still fresh.',
    color: '#9aa6ff',
    pages: [archetypePage('case-study-draft')],
  },
]

export function uxTemplateByKey(key: string) {
  return UX_TEMPLATE_SECTIONS.find((section) => section.key === key) || null
}

export async function applyUxTemplateSections(projectSlug: string, keys: string[]): Promise<{
  created: ProjectRecord[]
  skipped: UxTemplateSection[]
}> {
  const requested = keys
    .map((key) => uxTemplateByKey(key))
    .filter((section): section is UxTemplateSection => Boolean(section))

  const uniqueRequested = Array.from(new Map(requested.map((section) => [section.key, section])).values())
  if (uniqueRequested.length === 0) return { created: [], skipped: [] }

  const projects = await listProjects({ includeArchived: true })
  const existingChildren = projects.filter((project) => project.parent_slug === projectSlug)
  const existingNames = new Set(existingChildren.map((project) => project.name.trim().toLowerCase()))
  const created: ProjectRecord[] = []
  const skipped: UxTemplateSection[] = []

  for (const section of uniqueRequested) {
    if (existingNames.has(section.name.toLowerCase())) {
      skipped.push(section)
      continue
    }

    const child = await createProject({
      name: section.name,
      summary: `${section.phase}: ${section.summary}`,
      color: section.color,
      aliases: [section.key, section.name],
      parentSlug: projectSlug,
      projectKind: 'ux',
    })
    created.push(child)
    existingNames.add(section.name.toLowerCase())

    for (const page of section.pages) {
      await createProjectPage({
        projectSlug: child.slug,
        title: page.title,
        body: page.body,
      })
    }
  }

  return { created, skipped }
}
