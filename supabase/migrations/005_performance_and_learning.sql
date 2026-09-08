-- ============================================================================
--  005 — performance, and the loop that learns from it
--
--  Everything here hangs off published_archive rather than spiritual_videos,
--  because by the time a video has performance it no longer exists in
--  spiritual_videos: publish_and_archive() copies what matters and deletes the
--  row. The archive was deliberately slim — enough to prove what went out and
--  to keep the similarity sweep honest. It now has to carry two more jobs:
--
--    1. what the video actually did on the channel, refreshed from the
--       YouTube Analytics API, and
--    2. enough about HOW it was written -- which god, which register, how
--       long, what the opening line was -- that those numbers can be compared
--       against each other and mean something.
--
--  Without (2), (1) is a scoreboard. With it, it is a training signal.
--
--  Safe to run more than once, and safe to run before or after 004.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. How the video was made.
--
--    These are copied from the row at publish time, not looked up later --
--    the row is gone by then, and the settings that produced it may have
--    changed since.
-- ---------------------------------------------------------------------------
alter table public.published_archive
  add column if not exists deity text;

alter table public.published_archive
  add column if not exists tone text;

alter table public.published_archive
  add column if not exists word_count int;

alter table public.published_archive
  add column if not exists hook_context text;

comment on column public.published_archive.tone is
  'soft | intense — which register was written, and therefore whose voice read it.';

-- ---------------------------------------------------------------------------
-- 2. What the video did.
--
--    Named for the API metrics they come from, so a person reading a number
--    here can find its definition in Google''s docs without a translation
--    table. All nullable: a video published an hour ago has no retention curve
--    yet, and pretending zero would poison every average.
-- ---------------------------------------------------------------------------
alter table public.published_archive
  add column if not exists views int;

-- Since March 2025 a Short''s `views` counts every start and replay, which
-- makes it a scroll counter rather than an audience counter. engagedViews is
-- the old, stricter number and is the one worth comparing across videos.
alter table public.published_archive
  add column if not exists engaged_views int;

alter table public.published_archive
  add column if not exists likes int;

alter table public.published_archive
  add column if not exists comments int;

alter table public.published_archive
  add column if not exists shares int;

alter table public.published_archive
  add column if not exists subscribers_gained int;

alter table public.published_archive
  add column if not exists subscribers_lost int;

alter table public.published_archive
  add column if not exists estimated_minutes_watched real;

alter table public.published_archive
  add column if not exists average_view_duration real;

-- The completion proxy. Above ~75% is the number that reportedly gets a Short
-- out of its seed audience, so it is the single most useful column here.
alter table public.published_archive
  add column if not exists average_view_percentage real;

-- ---------------------------------------------------------------------------
-- 3. The hook score.
--
--    audienceWatchRatio sampled at roughly three seconds in. Half of everyone
--    who leaves a Short leaves inside those three seconds, which makes this
--    one number a direct measurement of the opening line -- the only part of
--    the script the engine can deliberately change and immediately re-measure.
-- ---------------------------------------------------------------------------
alter table public.published_archive
  add column if not exists retention_3s real;

-- How this video held viewers compared with other YouTube videos of a similar
-- length. Self-comparison inside one small channel can only say which of our
-- videos did best; this says whether any of them are good.
alter table public.published_archive
  add column if not exists relative_retention real;

alter table public.published_archive
  add column if not exists stats_updated_at timestamptz;

-- Why a video has no numbers, in words, so the Performance page can say
-- "connect YouTube again" instead of showing a silent dash forever.
alter table public.published_archive
  add column if not exists stats_error text;

-- The refresh sweep asks for "published recently, refreshed longest ago".
create index if not exists published_archive_stats_idx
  on public.published_archive (stats_updated_at nulls first, published_at desc);

-- ---------------------------------------------------------------------------
-- 4. Carry the new craft columns across at publish time.
--
--    Same transaction as before. Adding columns to the archive without
--    updating this function is the failure that would leave every future row
--    with a null deity and no way to recover it, so the two belong in one
--    migration.
-- ---------------------------------------------------------------------------
create or replace function public.publish_and_archive(
  p_id uuid,
  p_youtube_video_id text,
  p_youtube_url text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.published_archive (
    id, title, script_body, content_hash, topic_key, scripture, reference,
    youtube_video_id, youtube_url, target_seconds, duration_seconds,
    deity, tone, word_count, hook_context
  )
  select id, title, script_body, content_hash, topic_key, scripture, reference,
         p_youtube_video_id, p_youtube_url, target_seconds, duration_seconds,
         deity, tone, word_count, hook_context
    from public.spiritual_videos
   where id = p_id
  on conflict (id) do nothing;

  delete from public.spiritual_videos where id = p_id;
end;
$$;

-- ============================================================================
--  Verify:
--    select column_name from information_schema.columns
--     where table_name = 'published_archive'
--       and column_name in ('deity','tone','retention_3s','average_view_percentage')
--     order by column_name;
--    -- expect 4 rows
-- ============================================================================
