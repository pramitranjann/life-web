-- Link a task to a calendar event.
--
-- We intentionally do NOT add a foreign key to calendar_events(id). Google
-- events are stored with the Google event id as the primary key and are
-- deleted + re-inserted on every calendar sync (see syncCalendarEvents). A FK
-- with `on delete set null` would therefore wipe the task's link on every
-- sync. Storing the event id as plain text keeps the link stable across syncs;
-- if the underlying event is genuinely deleted in Google, the id simply points
-- at nothing and the UI degrades gracefully.
alter table tasks add column if not exists calendar_event_id text;
create index if not exists tasks_calendar_event_id_idx on tasks (calendar_event_id);
