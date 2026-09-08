# Retelling, voice and corpus — design

**Date:** 2026-09-08
**Status:** approved, not yet implemented

## Why

Three complaints, one session:

1. The voice does not sound human.
2. The scripts use a Purana as raw material for a lesson, instead of explaining
   the Purana. What is wanted is the famous episode — the ఘట్టం — told well.
3. The videos should be a minute long, and they should be Shorts.

Point 3 is almost entirely already true. The renderer produces 1080x1920, and
YouTube classifies a vertical video under three minutes as a Short with no help
from us. Length is a settings value the beat sheet already follows. So the real
work is points 1 and 2, plus the corpus that feeds them.

These are independent and are specified here as four workstreams, in the order
they should be built.

## Workstream 0 — unblock rendering

Already fixed and pushed (`fa1dd27`, `2910c03`), but not yet verified end to
end, because it depends on an action outside the repository.

The render workflow had never once succeeded. Both runs died one second into
the render step because `NEXT_PUBLIC_SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` are not set as repository secrets — GitHub Actions
has its own secret store, entirely separate from the Vercel environment where
those two values live. The check that caught it sat above the script's try
block, so nothing could be reported: the row kept the `rendering` that approval
had set, and the dashboard showed a video that was forever about to exist.

The fix moved that check inside the try, added `markFailed()`, and put a
preflight step in both workflows that names the missing secrets in an Actions
annotation.

**Remaining, and it is not a code change:** add the two secrets under
Settings → Secrets and variables → Actions, then approve a video. Nothing
below can be observed working until this is done.

## Workstream 1 — pure retelling at sixty seconds

### What changes

`src/lib/gemini/master-prompt.ts` currently carries THE TRANSLATION RULE:

> Every script does exactly one job: take one specific pressure a young Telugu
> speaker feels this week, and show that a text two thousand years old already
> knew about it.

That section is removed. The script's job becomes telling the episode itself.
`WHO IS WATCHING` is rewritten to describe the same audience without framing
them as people seeking relief — they are people who half-remember these stories
from a grandmother and would like to hear one told properly.

`src/lib/gemini/beats.ts` is rewritten from a bridge arc to a narrative arc:

| Beat | Job |
| --- | --- |
| Hook | A line from inside the story that cannot be walked away from. Still the hardest 1.5 seconds in the video. |
| Scene | Who, where, what is at stake. One concrete image. |
| Escalation | It gets worse, and it costs the character something. |
| The turn | What actually happens — the moment the episode is famous for. |
| Resolution | How it lands in the text itself. |
| Close | One quiet beat. No moral, no summary. |

The `SECOND_TURN_THRESHOLD_SECONDS` mechanism stays: past 45 seconds a single
complication cannot hold the middle, and 60 is past it.

### What must not change

The Telugu register table (గ్రాంథిక vs వ్యావహారిక verb endings), the banned
phrase lists in both languages, all nine hard rules, and the field contract.
Those are load-bearing and unrelated to the style question. The instruction to
use only the supplied passage matters *more* under retelling, not less: a
retelling invites the model to reach for remembered detail, which is exactly
the failure mode `prompt.ts` was built to prevent.

The hook requirement also stays, and grows in importance. With no bridge to the
viewer's own life, the story alone carries retention.

### Length

`target_seconds` 30 → 60. The catalogue's max is already 90, so this is a
settings change, not a code change.

`tts_words_per_minute` is currently 80, tuned for Edge Telugu. It stays at 80
for this workstream, since the voice has not changed yet — but it must be
re-measured again at the end of workstream 2, against the new engine. The word
window and the duration gate both derive from it, and getting it wrong is not
cosmetic: the gate rejects any take outside ±15%, so a stale words-per-minute
silently rejects every generation in a row.

### Risk, stated plainly

Removing the modern bridge is a change of identity, not of wording. The current
prompt is built on "they are not looking for religion, they are looking for
relief," and that is a retention strategy as much as an editorial one. Pure
retelling puts the entire retention burden on the hook and the storytelling.
This was raised and chosen deliberately. If watch-time drops, the fix is a
single closing line that lands the episode on the viewer — a middle position
between the two, not a return to the old prompt.

## Workstream 2 — Gemini TTS

### Why it will sound better

Edge TTS offers two Telugu voices and one flat `<prosody>` wrapper. There is no
expressive style support for `te-IN`, so we are at that engine's ceiling.

Gemini TTS is a language model that knows how to say a thing, not only what to
say. It takes an Audio Profile, a Scene description and Director's Notes in
natural language. For this channel that means:

> An elderly Telugu storyteller, seated, telling a grandchild about Markandeya
> late at night. Unhurried and warm. Drop almost to a whisper as death
> approaches.

Confirmed on 2026-09-08 from Google's own documentation: Telugu (`te`) is
supported, and `gemini-3.1-flash-tts-preview` is **free of charge on the free
tier for both input and output**.

Two documented caveats:

- Free tier is marked "Used to improve our products: **Yes**." Paid tier is No.
- The 3.1 preview model has a known flaw where the output voice does not always
  match the requested speaker.

The second is the reason Edge TTS is kept rather than replaced.

### Design

`synthesize(text, opts) → { audio, durationSeconds, voice, bytes }` in
`src/lib/tts/edge-tts.ts` is already a clean seam. The pipeline calls it once,
in one place.

- New `src/lib/tts/gemini-tts.ts` implementing that same signature.
- New `src/lib/tts/index.ts` routing on a `tts_provider` setting
  (`"gemini" | "edge"`), falling back to Edge when Gemini errors or returns 429.
  The fallback is logged, never silent — a run that quietly changes voice
  halfway through a channel is worse than a run that fails.
- New settings: `tts_provider`, `tts_style_prompt` (the director's notes),
  `tts_gemini_voice`.

### The format wrinkle

Gemini returns raw PCM, 24 kHz 16-bit mono. TTS runs on Vercel, where there is
no ffmpeg to transcode it.

The answer is not to transcode. Wrap the PCM in a WAV header and store WAV:

- ffmpeg on the runner reads WAV natively.
- Duration becomes exact arithmetic — `bytes / (24000 * 2)` — rather than the
  bitrate estimate Edge requires. The duration gate gets *more* accurate.
- Cost is file size, on a bucket holding one narration per video.

Three places currently assume MP3 and must become format-aware:

| Location | Assumption |
| --- | --- |
| `generate-video.ts:345` | object path hardcodes `.mp3` |
| `admin.ts:32` | `contentType: "audio/mpeg"` hardcoded |
| `render-and-publish.ts` | writes `narration.mp3`, passes it to ffmpeg |

`SynthesisResult` grows a `format: "mp3" | "wav"` field and those three read it.
The renderer should key off the stored object's extension rather than assume,
so an old MP3 row still renders after the switch.

## Workstream 3 — corpus expansion

### The problem

`supabase/seed_corpus.sql` holds 84 curated episodes, and they are lopsided:

| Purana | Episodes |
| --- | --- |
| Bhagavata | 13 |
| Shiva | 8 |
| Vishnu | 7 |
| Markandeya | 5 |
| Varaha, Vamana, Skanda, Padma, Matsya, Kurma, Garuda, Brahmavaivarta, Bhavishya | 3 each |
| Linga, Brahma | 2 each |
| Narada, Devi, Brahmanda, Agni | **1 each** |

`claimTopic()` walks the eighteen Maha Puranas one per day. A Purana with one
episode is exhausted the first time it comes up, and from then on the rotation
skips it. Within about a fortnight the engine is drawing from the general
ledger fallback rather than from any Purana at all — which is exactly why the
scripts read as generic.

### The work

Extend `src/lib/sources/puranas.ts` — the source of truth, from which the SQL is
generated — to roughly twelve episodes per Maha Purana, about 200 entries.

Each needs `topic_key`, `scripture`, `reference`, `title`, `theme`, `summary`,
`citation_url`, `weight`. The reference must be a real book/canto/chapter and
the citation must resolve; the whole architecture rests on the model being
handed verified material rather than asked to recall it. `weight` is the
importance ranking — the genuinely famous ghattams sit at the top.

This is the slowest workstream and the one that most determines whether a
script feels important or obscure.

Also: commit `seed_corpus.sql`. It is currently untracked, which is why it is
unclear whether it was ever loaded into Supabase.

## Testing

- `beats.ts` has no tests today and should: the arc at 30s and at 60s, and that
  the second complication appears only past the threshold.
- `gemini-tts.ts`: WAV header correctness and the duration arithmetic, against a
  recorded PCM fixture. No network in tests.
- The provider router: that a Gemini failure falls back to Edge and logs it.
- The corpus: every entry has a non-empty reference and a well-formed citation
  URL, and every `topic_key` is unique. A data test, run over the generated SQL.
- Existing safety tests (`validate.telugu`, `profanity.telugu`, `language`) must
  keep passing untouched — the prompt rewrite must not weaken them.

## Out of scope

- Any change to publishing. Shorts classification is automatic.
- Paid TTS providers. Revisit only if the free tier's training-data term or the
  preview model's voice inconsistency turns out to be unacceptable in practice.
- Rotation logic. The rotation is fine; it was starved, not wrong.
