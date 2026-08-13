create table if not exists program_application_monitors (
  program_key         text primary key,
  user_id             text not null default 'owner',
  program_name        text not null,
  program_type        text not null,
  url                 text not null,
  status              text not null,
  status_excerpt      text not null,
  status_hash         text not null,
  last_checked_at     timestamptz not null default now(),
  last_changed_at     timestamptz not null default now(),
  last_notified_hash  text,
  last_error          text,
  updated_at          timestamptz not null default now()
);

create index if not exists program_application_monitors_user_idx
  on program_application_monitors (user_id, last_checked_at desc);

create table if not exists life_notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null default 'owner',
  kind        text not null,
  title       text not null,
  body        text not null,
  url         text,
  metadata    jsonb not null default '{}'::jsonb,
  dedupe_key  text,
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);

create index if not exists life_notifications_user_created_idx
  on life_notifications (user_id, created_at desc);

create index if not exists life_notifications_user_unread_idx
  on life_notifications (user_id, created_at desc)
  where read_at is null;

create unique index if not exists life_notifications_user_dedupe_key
  on life_notifications (user_id, dedupe_key);
