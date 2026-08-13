---
project: Life
status: building
platforms: [web, mobile-web]
tokens: app/globals.css
figma: none
updated: 2026-08-13
---

# DESIGN.md — Life

Inherits `~/agent-system/core/DESIGNER.md`. Only deviations and specifics below.

## Intent
Life is a dense, private operating console: near-black ground, hairline structure, mono information labels, and one signal-red accent. Its defining move is that each surface behaves like a dedicated instrument while sharing one compact shell and interaction kit.

## Source of truth
| Area | Lives in | Wins conflicts |
|---|---|---|
| Tokens and responsive rules | `app/globals.css` | code |
| Shipped screens | `app/**`, `components/life/**` | code |
| Future screens | this file plus existing primitives | `DESIGN.md` |

## Tokens
**Color:** All semantic colors are `--life-*` variables on `.life-shell` in `app/globals.css`; they never belong on `:root`. Signal red is reserved for action, active state, and time/current-position signals.
**Type:** `--font-mono` is DM Mono for labels and data; `--life-display` is Clash Display for titles. Use only `--t-micro` through `--t-title`; 10px is the floor.
**Spacing:** Use `--s-1` through `--s-6` and the shared `--life-gutter`. At phone widths `.content-shell` alone owns the outer horizontal gutter.
**Radius:** Life is square. Do not add rounded cards, pills, dialogs, or inputs; circles remain valid for dots, checks, and timeline markers.
**Depth:** Hairline borders and background shifts provide structure. Shadows are limited to genuine floating surfaces defined by the existing popover/modal rules.
**Motion:** Existing `--life-ease-out` arrivals and accelerated exits are authoritative. Spatial drag/reorder uses Motion; frequent controls stay quiet. Press states use `scale: 0.96` where already established.

## Layout
Desktop is full-width with `--life-gutter`, not a centered max-width dashboard. Work surfaces use internal panes and scrolling where defined. At `<=699px`, the shell becomes capture-first and the bottom navigation owns primary movement.

## Components
| Component | Lives in | The rule |
|---|---|---|
| `LifeHeader` | `components/life/LifeHeader.tsx` | One grouped navigation model; phone groups open before routing. |
| `LifePopover` | `components/life/ui/LifePopover.tsx` | Stays mounted through its exit; never replace with instant mount/unmount. |
| `LifeHoverCard` | `components/life/ui/LifeHoverCard.tsx` | One preview card for events, tasks, and people; the card root is the action. |
| `LifeConfirm` | `components/life/ui/LifeConfirm.tsx` | Use for destructive confirmation instead of browser dialogs. |
| `LifeToast` | `components/life/ui/LifeToast.tsx` | Mutation feedback uses the shared toaster. |
| `LifeRichEditor` | `components/life/ui/LifeRichEditor.tsx` | Project pages edit inline; do not add a separate read/edit mode. |
| `LifeEventDialog` | `components/life/ui/LifeEventDialog.tsx` | Calendar fields remain one compact horizontal desktop dialog. |
| `LifeTodoList` | `components/life/ui/LifeTodoList.tsx` | Reuse the sortable item/check pattern for task lists. |

## Screen patterns
Today is capture-first on phone and a two-column operating console on desktop. Projects use hierarchy-aware rows and a workspace rail, not a card grid. Studio is a visual board with compose controls on demand. Lists keep real metadata visible rather than hiding context to achieve sparsity.

## Interaction
Every control needs hover and `focus-visible`; destructive actions require confirmation. Loading uses `LifeSkeleton`, empty results use `LifeEmpty`, and mutations report through `LifeToast`. Portaled surfaces must carry explicit Life colors because `--life-*` variables are scoped to `.life-shell`.

## Blacklist additions
- No Vercel/portfolio navigation, copy providers, analytics, or visual tokens.
- No dashboard-of-cards replacement for Projects or Today.
- No second accent color and no decorative gradients.
- No broad selectors that change desktop and phone together without checking both contracts.
- No new one-off font sizes or spacing values outside the Life scales.

## Assumptions
None. Rules were extracted from the shipped Life stylesheet and components on 2026-08-13.
