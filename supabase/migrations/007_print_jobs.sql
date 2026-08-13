-- Physical desk-printer queue.
--
-- PR Life is the brain: it decides what to print and renders a ready-to-print
-- receipt. A jobs table holds the durable queue; an ESP32 at the desk polls,
-- leases one job at a time over HTTPS, prints it over Bluetooth, then reports
-- back. Jobs must survive the device being off, Wi-Fi/printer failures, and
-- Vercel restarts — so the queue lives here, not in memory.

create table if not exists print_jobs (
  id                uuid primary key default gen_random_uuid(),
  user_id           text not null default 'owner',
  -- Cleared (not deleted) if the task goes away, so printed history survives.
  task_id           uuid references tasks(id) on delete set null,
  -- Which physical printer/device this job targets. Single desk printer for now.
  device_id         text not null default 'desk',
  -- Denormalised so receipts and history remain meaningful even if the task is
  -- later deleted or its title edited after the receipt was queued.
  task_title        text not null,
  -- Pre-rendered, fixed-width receipt text. The ESP32 streams these bytes to the
  -- printer verbatim (ESC/POS init + cut are added in firmware), so PR Life owns
  -- the layout and the device stays dumb.
  receipt_payload   text not null,
  -- pending | leased | printed | failed
  status            text not null default 'pending',
  attempts          int not null default 0,
  last_error        text,
  created_at        timestamptz not null default now(),
  leased_at         timestamptz,
  lease_expires_at  timestamptz,
  printed_at        timestamptz
);

create index if not exists print_jobs_status_idx on print_jobs (status, created_at);
create index if not exists print_jobs_task_idx on print_jobs (task_id);
create index if not exists print_jobs_device_idx on print_jobs (device_id, status);

-- Prevent accidental duplicate jobs: at most one active (pending OR leased) job
-- per task. A reprint is only possible once the prior job is printed/failed, at
-- which point a new row is allowed again. The UI shows the existing state
-- instead of creating a second active job.
create unique index if not exists print_jobs_active_task_key
  on print_jobs (task_id)
  where status in ('pending', 'leased') and task_id is not null;

-- Optional explicit eligibility flag for V2 auto-queue. Off by default; the
-- manual "Print task" action is the V1 path and ignores this column.
alter table if exists tasks
  add column if not exists desk_eligible boolean not null default false;

-- Atomically lease one pending job for a device. In one transaction it:
--   1. reclaims any leases that have expired (device lost power/Wi-Fi/Bluetooth),
--      so no job is ever silently lost — it simply becomes available again;
--   2. selects a single pending job with FOR UPDATE SKIP LOCKED so two
--      concurrent polls can never grab the same job;
--   3. marks it leased, bumps the attempt count, and stamps the lease window.
-- Returns the leased row, or no rows when the queue is empty. This is why the
-- feature needs no cron: expiry reclaim happens lazily on each claim.
create or replace function claim_print_job(p_device text, p_lease_seconds int default 90)
returns setof print_jobs
language plpgsql
as $$
declare
  v_id uuid;
begin
  update print_jobs
     set status = 'pending',
         leased_at = null,
         lease_expires_at = null
   where status = 'leased'
     and lease_expires_at is not null
     and lease_expires_at < now();

  select id into v_id
    from print_jobs
   where status = 'pending'
   order by created_at
   for update skip locked
   limit 1;

  if v_id is null then
    return;
  end if;

  return query
  update print_jobs
     set status = 'leased',
         device_id = p_device,
         attempts = attempts + 1,
         leased_at = now(),
         lease_expires_at = now() + make_interval(secs => p_lease_seconds)
   where id = v_id
  returning *;
end;
$$;
