# Life UX Projects and Studio Spec

Date: 2026-07-01
Status: v1 implementation target

## Product Intent

Life should support two related but separate modes of design-student work:

1. UX-marked Projects are the committed work containers for classes, 10-week design sprints, portfolio pieces, and structured design execution.
2. Studio is the visual inspiration layer for screenshots, images, UI references, moodboards, and visual material before it becomes committed project work.

This keeps the existing Life Projects model as the source of truth for execution while adding a design-school workflow that does not force every raw idea into a full project.

## User Model

The primary user is a UX design student using Life for:

- 10-week class projects run like design sprints.
- Portfolio case studies.
- Research notes and synthesis.
- Moodboards and visual direction.
- UX critiques and product observations.
- Links, screenshots, and references that may later attach to a project.

The user should be able to collect visual material quickly, rearrange it spatially, organize it into boards, and attach the strongest references to structured project work.

## Conceptual Architecture

```text
Life
  Projects
    General Project
    UX Project
      UX template sections
        Research
        Define
        Moodboard
        Prototype
        Testing
        Case Study
      Sub-projects
      Pages
      Tasks
      References

  Studio
    Moodboards
    Visual References
    Screenshots
    Clippings
    References
    Critiques
```

## UX Project Type

Projects receive a project kind:

- `general`: default Life project behavior.
- `ux`: project receives UX-specific affordances, including section templates.

The UX marker should be editable after project creation so existing class projects can become UX projects.

### UX Project Requirements

- A UX project still behaves like a normal project.
- It can have tasks, pages, refs, events, milestones, and nested sub-projects.
- It exposes a UX section/template picker inside the project workspace.
- Template sections are optional and removable via the existing project deletion path.
- Template sections should be represented as child projects where possible, preserving the existing folder-inside-folder mental model.

## UX Template Sections

Template sections are modular blocks that create structured child projects and starter pages.

The first template set:

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

Each template block contains:

- `key`: stable internal identifier.
- `name`: visible section name.
- `phase`: process phase such as Discover, Define, Develop, Deliver.
- `summary`: short explanation of the section.
- `color`: section color.
- `pages`: starter page titles and body prompts.

### Template Behavior

When a user adds template sections:

1. Life checks existing child projects under the current project.
2. Existing child projects with the same section name are skipped.
3. New child projects are created with `parent_slug` set to the UX project.
4. Each child project receives starter pages.
5. The project page refreshes and the new sections appear in the existing sub-project grid.

This preserves the current nested project model and avoids a second hierarchy system.

## Template Sources

The template system should be grounded in:

- NN/g for practical UX process, research methods, usability testing, IA, and heuristics.
- Design Council Double Diamond for project skeleton: Discover, Define, Develop, Deliver.
- Stanford d.school and IDEO for workshop-style human-centered design methods.
- GOV.UK Service Manual for service design, user needs, inclusive services, content, forms, and scope.
- W3C WCAG for accessibility review checks.
- Apple Human Interface Guidelines and Material Design for platform-specific UI critique.
- Portfolio case-study norms: problem, role, constraints, process, decisions, iterations, outcome, reflection.

Life should not present these as rigid academic citations in the UI. They are design inputs for useful templates.

## Studio

Studio is a top-level Life surface at `/life/studio`.

Studio is intentionally visual-first. It must not duplicate the normal Life homepage capture flow.

The homepage capture is for text thoughts and daily input. Studio is for seeing, arranging, and comparing visual inspiration.

### Studio Item Types

- `image`: uploaded image, pasted screenshot, dropped image, or imported file.
- `link`: visual reference URL, Figma link, product page, article, or pattern.
- `moodboard`: a board/canvas containing visual items.
- `critique`: visual/product critique attached to a screenshot or link.
- `note`: short annotation attached to a visual item or board.

### Studio v1 Requirements

- Show a visual board as the primary surface.
- Let the user drag images/files into the Studio space.
- Let the user paste screenshots/images into the Studio space with `Cmd+V`.
- Let the user add images from a local folder/file picker.
- Let the user add a visual link/reference.
- Let the user optionally link a visual item or board to a Life project.
- Store title/caption, URL, tags, item type, optional project slug, storage path, dimensions, position, and created/updated timestamps.
- Display items as a visual masonry/grid board, not a form-first capture list.
- Allow basic item movement/reordering in the board.
- Keep mobile actions visible and text-labeled.

### Studio Future Requirements

These are explicitly out of scope for the first implementation but should be planned:

- Multi-item moodboard canvases.
- Freeform x/y canvas positioning.
- Drag/drop sorting across boards.
- Multi-select and grouping.
- Promote Studio item to project/task/page.
- Attach Studio item to a specific project template section.
- Browser share-sheet style capture.
- Figma link previews.
- Critique templates based on heuristics, WCAG, HIG, and Material.

## Data Model

### Projects

Add:

```sql
project_kind text not null default 'general'
```

Allowed values:

- `general`
- `ux`

### Studio Items

Create `studio_items` with visual-first fields:

```sql
id uuid primary key default gen_random_uuid()
user_id text not null default 'owner'
kind text not null default 'image'
title text not null
body text
url text
storage_path text
width int
height int
x double precision
y double precision
tags text[] not null default '{}'
project_slug text references projects(slug) on delete set null
board_id uuid
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

Indexes:

- `(user_id, created_at desc)`
- `(kind, created_at desc)`
- `(project_slug, created_at desc)`

## API

### Projects

Existing project create/update APIs should accept:

- `projectKind?: 'general' | 'ux'`

### UX Templates

`POST /api/life/projects/[slug]/ux-templates`

Body:

```json
{
  "templateKeys": ["research", "define", "case-study"]
}
```

Response:

```json
{
  "created": [],
  "skipped": []
}
```

### Studio

`GET /api/life/studio`

Returns:

```json
{
  "items": []
}
```

`POST /api/life/studio`

Body:

```json
{
  "kind": "link",
  "title": "Mobile onboarding reference",
  "url": "https://example.com",
  "tags": ["onboarding", "mobile"],
  "projectSlug": "my-project"
}
```

`POST /api/life/studio/upload`

Accepts multipart form data:

- `file`: image file
- `title`: optional caption
- `projectSlug`: optional linked project
- `boardId`: optional board

Returns the created Studio item with public image URL and dimensions when available.

`PATCH /api/life/studio/[itemId]`

Updates:

- title/body/tags/projectSlug
- x/y position
- board assignment

`DELETE /api/life/studio/[itemId]`

Deletes the item and any owned storage object.

## UI

### Projects Overview

When creating a project:

- Add a project kind select.
- Default to General.
- UX Class / Design Sprint marks the project as `ux`.

Cards for UX projects should show a small UX chip.

### Project Workspace

Header:

- Show project kind selector.
- UX projects show a UX chip.

UX Template Section:

- Appears above the sub-projects area only when project kind is `ux`.
- Shows available template blocks.
- Existing child sections are visibly marked as added.
- User can select multiple blocks and add them in one action.
- New blocks appear as sub-projects.

### Studio Page

Layout:

- Header with only essential controls.
- Primary board/grid viewport.
- Drop zone state when dragging files over the page.
- Paste target state when clipboard images are available.
- Compact add menu for:
  - upload images
  - add link
  - create board
- Filters/tabs for:
  - all
  - images
  - links
  - boards
  - critiques

The page should feel like a working tool, not a marketing landing page.

### Studio Interaction Requirements

- Dragging one or more image files over Studio highlights the board.
- Dropping image files uploads them and creates visual items.
- Pressing `Cmd+V` while on Studio reads clipboard images and creates visual items.
- Clicking "Add from folder" opens a file input accepting multiple images.
- Adding a link creates a reference tile; metadata preview can be added later.
- Items can be repositioned/reordered by drag where feasible in v1.
- Empty Studio should still look like a board, not a text capture form.

## Verification

Required before shipping:

- `npm run build`
- Confirm TypeScript accepts new route and component types.
- Confirm `/life/projects` compiles with project kind selector.
- Confirm `/life/projects/[slug]` compiles with UX templates.
- Confirm `/life/studio` compiles.

Browser QA is recommended when a dev server is available:

- Desktop `/life/studio`
- Mobile `/life/studio`
- Desktop UX project workspace
- Mobile UX project workspace
