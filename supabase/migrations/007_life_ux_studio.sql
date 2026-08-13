alter table if exists projects
  add column if not exists project_kind text not null default 'general';

create index if not exists projects_project_kind_idx on projects (project_kind, archived);

create table if not exists studio_items (
  id            uuid primary key default gen_random_uuid(),
  user_id       text not null default 'owner',
  kind          text not null default 'image',
  title         text not null,
  body          text,
  url           text,
  storage_path  text,
  width         int,
  height        int,
  x             double precision,
  y             double precision,
  tags          text[] not null default '{}',
  project_slug  text references projects(slug) on delete set null,
  board_id      uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists studio_items_user_created_idx on studio_items (user_id, created_at desc);
create index if not exists studio_items_kind_created_idx on studio_items (kind, created_at desc);
create index if not exists studio_items_project_created_idx on studio_items (project_slug, created_at desc);

insert into storage.buckets (id, name, public)
values ('studio-items', 'studio-items', true)
on conflict (id) do nothing;
