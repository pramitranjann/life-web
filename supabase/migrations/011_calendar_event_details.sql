-- Google Calendar is the source of truth; this mirror keeps web and mobile reads
-- fast while preserving the editable details returned by Google during sync.
alter table if exists calendar_events
  add column if not exists calendar_id text,
  add column if not exists calendar_name text,
  add column if not exists location text,
  add column if not exists notes text,
  add column if not exists html_link text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists attendee_emails text[] not null default '{}'::text[],
  add column if not exists reminder_minutes integer[] not null default '{}'::integer[];
