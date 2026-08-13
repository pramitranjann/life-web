alter table if exists entries
  add column if not exists project_slug text;

create index if not exists entries_project_slug_idx on entries (project_slug);

create table if not exists tasks (
  id                uuid primary key default gen_random_uuid(),
  user_id           text not null default 'owner',
  title             text not null,
  details           text,
  project_slug      text,
  status            text not null default 'open',
  priority          text not null default 'medium',
  due_local_date    date,
  source_type       text not null default 'manual',
  source_local_date date,
  source_report_id  uuid,
  auto_generated    boolean not null default true,
  fingerprint       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  completed_at      timestamptz
);

create index if not exists tasks_status_idx on tasks (status);
create index if not exists tasks_project_slug_idx on tasks (project_slug);
create index if not exists tasks_due_local_date_idx on tasks (due_local_date);
create index if not exists tasks_source_date_idx on tasks (source_local_date);
create unique index if not exists tasks_user_fingerprint_key on tasks (user_id, fingerprint) where fingerprint is not null;
