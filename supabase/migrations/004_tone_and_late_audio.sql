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
-- 3. `deity` and `scene_prompt` — what is on the screen.
--    The renderer picked a background at random out of one flat folder, and
--    that folder is empty, so every video so far has been an abstract animated
--    gradient with captions over it: a retelling of Shiva swallowing the poison
--    looked exactly like a retelling of Krishna teaching Uddhava. The model now
--    names the figure the episode centres on, so backgrounds can be filed per
--    god and the right one appears; and it writes one sentence describing the
--    image the episode wants, which is what you hand to whatever renders it.
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

alter table public.spiritual_videos
  add column if not exists deity text;

alter table public.spiritual_videos
  add column if not exists scene_prompt text;

comment on column public.spiritual_videos.deity is
  'The god or figure the episode centres on. Chooses assets/backgrounds/<folder>.';

comment on column public.spiritual_videos.scene_prompt is
  'One sentence describing the image this episode should show, as a render prompt.';

-- The queue asks for "approved rows that still have no audio" on every render,
-- and for "ready to post" on every tick.
create index if not exists spiritual_videos_status_audio_idx
  on public.spiritual_videos (status)
  where audio_url is null;
