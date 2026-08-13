# Life UX Visual Template Spec

Date: 2026-07-02
Status: planning target

## Product Intent

UX templates should feel like useful starting surfaces, not prewritten homework sheets.

The current markdown-only template direction is too textual. It creates many pages with instructional copy, which makes the workspace feel formal and unnatural. The better model is a smaller set of visual page archetypes that create real working layouts: places for notes, screenshots, evidence, decisions, critique, and presentation material.

The user is the only user. The system should optimize for solo design work: low friction, low navigation overhead, and enough structure to guide good UX process without creating documentation chores.

## Current Implementation Constraints

Verified against the code before writing this spec:

- Templates are built through a `worksheet()` helper in `lib/life/ux-templates.ts` that emits `Purpose`, `Use this page when`, `Gather before starting`, and `Leave this page with`. This is the textual scaffolding to remove.
- `applyUxTemplateSections()` creates one **child project per section**, then one page per template page inside that child project. Each section is its own child project.
- `project_pages` has no metadata column; `createProjectPage()` only accepts `title` and `body`. Archetype metadata lives in the stored body as a Life metadata comment, not a new column.
- `components/life/MarkdownCard.tsx` already renders GFM via `marked`, but `marked` v17 does not sanitize raw HTML. Rendering should add `isomorphic-dompurify` once in the shared markdown path rather than hand-rolling escaping or patching only template pages.
- The workspace tab order is already Pages → Tasks → References → Events.
- `StudioItemRecord.project_slug` already exists (project-level attachment). Page/section-level attachment is the only new Studio work.

## Source Foundations

The templates should be grounded in these sources as design inputs, not displayed as citations in the UI.

- NN/g: evidence-first research, observation separated from interpretation, usability findings, severity, IA, heuristics.
- GOV.UK Service Manual: user needs, plain language, practical service delivery, inclusive design, clear scope.
- Design Council Double Diamond: Discover, Define, Develop, Deliver as the overall project arc.
- Stanford d.school and IDEO: messy exploration, synthesis, workshop-style concept generation, learning through making.
- W3C WCAG: accessibility criteria embedded into critique and testing, not appended as a late checklist.
- Apple HIG and Material Design: platform fit, interaction expectations, state behavior, and interface critique.
- Portfolio case study norms: challenge, role, constraints, process, decision points, evidence, outcome, reflection.

## Design Principle

Templates are not documents to complete. They are working surfaces to build on.

The template should provide visible structure immediately, but the user should be able to write over it, delete sections, paste screenshots, add rough notes, and leave areas incomplete without the page feeling broken.

Avoid:

- many narrow pages
- rigid worksheet language
- headings like "Purpose", "Use this page when", or "Leave this page with"
- decorative template chrome
- methodology labels as the main UI
- fake process theater

Prefer:

- fewer stronger pages
- document-like page openings
- light visual regions
- evidence near decisions
- screenshot and reference slots
- quote blocks
- comparison tables
- decision callouts
- clear next steps

## Template Model

Reduce the template system to five primary page archetypes.

1. Research Board
2. Problem Frame
3. Concept Review
4. Testing Review
5. Case Study Draft

UX section templates can still exist as project sections, but they should instantiate these archetypes instead of many small generic pages.

Recommended mapping:

| UX section | Created page archetype |
| --- | --- |
| Research | Research Board |
| Define | Problem Frame |
| Moodboard | Research Board or Concept Review, depending on use |
| Ideation | Concept Review |
| Wireframes | Concept Review |
| Prototype | Concept Review |
| Usability Testing | Testing Review |
| Iterations | Testing Review |
| Presentation | Case Study Draft |
| Case Study | Case Study Draft |

Note on the current model: each section is its own child project, and after Phase 1 each child project holds exactly one archetype page. So within a single section there is no duplication to prevent. Adding `Ideation`, `Wireframes`, and `Prototype` still creates three separate section-projects, each with its own `Concept Review` page — this is treated as intentional (each child section is its own work area), not a bug to dedup. Name-based section dedup already exists in `applyUxTemplateSections()`. Cross-section archetype dedup is out of scope; Phase 1's "one strong page per section" is what actually removes the page flood.

## Archetype 1: Research Board

### Source Grounding

NN/g pushes this page toward evidence and observation discipline. GOV.UK pushes it toward user needs, plain language, and practical context. d.school and IDEO push it toward messy capture and synthesis.

### Job

Capture research without forcing premature conclusions.

### Layout

Top summary strip:

- Research question
- Current assumption
- Stage or round
- Next session or source

Main layout:

- Left column: raw notes, quotes, screenshots, source links
- Right column: observations, patterns, user needs
- Bottom area: open questions and next moves

Optional visual regions:

- evidence gallery
- quote callouts
- participant/source notes
- pattern clusters

### Starter Body Shape

```md
<!-- life:template-archetype=research-board -->

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
```

## Archetype 2: Problem Frame

### Source Grounding

Double Diamond makes this the convergence surface after discovery. NN/g grounds the page in task friction and evidence. GOV.UK grounds it in clear user need statements and scope.

### Job

Turn messy research into a clear problem, success criteria, and design direction.

### Layout

Opening block:

- one-sentence problem frame

Three-column row:

- User
- Need
- Barrier

Supporting panels:

- Evidence
- Success criteria
- Constraints
- Principles
- What not to do

### Starter Body Shape

```md
<!-- life:template-archetype=problem-frame -->

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
```

## Archetype 3: Concept Review

### Source Grounding

d.school and IDEO inform the divergent concept space. NN/g keeps concepts judged by usability and task clarity, not novelty alone. Apple HIG and Material inform platform fit and interaction realism.

### Job

Compare solution directions and decide what should move into wireframes or prototypes.

### Layout

Top area:

- concept goal
- user problem addressed

Main comparison:

- concept cards or columns
- strengths
- risks
- evidence
- platform notes

Decision area:

- selected direction
- tradeoffs
- prototype next steps

### Starter Body Shape

```md
<!-- life:template-archetype=concept-review -->

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
```

## Archetype 4: Testing Review

### Source Grounding

NN/g informs observed behavior, severity, frequency, and usability findings. WCAG adds accessibility review alongside usability, not after it. GOV.UK keeps findings practical and action-oriented.

### Job

Convert critique or testing into decisions and changes.

### Layout

Top summary:

- what was tested
- who or what source was involved
- biggest issue
- confidence level

Main layout:

- left: participant/session notes or critique notes
- right: issues grouped by severity
- lower: recommended changes and retest items

Accessibility region:

- keyboard/focus
- contrast
- labels
- error clarity
- motion/reduced motion

### Starter Body Shape

```md
<!-- life:template-archetype=testing-review -->

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
```

## Archetype 5: Case Study Draft

### Source Grounding

Portfolio case study norms define the story arc. Double Diamond gives the overall progression. NN/g and GOV.UK influence the evidence standard: claims need support, and the story should be clear.

### Job

Turn project work into a publishable narrative without losing the evidence behind it.

### Layout

Top hero:

- project summary
- role
- timeframe
- outcome

Story bands:

- challenge
- research and insight
- key decisions
- solution
- evidence
- reflection

Visual slots:

- hero image
- before/after
- process snapshots
- final screens
- quote or metric callouts

### Starter Body Shape

```md
<!-- life:template-archetype=case-study-draft -->

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
```

## UI Requirements

The first implementation can use markdown bodies, but the design direction should assume visual rendering later.

Short-term markdown requirements:

- headings should feel like page structure, not instructions
- tables should be used only for comparison or summary
- text should be concise and editable
- placeholder lines should be sparse
- screenshot slots should be plain text prompts, not fake image boxes
- a read/preview mode renders the body with the existing markdown path, but the implementation must strip Life metadata comments before rendering
- edit mode must also hide Life metadata comments from the textarea; the marker is stored with the page body but is not user-facing
- rendered markdown must not allow raw pasted HTML to execute; wrap shared `MarkdownCard` output in DOMPurify before using `dangerouslySetInnerHTML`
- archetype identity is encoded as a Life metadata comment in the stored body, not a new `project_pages` column
- starter bodies should not include an H1 because `ProjectPages` already has a separate page title field

Future visual rendering requirements:

- page archetypes render as structured surfaces, not one raw textarea
- visual blocks support screenshots, quote callouts, comparison regions, decision blocks, and severity rows
- editing remains direct and low-friction
- template blocks can be deleted or collapsed
- no heavy onboarding text inside the page
- pages without archetype metadata fall back to the plain sanitized markdown view

## Interaction Requirements

- Adding templates should create fewer pages (Phase 1: one strong page per section).
- The user should be able to invoke the template library again after adding sections (already supported).
- Added sections should stay disabled/marked in the template-selection UI (already supported via name match).
- The page sidebar should stay short enough to scan.
- A page should be useful even if only the first two sections are filled out.
- Tab order (Pages → Tasks → References → Events) is already correct; no change needed.

## Visual Quality Requirements

Apply the existing Life visual language, but make the pages feel more like quiet work surfaces:

- restrained dark panels
- subtle image outlines
- dividers for dense document sections
- no loud colored blocks except small status rails or accents
- typography with balanced headings and readable body line length
- explicit hover/focus affordances for controls
- no card-inside-card layouts

## Out of Scope

- full Notion-style block editor in the first pass
- collaborative cursors or multi-user editing
- citation-heavy learning library inside the UI
- automatic UX scoring
- automatic source attribution per block
- cross-section archetype deduplication
- a new `project_pages` metadata column (archetype lives in a stored body metadata comment)
- rebuilding project-level Studio attachment (`StudioItemRecord.project_slug` already exists)

## Success Criteria

The new templates are successful if:

- a newly created UX project has fewer, clearer pages
- opening a template page feels like opening a useful workspace
- the page body gives visual shape before the user writes anything
- the copy feels natural, not academic
- evidence, decisions, and next actions are visible together
- the system feels designed for one person doing real UX work
