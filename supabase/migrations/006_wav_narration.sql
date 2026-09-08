-- 006 — the narration bucket has to accept the format the engine records in.
--
-- The bucket was created allowing exactly one mime type, 'audio/mpeg', back
-- when there was exactly one speech engine and it produced MP3. There are two
-- now, and they disagree about the container: Edge returns MP3, Gemini returns
-- raw PCM that the engine wraps as WAV. The renderer has known this for a
-- while — audioExtension() in scripts/render-and-publish.ts follows the stored
-- object rather than assuming, precisely because "rows of both kinds outlive
-- the switch" — but nothing ever told storage.
--
-- So for as long as Gemini TTS was failing and quietly falling back to Edge,
-- everything worked. The first time Gemini actually answered, the upload was
-- refused:
--
--   Failed to upload audio to bucket "spiritual-audio":
--   mime type audio/wav is not supported.
--
-- which reads like a missing bucket and is in fact a working one being strict
-- about a rule that stopped being true. The better voice succeeding is a
-- strange thing to be punished for.
--
-- audio/x-wav is included because it is what several clients label the same
-- bytes, and being refused over a spelling is the failure this migration
-- exists to stop happening twice.
--
-- Idempotent, like every migration here: safe to paste more than once.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'spiritual-audio',
  'spiritual-audio',
  true,
  52428800,
  array['audio/mpeg', 'audio/wav', 'audio/x-wav']
)
on conflict (id) do update
  set public = true,
      -- Doubled from 25 MB. WAV is uncompressed: a minute of 24 kHz 16-bit
      -- mono is about three megabytes where the same minute of MP3 is under
      -- one, and the ceiling should not be the next thing to refuse a
      -- narration that is merely long.
      file_size_limit = 52428800,
      allowed_mime_types = array['audio/mpeg', 'audio/wav', 'audio/x-wav'];

-- The read policy is unchanged and re-stated only so a fresh project that
-- runs the migrations without schema.sql still ends up with a readable bucket.
drop policy if exists "spiritual audio public read" on storage.objects;
create policy "spiritual audio public read"
  on storage.objects for select
  using (bucket_id = 'spiritual-audio');
