# Life UX Projects and Studio Implementation Plan

Date: 2026-07-01
Status: v1 execution plan

## Phase 1: Data Foundation

1. Add migration `007_life_ux_studio.sql`.
2. Add `projects.project_kind`.
3. Add `studio_items`.
4. Add indexes for Studio list queries.
5. Update TypeScript types:
   - `ProjectKind`
   - `ProjectRecord.project_kind`
   - `LifeProjectClient.project_kind`
   - `StudioItemKind`
   - `StudioItemRecord`

Acceptance:

- Existing projects default to `general`.
- Existing project reads do not require data backfill beyond the default.
- Studio items can link to projects but survive if a project is deleted.

## Phase 2: Project Kind Plumbing

1. Update `seedProjects()` to include `project_kind: 'general'`.
2. Update `listProjectsClient()` to include project kind.
3. Update `createProject()` to accept `projectKind`.
4. Update `updateProject()` to accept `projectKind`.
5. Update project API routes:
   - `POST /api/life/projects`
   - `PATCH /api/life/projects/[slug]`
6. Update project create UI in `ProjectsOverview`.
7. Update project cards with a `UX` chip.
8. Update `ProjectWorkspace` with project-kind selector.

Acceptance:

- New UX projects can be created.
- Existing projects can be switched between General and UX.
- UX marker is visible in overview and workspace.

## Phase 3: UX Template Blocks

1. Add `lib/life/ux-templates.ts`.
2. Define template blocks:
   - Research
   - Define
   - Moodboard
   - Ideation
   - Wireframes
   - Prototype
   - Usability Testing
   - Iterations
   - Presentation
   - Case Study
3. Add `applyUxTemplateSections(projectSlug, templateKeys)` in server code.
4. Reuse `createProject()` for child sections.
5. Reuse `createProjectPage()` for starter pages.
6. Skip blocks already represented by existing child projects.
7. Add API route:
   - `POST /api/life/projects/[slug]/ux-templates`
8. Add `ProjectUxTemplates` client component.
9. Render it inside `ProjectWorkspace` for UX projects.

Acceptance:

- Selecting template blocks creates sub-project sections.
- Starter pages are created under each new section.
- Re-adding an existing block skips it rather than duplicating it.
- The sub-project grid shows the created sections.

## Phase 4: Studio Foundation

1. Add `lib/life/studio.ts`.
2. Add visual-first Studio item fields:
   - `storage_path`
   - `width`
   - `height`
   - `x`
   - `y`
   - `board_id`
3. Add `GET /api/life/studio`.
4. Add `POST /api/life/studio` for link/reference creation.
5. Add `POST /api/life/studio/upload` for image uploads.
6. Add `PATCH /api/life/studio/[itemId]` for metadata and position changes.
7. Add `DELETE /api/life/studio/[itemId]`.
8. Add `/life/studio/page.tsx`.
9. Add `components/life/studio/StudioClient.tsx`.
10. Add Studio to `LifeHeader` under Workspace.
11. Add CSS for:
   - visual board/grid
   - drop zone state
   - paste/upload affordances
   - compact add controls
   - mobile layout

Acceptance:

- `/life/studio` loads after auth.
- User can drag image files into Studio and see visual tiles.
- User can paste screenshots/images with `Cmd+V`.
- User can add images from a file picker/folder picker.
- User can add a visual link/reference.
- User can optionally assign an item to a project.
- Items render immediately after upload/save.
- Empty Studio does not show a text capture form.

## Phase 5: Documentation and Memory

1. Add spec doc.
2. Add implementation plan doc.
3. Add Codex memory handoff note under `.codex/memories/extensions/ad_hoc/notes`.
4. Include:
   - user intent
   - architecture decisions
   - implemented files
   - verification result
   - follow-up work

Acceptance:

- Future chats can resume without rediscovering the product direction.
- Repo docs explain the design rationale and implementation sequence.

## Phase 6: Verification

1. Run `npm run build`.
2. Fix type/build failures.
3. Report final changed files and verification result.

## Out of Scope for v1

- Full freeform infinite canvas.
- Drag/drop sorting of template sections.
- Promote Studio item to task/page/project.
- Import from Figma.
- Browser share extension.
- Full source-attributed UX learning library in UI.

## Future Plan

1. Add board-level grouping and naming.
2. Add "Attach to project section".
3. Add "Promote to task/page/project".
4. Add Figma preview/import helpers.
5. Add UX critique templates:
   - NN/g heuristics
   - WCAG quick audit
   - HIG check
   - Material check
6. Add 10-week sprint timeline generator:
   - Week 1 Discovery
   - Week 2 Research
   - Week 3 Synthesis
   - Week 4 Define
   - Week 5 Ideation
   - Week 6 Wireframes
   - Week 7 Prototype
   - Week 8 Testing
   - Week 9 Iteration
   - Week 10 Presentation and case study
