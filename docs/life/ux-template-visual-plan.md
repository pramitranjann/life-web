# Life UX Visual Template Implementation Plan

Date: 2026-07-02
Status: planning target

## Goal

Replace the current text-heavy UX starter pages with fewer visual page archetypes grounded in practical UX process.

This plan keeps Life Projects as the execution container and does not expand Studio. Studio remains the visual capture surface; UX templates are for structured project work.

## Codebase notes (verified before planning)

These constraints come from the current code and shape the phases below:

- `lib/life/ux-templates.ts` builds every page through a `worksheet()` helper that emits `Purpose`, `Use this page when`, `Gather before starting`, and `Leave this page with`. This is the scaffolding to remove.
- `applyUxTemplateSections()` creates one **child project per section**, then one page per template page inside it. Each section is its own child project, not a page under a shared parent.
- `project_pages` has no metadata column. `ProjectPageRecord` and `createProjectPage()` only handle `title` and `body`. Archetype metadata must live in the stored body as a Life metadata comment unless we add a migration, which this plan avoids.
- `components/life/MarkdownCard.tsx` already renders GFM markdown via `marked`. `marked` v17 does not sanitize raw HTML, so the implementation should add `isomorphic-dompurify` and sanitize the shared markdown output once inside `MarkdownCard`.
- Project pages currently edit in a raw `<textarea>` (`ProjectPages.tsx`) with no view mode.
- The workspace tab order is already Pages → Tasks → References → Events (`ProjectWorkspace.tsx`). No change needed.
- `StudioItemRecord` already has `project_slug`, so project-level attachment exists. Only page/section-level attachment is new.

## Phase 1: Simplify Template Content

### Scope

Update `lib/life/ux-templates.ts` so template sections create fewer, stronger pages.

### Work

1. Remove the `worksheet()` helper and its instructional output (`Purpose`, `Use this page when`, `Gather before starting`, `Leave this page with`) from template bodies.
2. Define the five archetype body builders:
   - `researchBoardBody()`
   - `problemFrameBody()`
   - `conceptReviewBody()`
   - `testingReviewBody()`
   - `caseStudyDraftBody()`
3. Replace many narrow pages with one primary archetype page per section.
4. Keep titles clear and natural:
   - `Research board`
   - `Problem frame`
   - `Concept review`
   - `Testing review`
   - `Case study draft`
5. Use markdown that visually suggests layout:
   - tables for comparison
   - quote blocks for quotes
   - short headings
   - sparse bullets
   - screenshot/reference placeholders
6. Do not include an H1 in the body. The page title field already carries the page name.
7. Prefix stored archetype bodies with a metadata comment, for example `<!-- life:template-archetype=research-board -->`.

### Acceptance

- Template-created sections no longer generate long page lists.
- Page bodies do not include `Purpose`, `Use this page when`, or similar instructional scaffolding.
- The resulting pages feel closer to Notion starter pages than UX worksheets.
- `npm run build` passes.

## Phase 2: Page UI Refinement

### Scope

Make existing project pages read like documents without building a block editor. Reuse the existing `MarkdownCard` component for rendering, after making that shared markdown renderer safe.

### Work

1. Add `isomorphic-dompurify` and wrap the shared `MarkdownCard` output after `marked.parse()`.
2. Add a small page-body metadata helper that can:
   - extract `life:template-archetype`
   - remove Life metadata comments for preview
   - remove Life metadata comments for textarea editing
   - merge the stored metadata comment back into the body on save
3. Add a view mode to `ProjectPages.tsx` that renders the display body with `MarkdownCard`, with edit mode one click away.
4. Keep edit mode immediately accessible; the raw textarea stays as the edit surface for v1, but it receives the user-facing body with metadata removed.
5. Make the page list scan better:
   - fewer previews
   - stronger selected state
   - compact titles

### Acceptance

- Template pages read like structured pages instead of raw code-like markdown.
- Editing remains quick.
- The page sidebar does not become the main cognitive burden.
- Mobile layout remains usable.
- No new markdown dependency is added.
- Life metadata comments do not show in preview or edit mode.
- Saving an edited archetype page preserves its stored metadata comment unless the page is converted to a normal page intentionally.
- Raw pasted HTML cannot execute in any `MarkdownCard` usage, including existing Life report/home surfaces.

## Phase 3: Visual Archetype Renderer

### Scope

Introduce a lightweight renderer for UX archetype pages. This is the real fix for built-in visuals.

### Work

1. Encode `template_archetype` in the stored page body as a Life metadata comment. Do not add a `project_pages` column for v1.
2. Create a renderer for each archetype:
   - Research Board
   - Problem Frame
   - Concept Review
   - Testing Review
   - Case Study Draft
3. Render visual regions:
   - summary strip
   - two-column evidence/interpretation sections
   - screenshot/reference slots
   - quote callouts
   - comparison tables
   - decision callouts
   - severity rows
4. Keep the markdown body as the editable source of truth for v1.
5. Do not create a full Notion clone.

### Acceptance

- Opening a template page shows an actual visual layout.
- The user can still edit the underlying content without fighting the UI.
- Visual regions remain restrained and work-focused.
- The renderer handles incomplete pages gracefully.
- Non-template pages (no archetype metadata comment) fall back to the Phase 2 markdown view.

## Phase 4: Studio Attachment

### Scope

Connect Studio visuals to UX template pages without merging Studio and Projects. Project-level attachment via `StudioItemRecord.project_slug` already exists; this phase adds page/section-level attachment.

### Work

1. Add page/section-level attachment for Studio items (new field or join; project-level `project_slug` already works).
2. Let pages show attached Studio images as a reference strip or evidence gallery.
3. Keep image titles hidden until opened, matching the existing Studio direction.
4. Use the existing photography-style spotlight for image inspection.

### Acceptance

- Research and case study pages can include visual evidence from Studio.
- Studio remains a capture surface.
- Projects remain the execution surface.

## Phase 5: Verification

### Required Checks

1. Run `npm run build`.
2. Create or inspect a UX project locally.
3. Add template sections.
4. Confirm the page count stays low.
5. Confirm each page body is readable and useful before editing.
6. Confirm pages are still editable and save correctly.
7. Check desktop and phone layouts for the project workspace.

## Implementation Order

Recommended order:

1. Phase 1
2. Phase 2
3. Phase 3
4. Phase 4

Reasoning:

- Phase 1 fixes the current user-facing problem quickly.
- Phase 2 makes those pages feel better inside the existing UI, while fixing markdown sanitization once in `MarkdownCard`.
- Phase 3 is the correct long-term visual-template model.
- Phase 4 connects visual evidence once page archetypes are stable.

### Dropped from the earlier draft

- **Cross-section archetype dedup.** The earlier draft proposed skipping duplicate archetypes "in the same child project," but each section is already its own child project, so within one project there is only one archetype page. Duplication only occurs across separate section-projects, which the child-per-section model treats as intentional. Phase 1 (one strong page per section) removes the flood without this. Name-based section dedup already exists in `applyUxTemplateSections()`.
- **Tab order work item.** The workspace already renders Pages → Tasks → References → Events.
- **`template_archetype` DB column.** Replaced with a stored body metadata comment to avoid a Supabase migration and keep the markdown body as source of truth.

## Risks

### Risk: Markdown cannot provide enough visual structure

Mitigation: Use markdown only as the short-term format, and plan the visual renderer (Phase 3) as the real solution.

### Risk: Too few pages lose methodological coverage

Mitigation: Put methodology inside page regions, not separate pages. For example, Testing Review can include observed behavior, severity, accessibility checks, and changes in one surface.

### Risk: Template pages become too decorative

Mitigation: Follow source-grounded layout rules: evidence near decisions, plain language, restrained visuals, no decorative cards.

### Risk: Existing user-created pages are disrupted

Mitigation: Do not migrate or delete existing pages automatically. New template behavior applies only when adding templates after the change. Metadata-comment archetype detection must fall back gracefully for pages without it, and the edit helper must preserve existing metadata when saving.

### Risk: Metadata comments leak into the editing experience

Mitigation: Treat metadata as stored implementation detail. Strip it for preview and textarea display, then merge it back on save.

### Risk: Sanitization scope expands beyond templates

Mitigation: This is intentional. `MarkdownCard` is already used outside project templates, so DOMPurify belongs in the shared renderer and should be verified anywhere MarkdownCard is rendered.

## Non-Goals

- replacing all project pages with a block editor immediately
- turning UX templates into a learning course
- adding team collaboration features
- auto-generating case studies
- making Studio the place where UX project execution happens

## Expected Final State

A UX project should feel like this:

- Templates add a small set of strong working pages.
- Each page has a recognizable visual job.
- Research pages collect evidence and patterns.
- Define pages clarify problem and direction.
- Concept pages compare options.
- Testing pages convert observations into changes.
- Case study pages turn work into a portfolio narrative.

The user should spend time doing the work, not managing the template system.
