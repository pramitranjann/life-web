-- Projects become first-class, editable records (add/delete from the UI) plus
-- a per-project references store (links, notes, image uploads) and a stable
-- project↔calendar-event mapping that survives the destructive Google sync.

create table if not exists projects (
  slug        text primary key,
  name        text not null,
  summary     text,
  color       text,
  aliases     text[] not null default '{}',
  status      text not null default 'active',  -- 'active' | 'on_hold' | 'done'
  target_date date,                            -- optional deadline for the countdown
  archived    boolean not null default false,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists projects_archived_idx on projects (archived);

-- Milestones / phases: named stages within a project, each with a target date.
create table if not exists project_milestones (
  id            uuid primary key default gen_random_uuid(),
  user_id       text not null default 'owner',
  project_slug  text not null references projects(slug) on delete cascade,
  name          text not null,
  target_date   date,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists project_milestones_project_idx on project_milestones (project_slug, sort_order);

-- Tasks can optionally roll up under a milestone. Cleared (not deleted) if the
-- milestone goes away, so the task drops back to the project backlog.
alter table if exists tasks
  add column if not exists milestone_id uuid references project_milestones(id) on delete set null;

create index if not exists tasks_milestone_id_idx on tasks (milestone_id);

-- Seed the projects that were previously hardcoded in lib/life/projects.ts so
-- existing task/entry rows keep resolving to a real project.
insert into projects (slug, name, summary, color, aliases, sort_order) values
  ('swipey', 'Swipey', 'Mobile admin design work and related execution.', '#e9b765', array['swipey','swipy'], 0),
  ('albers', 'ALBERS', 'The macOS color-theory tool and surrounding product work.', '#7fd899', array['albers'], 1),
  ('robin', 'Project Robin', 'The survey platform, research system, and stakeholder work.', '#9aa6ff', array['robin','project robin'], 2),
  ('scad', 'SCAD', 'Coursework, deadlines, and school-related admin.', '#e58fb8', array['scad','class','classes','assignment','studio'], 3),
  ('ops', 'Ops', 'Personal admin, logistics, and operational maintenance.', '#6fcfd6', array['admin','ops','operation','travel','visa','rent','bills'], 4),
  ('health', 'Health', 'Training, recovery, health appointments, and physical maintenance.', '#c79bff', array['lift','lifting','gym','workout','health','doctor','recovery'], 5)
on conflict (slug) do nothing;

-- References: links, freeform notes, and uploaded images pinned to a project.
create table if not exists project_refs (
  id            uuid primary key default gen_random_uuid(),
  user_id       text not null default 'owner',
  project_slug  text not null references projects(slug) on delete cascade,
  kind          text not null default 'link',   -- 'link' | 'note' | 'image'
  title         text,
  url           text,                            -- external link or public storage URL
  body          text,                            -- note text / caption
  storage_path  text,                            -- object path for uploaded images
  created_at    timestamptz not null default now()
);

create index if not exists project_refs_project_idx on project_refs (project_slug, created_at desc);

-- Stable mapping of calendar events to a project. Kept separate from
-- calendar_events because that table is wiped and re-pulled on every Google
-- sync; the Google event id is stable, so this association survives.
create table if not exists project_events (
  project_slug  text not null references projects(slug) on delete cascade,
  event_id      text not null,
  user_id       text not null default 'owner',
  created_at    timestamptz not null default now(),
  primary key (project_slug, event_id)
);

create index if not exists project_events_event_idx on project_events (event_id);

-- Public bucket for uploaded project reference images. Server uploads use the
-- service-role key (bypasses RLS); public read lets the <img> tags resolve.
insert into storage.buckets (id, name, public)
values ('project-refs', 'project-refs', true)
on conflict (id) do nothing;
