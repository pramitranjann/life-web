create extension if not exists pgcrypto;

create table if not exists entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null default 'owner',
  content     text not null,
  source      text not null default 'voice',
  local_date  date not null,
  created_at  timestamptz not null default now()
);
create index if not exists entries_local_date_idx on entries (local_date);

create table if not exists reports (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null default 'owner',
  type        text not null,
  content     text not null,
  local_date  date not null,
  created_at  timestamptz not null default now()
);
create index if not exists reports_local_date_type_idx on reports (local_date, type);
create unique index if not exists reports_user_type_local_date_key on reports (user_id, type, local_date);

create table if not exists summaries (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null default 'owner',
  content     text not null,
  week_start  date not null,
  created_at  timestamptz not null default now()
);
create unique index if not exists summaries_user_week_start_key on summaries (user_id, week_start);

create table if not exists settings (
  user_id     text primary key default 'owner',
  timezone    text,
  eod_hour    int not null default 22,
  eod_minute  int not null default 30,
  updated_at  timestamptz not null default now()
);

create table if not exists calendar_events (
  id          text primary key,
  user_id     text not null default 'owner',
  title       text,
  start_time  timestamptz,
  end_time    timestamptz,
  all_day     boolean not null default false,
  source      text not null default 'google',
  local_date  date not null,
  synced_at   timestamptz not null default now()
);
create index if not exists calendar_events_local_date_idx on calendar_events (local_date);

insert into settings (user_id, timezone)
values ('owner', null)
on conflict (user_id) do nothing;
