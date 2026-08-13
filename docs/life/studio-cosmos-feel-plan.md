# Studio gallery — Cosmos-style feel

Reference: media-library app video (justified grid, fluid zoom reflow, shared-element open/close, image zoom in detail view, pannable Canvas mode with Grid/Canvas pill).

Current state (already shipped this session): justified flex grid driven by `--studio-row` + per-tile `--ar` vars, zoom slider pill, aspect ratios measured on img load, Supabase host allowed in `next.config.ts` images, PhotoLightbox open/close symmetry fixes (photography pages keep PhotoLightbox as-is).

## Scope

### 1. Animated grid reflow (FLIP)
- `components/life/studio/StudioClient.tsx`: wrap tiles in `motion.article` with `layout` inside a `LayoutGroup` (motion/react is already a dependency).
- Remove the `height`/`flex-basis` CSS transitions from `.life-studio-tile` in `app/globals.css` — motion owns movement; CSS transitions fight FLIP.
- Zoom inputs: existing slider (range 150–400) + `ctrl/cmd+wheel` (trackpad pinch arrives as ctrl+wheel) on the board surface; non-passive listener, `preventDefault`, clamp, direct state update. Layout animations animate the reflow.
- Spring config: snappy, no bounce overload (e.g. `{ type: 'spring', stiffness: 320, damping: 34 }`) — same transition for all tiles.

### 2. Shared-element morph open/close (studio only)
- Tile image wrapper: `motion.div layoutId={"studio-img-" + item.id}`.
- New detail overlay inside StudioClient (or sibling component in same file/folder): backdrop fade + `motion.div` with the same `layoutId` → morph out of the tile on open, back into it on close. Wrapped in `AnimatePresence`.
- Replace `PhotoLightbox` usage in StudioClient with this overlay. Do NOT touch PhotoLightbox itself (photography pages use it).
- Detail view chrome (match life dark theme, mono/caps): title top-center, meta under it, index counter, prev/next (buttons + arrow keys), delete, close = click anywhere / Esc / close button. Nav between images: simple crossfade or morph — implementer's call, whichever is glitch-free.

### 3. Image zoom in detail view
- On the opened image: ctrl/cmd+wheel & pinch → zoom 1×–4× toward cursor; drag to pan when > 1×; double-click toggles 1× ⇄ 2× at point; plain wheel pans when zoomed.
- Transform (scale + translate) on an inner motion.div; clamp pan so the image can't be lost off-screen.
- Small ×N.N indicator bottom-right (reuse `.life-studio-zoom` styling).
- Zoom resets on prev/next and on close. If zoomed when closing: reset first (fast), then morph back — avoids morphing from a zoomed rect.

### 4. Canvas mode
- Bottom-center fixed pill: `Grid | Canvas` (life theme segmented control). Persist choice in localStorage.
- Same tile elements/keys in both modes so `layout` animates the Grid ⇄ Canvas switch:
  - Grid mode: current justified flex styles.
  - Canvas mode: container `.life-studio-canvas` (overflow hidden, cursor grab) with inner `.life-studio-plane` (transform: translate+scale); tiles `position: absolute` at `left/top` from a position map, width ~ `240 * ar`px.
- Positions: from `item.x`/`item.y` when set; otherwise deterministic scatter (seeded by index, loose clusters, no overlap chaos). Only persisted after the user drags an item.
- Pan: pointer-drag on empty canvas → translate; wheel pans; ctrl/cmd+wheel zooms plane 0.3–2 toward cursor. Grid zoom slider hidden in canvas mode.
- Item drag: motion drag; on drag end convert viewport delta to plane coords (divide by plane scale), optimistic update + PATCH, rollback on error (see optimistic pattern in ProjectWorkspace/ProjectPages).
- Basic touch: single-finger drag pans / moves items, two-finger pinch zooms (pointer events). Good enough > perfect.

### 5. API: PATCH /api/life/studio/[itemId]
- Add `PATCH` to `app/api/life/studio/[itemId]/route.ts` accepting `{ x?: number; y?: number }` (finite numbers only; reject empty update).
- Follow `app/api/life/entries/[entryId]/route.ts` PATCH exactly: `isAuthenticatedLifeRequest` guard, ownership check via `user_id = OWNER_ID`, supabase update, return `{ item }`.

### Out of scope
- Infinity mode (endless repeating wall).
- Storing width/height at upload time (client-side measurement covers it).
- PhotoLightbox / photography pages changes.

## Verification
1. `npx tsc --noEmit` clean.
2. Dev server + login: POST `/api/admin/login` with `{"password": $ADMIN_PASSWORD from .env.local}` and header `origin: http://localhost:<port>`; use returned `portfolio_admin_session` cookie.
3. Seed 6 test images with varied aspect ratios via `POST /api/life/studio/upload` (multipart `file`), then in browser: zoom reflow animates (no snapping), morph open/close both ways, image zoom/pan/double-click in detail, canvas pan/zoom, item drag persists x/y across reload (PATCH 200), Grid⇄Canvas switch animates.
4. Delete all seeded test items via `DELETE /api/life/studio/<id>` when done — they land in the real Supabase.
5. No console errors; mobile viewport sanity check (pill visible, grid usable).
