-- ============================================================================
--  Migration 001 — settings store, scheduler lock, queue columns
--  Run in the Supabase SQL editor, after supabase/schema.sql.
--  Safe to re-run: every statement is idempotent.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. app_settings — every credential and knob, editable from the UI.
--
--    value_enc holds base64(iv|tag|ciphertext) when is_secret is true, and
--    plain text otherwise. Non-secret rows stay readable on purpose: the
--    pg_cron job below reads posting_times and cron_secret directly from SQL,
--    and SQL has no way to decrypt.
-- ---------------------------------------------------------------------------
create table if not exists public.app_settings (
  key        text primary key,
  value_enc  text,
  is_secret  boolean     not null default false,
  updated_at timestamptz not null default now()
);

-- No policies: the anon key can read nothing. Every access goes through the
-- Next.js server routes on the service-role key, matching the rest of the app.
alter table public.app_settings enable row level security;

-- ---------------------------------------------------------------------------
-- 2. system_lock — leases that stop two scheduler ticks running at once.
--
--    A five-minute cron against a serverless function will eventually overlap:
--    one slow tick still generating while the next fires. Without a lease that
--    double-publishes a slot and double-spends a topic.
-- ---------------------------------------------------------------------------
create table if not exists public.system_lock (
  name         text primary key,
  locked_until timestamptz,
  updated_at   timestamptz not null default now()
);

alter table public.system_lock enable row level security;

insert into public.system_lock (name, locked_until)
values ('tick', null)
on conflict (name) do nothing;

-- Take the lease if it is free or expired. Returns true when acquired.
-- The lease self-expires so a tick that crashes mid-run cannot wedge the
-- scheduler permanently.
create or replace function public.try_lock(p_name text, p_seconds int default 240)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  affected int := 0;
begin
  update public.system_lock
     set locked_until = now() + make_interval(secs => p_seconds),
         updated_at   = now()
   where name = p_name
     and (locked_until is null or locked_until < now());

  get diagnostics affected = row_count;
  return affected > 0;
end;
$$;

create or replace function public.release_lock(p_name text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.system_lock
     set locked_until = null, updated_at = now()
   where name = p_name;
$$;

-- ---------------------------------------------------------------------------
-- 3. spiritual_videos — columns the swipe deck and the publish queue need.
-- ---------------------------------------------------------------------------
alter table public.spiritual_videos
  add column if not exists expires_at      timestamptz,
  add column if not exists queue_position  int,
  add column if not exists scheduled_for   timestamptz,
  add column if not exists target_seconds  int,
  add column if not exists seen_at         timestamptz,
  add column if not exists published_slot  text;

comment on column public.spiritual_videos.expires_at is
  'Rejected and unreviewed scripts delete themselves at this time; the topic returns to the pool.';
comment on column public.spiritual_videos.scheduled_for is
  'Set only when a slot is pinned by hand. Normally null: the schedule is derived from queue_position so reordering cannot leave stale timestamps.';
comment on column public.spiritual_videos.published_slot is
  'Which configured slot this filled, e.g. 00:00. Proves a slot is taken without scanning.';

-- The deck sorts unseen first, then recycled rejects.
create index if not exists spiritual_videos_deck_idx
  on public.spiritual_videos (status, seen_at nulls first, created_at);

-- The queue reads in operator-chosen order.
create index if not exists spiritual_videos_queue_idx
  on public.spiritual_videos (status, queue_position, created_at);

-- The tick sweeps expiries.
create index if not exists spiritual_videos_expiry_idx
  on public.spiritual_videos (expires_at)
  where expires_at is not null;

-- Proves a slot was already filled today without scanning the table.
create index if not exists spiritual_videos_slot_idx
  on public.spiritual_videos (published_slot, published_at desc)
  where published_slot is not null;

-- ============================================================================
--  Done. Verify the lock helper behaves before relying on it:
--
--    select public.try_lock('tick', 60);   -- true
--    select public.try_lock('tick', 60);   -- false, still held
--    select public.release_lock('tick');
--    select public.try_lock('tick', 60);   -- true again
--    select public.release_lock('tick');
-- ============================================================================
