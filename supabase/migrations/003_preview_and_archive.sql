-- ============================================================================
--  Migration 003 — preview before posting, and a slim archive after
--
--  Two changes that belong together:
--
--   * Rendering and publishing become separate steps, so a finished MP4 can be
--     watched before it reaches the channel. That needs a new status and a
--     bucket to hold the file.
--   * A published video is deleted from spiritual_videos, but a small archive
--     row survives. Without it, deleting published rows would quietly disable
--     the duplicate-phrasing defence, which compares each new script against
--     recent script bodies.
--
--  Safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. 'ready' — rendered, watchable, not yet on YouTube.
--    The flow is now: pending -> approved -> rendering -> ready -> published.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_enum
     where enumlabel = 'ready'
       and enumtypid = 'video_status'::regtype
  ) then
    alter type video_status add value 'ready' after 'rendering';
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- 2. Where the rendered MP4 lives until it is published or discarded.
--    Public read so the preview player and the publish job can both fetch it.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('spiritual-video', 'spiritual-video', true, 209715200, array['video/mp4'])
on conflict (id) do update
  set public = true,
      file_size_limit = 209715200,
      allowed_mime_types = array['video/mp4'];

drop policy if exists "spiritual video public read" on storage.objects;
create policy "spiritual video public read"
  on storage.objects for select
  using (bucket_id = 'spiritual-video');

-- ---------------------------------------------------------------------------
-- 3. Columns for the rendered file.
-- ---------------------------------------------------------------------------
alter table public.spiritual_videos
  add column if not exists video_path  text,
  add column if not exists video_url   text,
  add column if not exists video_bytes bigint,
  add column if not exists rendered_at timestamptz;

comment on column public.spiritual_videos.video_url is
  'Public URL of the rendered MP4, watchable before publishing.';

-- ---------------------------------------------------------------------------
-- 4. published_archive — what survives deletion.
--
--    Deliberately slim: enough to prove what went out, and enough to keep the
--    similarity sweep working. No audio, no video, no SEO fields.
-- ---------------------------------------------------------------------------
create table if not exists public.published_archive (
  id               uuid primary key,
  published_at     timestamptz not null default now(),
  title            text not null,
  script_body      text not null,
  content_hash     text not null,
  topic_key        text,
  scripture        text,
  reference        text,
  youtube_video_id text,
  youtube_url      text,
  target_seconds   int,
  duration_seconds real
);

create index if not exists published_archive_published_idx
  on public.published_archive (published_at desc);
create index if not exists published_archive_body_trgm_idx
  on public.published_archive using gin (script_body gin_trgm_ops);

alter table public.published_archive enable row level security;

-- ---------------------------------------------------------------------------
-- 5. Teach the similarity sweep about the archive.
--
--    This is the whole reason the archive exists. The original function looked
--    only at spiritual_videos; once published rows are deleted, that table
--    holds nothing but a handful of pending scripts, and near-identical
--    phrasing would sail through.
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
  -- The ordering and the limit belong to the INNER set: we want the most
  -- recent p_lookback scripts, then the highest similarity among them. Sorting
  -- outside the aggregate is both invalid SQL and the wrong intent -- it would
  -- limit the single aggregate row rather than the rows being compared.
  select coalesce(max(similarity(v.script_body, p_body)), 0)::real
  from (
    select script_body
    from (
      select script_body, created_at   from public.spiritual_videos
      union all
      select script_body, published_at from public.published_archive
    ) recent
    order by created_at desc
    limit p_lookback
  ) v
$$;

-- ---------------------------------------------------------------------------
-- 6. publish_and_archive() — one transaction, so a video cannot be both
--    archived and still sitting in the queue.
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
    youtube_video_id, youtube_url, target_seconds, duration_seconds
  )
  select id, title, script_body, content_hash, topic_key, scripture, reference,
         p_youtube_video_id, p_youtube_url, target_seconds, duration_seconds
    from public.spiritual_videos
   where id = p_id
  on conflict (id) do nothing;

  delete from public.spiritual_videos where id = p_id;
end;
$$;

-- ============================================================================
--  Verify:
--    select unnest(enum_range(null::video_status));
--    select public.max_script_similarity('some sample narration text');
--    select count(*) from public.published_archive;
-- ============================================================================
