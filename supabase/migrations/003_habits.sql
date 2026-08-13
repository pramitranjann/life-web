-- Habits: lightweight daily (or custom cadence) tracking for the Life surface.

create table if not exists habits (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null default 'owner',
  title       text not null,
  cadence     text not null default 'daily',
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists habits_user_idx on habits (user_id);
create index if not exists habits_archived_idx on habits (archived);

create table if not exists habit_logs (
  id          uuid primary key default gen_random_uuid(),
  habit_id    uuid not null references habits (id) on delete cascade,
  user_id     text not null default 'owner',
  local_date  date not null,
  created_at  timestamptz not null default now()
);
create unique index if not exists habit_logs_habit_date_key on habit_logs (habit_id, local_date);
create index if not exists habit_logs_local_date_idx on habit_logs (local_date);
