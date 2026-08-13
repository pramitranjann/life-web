# Life Projects — Notion-Feel Refinement Plan

Date: 2026-07-02
Status: planning target
Audience: Codex implementation

## Goal

Make the Life Projects surface feel like a calm, delightful workspace instead of a UI wrapper over tsx files and database columns. The target reference is Notion's *feel* — quiet hierarchy, content-first pages, metadata that stays out of the way, and smooth interactions — adapted to the existing Life visual language.

## Design constraint (read first)

Do **not** re-skin Life into Notion's look. The Notion feel here is about **structure and interaction, not typography or color.**

Keep intact:
- The existing type system: `--font-mono` (DM Mono) for labels/controls, `--life-display` (Clash Display) for headings. Do not introduce a new sans font or swap mono out — it is the deliberate house style used across the whole Life shell.
- The dark palette and existing CSS tokens (`--life-panel`, `--life-border`, `--life-hairline`, `--life-muted-bg`, `--life-accent`, `--life-accent-soft`, `--life-accent-line`, `--life-label`, `--life-muted`, `--life-text`).
- The color-dot as the project/section identity marker.

Explicitly rejected:
- **Emoji / icon per page or project.** Does not fit the Life aesthetic. The existing color dot is the identity cue.

So "Notion feel" = calmer hierarchy, less visible chrome, whitespace over borders, and smoother interactions — inside the current DM Mono / Clash Display / dark theme.

## Why it feels janky today (verified against code)

The project workspace stacks seven control bands before any content appears (`components/life/projects/ProjectWorkspace.tsx:188-456`):

1. Back-links row
2. Editable name + summary
3. A loud right-side control cluster: health dot + two `segmented` toggles (General/UX, status) + deadline pill + delete button (`ProjectWorkspace.tsx:255-293`)
4. Progress bar row
5. Next-action callout
6. Sections/sub-projects block (count, add, template grid, create form, children grid)
7. Tabs + tab body

Root causes:

- **Database columns are exposed as loud always-on controls.** `project_kind` and `status` are `segmented` button groups pinned to the header (`ProjectWorkspace.tsx:257-280`). The schema is the UI.
- **Hard-bordered rectangles everywhere.** `1px solid var(--life-border)` boxes on children cards, next-action, panels, and tabs create a wireframe/admin look. Notion leans on whitespace and hover states, with hairlines only where structurally needed.
- **Button-driven mutations with full refreshes.** Every mutation calls `router.refresh()` (`ProjectWorkspace.tsx:102`), re-rendering the whole tree and causing visible flashes. Pages still use an explicit Edit/Save mode (`ProjectPages.tsx:132-167`).
- **Almost no motion.** Tab switches are instant swaps; most controls have no transition.

## Phase 1: Collapse the header into a quiet property row

### Scope
`components/life/projects/ProjectWorkspace.tsx`, `app/globals.css`.

### Work
1. Replace the loud right-side control cluster (two `segmented` groups + deadline pill + health dot) with a single quiet **property row** placed directly under the title/summary. It should read like muted metadata text, e.g.:
   `● Active · UX · Due Aug 12 · 3 open · 2 overdue`
2. Each property opens its editor on click (small popover/menu or inline select), instead of being a permanently visible toggle bank:
   - Status → menu of `STATUS_OPTIONS`.
   - Kind (General/UX) → menu of the two options.
   - Deadline → the existing `LifeCalendar` popover (already anchored via `dateBtnRef`).
3. Keep the color dot and health tone, but render them inline in the property row (small, muted), not as a separate floating dot cluster.
4. Move the Delete action out of the header into an overflow (`…`) menu on the property row.
5. Keep name and summary inline-editable exactly as they are today (that interaction is already good).

### Acceptance
- The header is title + summary + one quiet property line — no visible segmented button banks.
- All properties remain editable in one or two clicks.
- `npm run build` passes.

## Phase 2: De-border and spacing pass

### Scope
`app/globals.css` (project workspace + overview + children + tabs sections), no logic changes.

### Work
1. Remove hard `1px solid var(--life-border)` boxes from: children cards, next-action callout, and stacked panels. Replace with whitespace + hover background (`--life-muted-bg`) + a single hairline divider only between major sections.
2. Keep borders only where they carry meaning: the active-page left accent rail, table cells, and focus states.
3. Increase vertical rhythm between the remaining bands so the page breathes (Notion uses generous spacing, not dense stacking).
4. Constrain the workspace content to a comfortable max reading width, consistent with the page reader (`life-project-page-reader` already uses ~860px).
5. Fold Progress and Next-action into the quiet zone near the property row rather than presenting them as full-width bordered bands.

### Acceptance
- No boxes-in-boxes; sections are separated by space and hairlines, not nested borders.
- Layout reads calmer and more content-first while staying on the existing dark theme.
- Mobile layout remains usable.

## Phase 3: Motion and interaction smoothness

### Scope
`ProjectWorkspace.tsx`, `ProjectPages.tsx`, `app/globals.css`.

### Work
1. Add consistent transitions on hover/active/focus for tabs, property row controls, and children cards (extend the pattern already on `life-project-page-link`).
2. Crossfade or slide the tab body on tab change instead of an instant swap.
3. Add subtle enter transitions for popovers/menus (status, kind, overflow).
4. Respect `prefers-reduced-motion` — disable non-essential motion under it.

### Acceptance
- Tab and menu interactions feel smooth, not abrupt.
- No motion under `prefers-reduced-motion`.

## Phase 4: Optimistic updates and autosave

### Scope
`ProjectWorkspace.tsx`, `ProjectPages.tsx`.

### Work
1. Make project mutations optimistic: update local state immediately, PATCH in the background, reconcile on response. Remove blanket `router.refresh()` calls that cause full-tree flashes; refresh only what changed (or rely on local state).
2. On pages, remove the explicit Edit/Save mode ceremony:
   - Autosave the body on debounce + on blur.
   - Replace the Save button with a quiet `Saved / Saving…` status text.
   - Keep the read view (`MarkdownCard`); clicking into it enters edit at that spot.
3. Guard against losing unsaved edits when switching pages (autosave-on-switch).

### Acceptance
- Editing a status, kind, deadline, name, summary, or page body does not flash the whole workspace.
- Pages have no Save button; changes persist automatically.
- No data loss when switching pages mid-edit.

## Phase 5 (north star — optional, do only if requested)

### Scope
New persistent navigation.

### Work
- Add a collapsible left sidebar tree: Projects → Project → Sections → Pages, mirroring Notion's folder/page navigation. This is the real structural upgrade for the "folders and projects" mental model.

### Note
This is a genuine build, not a polish pass. Do not start it as part of the feel refinement. Park it until the flat back-link + children-grid navigation actually gets in the way.

## Verification

1. `npm run build`.
2. Open an existing project and a UX project locally.
3. Confirm the header is a title + quiet property row, all properties still editable.
4. Confirm no full-page flash when editing status/kind/deadline/name/summary or a page.
5. Confirm pages autosave with no Save button and no lost edits on switch.
6. Check desktop and phone layouts.
7. Confirm the mono/display type system and dark palette are unchanged.

## Implementation order

1. Phase 1 (header declutter) — biggest perceived-quality jump.
2. Phase 2 (de-border/spacing) — mostly CSS, low risk.
3. Phase 3 (motion).
4. Phase 4 (optimistic + autosave).
5. Phase 5 only on explicit request.

## Non-goals

- New fonts, light theme, or a Notion-style color scheme.
- Emoji / per-page icons.
- A full block editor or slash-command menu (already a non-goal in the template plan).
- Drag-to-reorder pages/sections.
- Persistent sidebar tree (Phase 5) unless explicitly requested.
- Any change to the projects data model or API routes beyond what optimistic updates require.

## Expected final state

Opening a project should feel like opening a Notion page: the title and content lead, metadata sits quietly in one editable line, sections and pages are separated by space rather than boxes, and every edit lands instantly without a reload — all within the existing Life dark/mono/display aesthetic.
