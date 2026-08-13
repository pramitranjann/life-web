alter table if exists projects
  add column if not exists parent_slug text references projects(slug) on delete set null;

create index if not exists projects_parent_slug_idx on projects (parent_slug, sort_order);

create table if not exists project_pages (
  id            uuid primary key default gen_random_uuid(),
  user_id       text not null default 'owner',
  project_slug  text not null references projects(slug) on delete cascade,
  title         text not null default 'Untitled',
  body          text not null default '',
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists project_pages_project_idx on project_pages (project_slug, sort_order, updated_at desc);
