-- ============================================================================
--  Indian Spiritual Content Engine — Supabase schema
--  Run this ONCE in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
--  Safe to re-run: every statement is idempotent.
-- ============================================================================

-- pg_trgm powers the fuzzy "is this script too similar to an old one?" check.
create extension if not exists pg_trgm;
create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'video_status') then
    create type video_status as enum (
      'pending',    -- generated, waiting for your approval
      'approved',   -- you pressed Approve; render+upload has been dispatched
      'rendering',  -- GitHub Actions is building the MP4
      'published',  -- live on YouTube
      'rejected',   -- you pressed Reject
      'failed'      -- render or upload blew up; see error_message
    );
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'topic_source') then
    create type topic_source as enum ('gita', 'purana', 'upanishad');
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- 2. topic_ledger — the anti-duplication backbone
--    Every real, citable scripture topic the engine is allowed to use.
--    A topic is handed out AT MOST ONCE (times_used > 0 removes it from the
--    pool), which makes repeating a subject structurally impossible.
-- ---------------------------------------------------------------------------
create table if not exists public.topic_ledger (
  topic_key      text primary key,             -- e.g. 'gita:2.47'  |  'purana:vishnu:prahlada'
  source         topic_source not null,
  scripture      text        not null,         -- 'Bhagavad Gita' | 'Vishnu Purana' | ...
  reference      text        not null,         -- 'Chapter 2, Verse 47' | 'Book 1, Chapter 17'
  title          text        not null,         -- human label for the dashboard
  theme          text        not null,         -- 'detachment', 'devotion', 'dharma' ...
  summary        text        not null,         -- grounding context handed to the LLM
  sanskrit       text,                         -- original shloka, when available
  translation    text,                         -- public-domain English translation
  translator     text,                         -- attribution for the translation
  citation_url   text        not null,         -- where a human can verify this
  weight         int         not null default 100,  -- higher = picked sooner
  times_used     int         not null default 0,
  last_used_at   timestamptz,
  claimed_at     timestamptz,                  -- soft lock during generation
  created_at     timestamptz not null default now()
);

create index if not exists topic_ledger_pool_idx
  on public.topic_ledger (times_used, weight desc, claimed_at);
create index if not exists topic_ledger_source_idx
  on public.topic_ledger (source);

-- ---------------------------------------------------------------------------
-- 3. spiritual_videos — the approval queue
-- ---------------------------------------------------------------------------
create table if not exists public.spiritual_videos (
  id                    uuid primary key default uuid_generate_v4(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  status                video_status not null default 'pending',

  -- ---- Gemini output -----------------------------------------------------
  title                 text not null,
  script_body           text not null,
  seo_description       text not null,
  hashtags              text[] not null default '{}',

  -- ---- provenance: proves the topic is real, not hallucinated ------------
  topic_key             text references public.topic_ledger (topic_key),
  scripture             text,
  reference             text,
  citation_url          text,
  sanskrit              text,
  translation           text,
  translator            text,
  hook_context          text,   -- the trending / panchang angle used today

  -- ---- duplicate defence -------------------------------------------------
  content_hash          text not null,   -- sha256 of the normalised script body
  max_similarity        real,            -- highest pg_trgm score vs. history

  -- ---- audio -------------------------------------------------------------
  audio_path            text,            -- object path inside the storage bucket
  audio_url             text,            -- public playback URL
  audio_bytes           int,
  duration_seconds      real,
  word_count            int,
  voice                 text not null default 'en-IN-NeerjaNeural',

  -- ---- publishing --------------------------------------------------------
  youtube_video_id      text,
  youtube_url           text,
  published_at          timestamptz,
  approved_at           timestamptz,
  rejected_at           timestamptz,
  rejection_reason      text,
  error_message         text,
  render_attempts       int not null default 0,

  model                 text not null default 'gemini-2.5-flash',

  constraint spiritual_videos_content_hash_key unique (content_hash)
);

create index if not exists spiritual_videos_status_idx
  on public.spiritual_videos (status, created_at desc);
create index if not exists spiritual_videos_created_idx
  on public.spiritual_videos (created_at desc);
-- Trigram index makes the similarity sweep fast once the table grows.
create index if not exists spiritual_videos_body_trgm_idx
  on public.spiritual_videos using gin (script_body gin_trgm_ops);

-- keep updated_at honest
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists spiritual_videos_touch on public.spiritual_videos;
create trigger spiritual_videos_touch
  before update on public.spiritual_videos
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 4. generation_log — every attempt, including the ones we threw away.
--    Makes "why did it retry 3 times?" answerable.
-- ---------------------------------------------------------------------------
create table if not exists public.generation_log (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  topic_key   text,
  attempt     int  not null default 1,
  outcome     text not null,   -- 'accepted' | 'duplicate' | 'too_similar' | 'unsafe' | 'invalid' | 'error'
  detail      text,
  similarity  real
);

create index if not exists generation_log_created_idx
  on public.generation_log (created_at desc);

-- ---------------------------------------------------------------------------
-- 5. claim_unused_topic() — atomically hand out ONE never-used topic.
--    FOR UPDATE SKIP LOCKED means two concurrent generations can never grab
--    the same verse. Topics claimed >15 min ago are considered abandoned and
--    return to the pool.
-- ---------------------------------------------------------------------------
create or replace function public.claim_unused_topic(p_exclude text[] default '{}')
returns public.topic_ledger
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed public.topic_ledger;
begin
  select * into claimed
  from public.topic_ledger t
  where t.times_used = 0
    and (t.claimed_at is null or t.claimed_at < now() - interval '15 minutes')
    and not (t.topic_key = any(p_exclude))
  order by t.weight desc, random()
  limit 1
  for update skip locked;

  if claimed.topic_key is null then
    return null;
  end if;

  update public.topic_ledger
     set claimed_at = now()
   where topic_key = claimed.topic_key;

  return claimed;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5b. claim_unused_topic_for_scripture() — the daily Purana rotation.
--     Identical locking semantics, but restricted to one scripture so the
--     engine can walk the eighteen Maha Puranas in order, one per day.
--     Returns NULL when that scripture has nothing unused left, which lets the
--     caller advance to the next Purana instead of failing.
-- ---------------------------------------------------------------------------
create or replace function public.claim_unused_topic_for_scripture(
  p_scripture text,
  p_exclude text[] default '{}'
)
returns public.topic_ledger
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed public.topic_ledger;
begin
  select * into claimed
  from public.topic_ledger t
  where t.times_used = 0
    and t.scripture = p_scripture
    and (t.claimed_at is null or t.claimed_at < now() - interval '15 minutes')
    and not (t.topic_key = any(p_exclude))
  order by t.weight desc, random()
  limit 1
  for update skip locked;

  if claimed.topic_key is null then
    return null;
  end if;

  update public.topic_ledger
     set claimed_at = now()
   where topic_key = claimed.topic_key;

  return claimed;
end;
$$;

-- How much material is left per scripture. Handy for spotting a Purana that is
-- about to run dry before the rotation reaches it.
create or replace view public.scripture_stock as
select scripture,
       count(*)                                as total,
       count(*) filter (where times_used = 0)  as remaining
from public.topic_ledger
group by scripture
order by remaining asc;

-- Mark a topic permanently spent (called only after a script is accepted).
create or replace function public.consume_topic(p_topic_key text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.topic_ledger
     set times_used = times_used + 1,
         last_used_at = now(),
         claimed_at = null
   where topic_key = p_topic_key;
$$;

-- Release a claim without spending it (generation failed / was rejected).
create or replace function public.release_topic(p_topic_key text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.topic_ledger
     set claimed_at = null
   where topic_key = p_topic_key
     and times_used = 0;
$$;

-- ---------------------------------------------------------------------------
-- 6. max_script_similarity() — layer 3 of duplicate defence.
--    Returns the highest pg_trgm similarity between a candidate script and
--    the most recent N scripts already in the table. 0 = nothing alike.
-- ---------------------------------------------------------------------------
create or replace function public.max_script_similarity(
  p_body text,
  p_lookback int default 200
)
returns real
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(max(similarity(v.script_body, p_body)), 0)::real
  from (
    select script_body
    from public.spiritual_videos
    order by created_at desc
    limit p_lookback
  ) v;
$$;

-- ---------------------------------------------------------------------------
-- 7. Dashboard counters (one round trip instead of five)
-- ---------------------------------------------------------------------------
create or replace view public.queue_stats as
select
  count(*) filter (where status = 'pending')   as pending,
  count(*) filter (where status = 'approved')  as approved,
  count(*) filter (where status = 'rendering') as rendering,
  count(*) filter (where status = 'published') as published,
  count(*) filter (where status = 'rejected')  as rejected,
  count(*) filter (where status = 'failed')    as failed,
  (select count(*) from public.topic_ledger where times_used = 0) as topics_remaining,
  (select count(*) from public.topic_ledger)                      as topics_total
from public.spiritual_videos;

-- ---------------------------------------------------------------------------
-- 8. Row Level Security
--    RLS is ON with no permissive policies, so the public anon key can read
--    NOTHING. Every read/write goes through Next.js server routes using the
--    service-role key, which bypasses RLS. This keeps the queue private even
--    though the dashboard itself is unauthenticated.
-- ---------------------------------------------------------------------------
alter table public.spiritual_videos enable row level security;
alter table public.topic_ledger     enable row level security;
alter table public.generation_log   enable row level security;

-- ---------------------------------------------------------------------------
-- 9. Storage bucket for the generated MP3s (public read so the <audio> tag on
--    your phone and the GitHub Actions renderer can both fetch it).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('spiritual-audio', 'spiritual-audio', true, 26214400, array['audio/mpeg'])
on conflict (id) do update
  set public = true,
      file_size_limit = 26214400,
      allowed_mime_types = array['audio/mpeg'];

drop policy if exists "spiritual audio public read" on storage.objects;
create policy "spiritual audio public read"
  on storage.objects for select
  using (bucket_id = 'spiritual-audio');

-- ============================================================================
--  Done. Next: `npm run seed:topics` to fill topic_ledger with 800+ real,
--  citable topics (all 700 Gita verses + a curated Purana/Upanishad index).
-- ============================================================================
