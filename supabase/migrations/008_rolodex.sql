-- Rolodex: a professional-relationship layer. People are first-class records
-- with a contact cadence; interactions are the dated log of how each
-- relationship actually moved. Follow-ups ride on the existing tasks table.
-- Ownership matches every other Life table: user_id text default 'owner',
-- accessed through the service-role client (no per-row RLS policies).

create table if not exists people (
  id            uuid primary key default gen_random_uuid(),
  user_id       text not null default 'owner',
  name          text not null,
  role          text,
  relationship  text not null default 'contact',  -- mentor|professor|alumni|recruiter|founder|collaborator|contact
  why           text,                             -- why this person matters
  channel       text,                             -- how we usually talk (email, LinkedIn, …)
  cadence_days  int,                              -- optional "stay in touch every N days"
  archived      boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists people_archived_idx on people (archived);

-- The dated log of contact with a person. project_slug references projects the
-- same way studio_items does: cleared (not deleted) if the project goes away.
create table if not exists interactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       text not null default 'owner',
  person_id     uuid not null references people(id) on delete cascade,
  local_date    date not null,
  kind          text not null default 'note',     -- met|call|message|showed_work|note
  summary       text not null,
  project_slug  text references projects(slug) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists interactions_person_idx on interactions (person_id, local_date desc);

-- Follow-up tasks link back to a person. Cleared (not deleted) if the person
-- goes away, so the task drops back to a plain task.
alter table if exists tasks
  add column if not exists person_id uuid references people(id) on delete set null;

create index if not exists tasks_person_id_idx on tasks (person_id);
