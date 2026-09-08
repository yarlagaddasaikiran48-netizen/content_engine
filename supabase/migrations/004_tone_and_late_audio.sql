-- 004 — the register an episode is written in, and audio that arrives later.
--
-- Two changes, both driven by the free-tier quota this engine actually has.
--
-- 1. `tone` — the model now says whether it wrote a gentle episode or a fierce
--    one, and that decides whose voice reads it: a woman's for teaching and
--    devotion, a man's for wrath and judgement. The label has to survive on
--    the row because the narration is no longer recorded at the moment the
--    script is written — see below — so by the time anything speaks, the only
--    thing that remembers the register is this column.
--
-- 2. Narration moves to approval time. It used to be recorded for every script
--    the engine produced, including the ones nobody ever approved. The Gemini
--    speech model allows ten requests a day on the free tier, so scripts that
--    were rejected on sight were spending a budget an order of magnitude
--    smaller than the one that wrote them. The audio columns were already
--    nullable, so nothing here has to change for that — this comment is the
--    record of why they are now empty for a while.
--
-- Safe to paste into the Supabase SQL editor more than once.

alter table public.spiritual_videos
  add column if not exists tone text not null default 'soft';

comment on column public.spiritual_videos.tone is
  'soft | intense — the register the script was written in, which picks the narrating voice.';

-- Only the two the code knows about. An unrecognised value would silently fall
-- back to the gentle voice, which is the wrong way to find out about a typo.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'spiritual_videos_tone_check'
  ) then
    alter table public.spiritual_videos
      add constraint spiritual_videos_tone_check check (tone in ('soft', 'intense'));
  end if;
end $$;

-- The queue asks for "approved rows that still have no audio" on every render,
-- and for "ready to post" on every tick.
create index if not exists spiritual_videos_status_audio_idx
  on public.spiritual_videos (status)
  where audio_url is null;
