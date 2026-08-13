-- Rolodex, second pass: the person page grew fields 008 never allocated —
-- email, phone, links, likes and dislikes were being collected by the UI and
-- had nowhere to land. All additive; nothing existing changes.
--
-- links is jsonb because a link is a pair ({label, url}) and there can be
-- several; likes/dislikes are text[] because they are flat tags. Both default
-- to empty rather than null, so readers never branch on "missing vs empty".

-- `how` joins the existing `why`: 008 had one free-text field, but the person
-- page asks two different questions — how you know someone (fixed history) and
-- what you want from the relationship (a live intention). Collapsing them into
-- one column made the page show the same sentence under two labels.
--
-- Safe to re-run: every clause is `if not exists`.

alter table if exists people
  add column if not exists email     text,
  add column if not exists phone     text,
  add column if not exists how       text,
  add column if not exists links     jsonb   not null default '[]'::jsonb,
  add column if not exists likes     text[]  not null default '{}',
  add column if not exists dislikes  text[]  not null default '{}';
