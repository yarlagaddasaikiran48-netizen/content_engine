# Indian Spiritual Content Engine

An automated, human-approved pipeline that writes, voices, renders and publishes
30-second spiritual Shorts to YouTube.

**Total running cost: ₹0.** Every service used has a free tier that comfortably
covers one video per day.

```
Gemini 2.5 Flash  →  Edge TTS  →  Supabase  →  you tap Approve  →  GitHub Actions  →  YouTube
   (the script)      (the voice)   (the queue)   (on your phone)      (FFmpeg render)    (published)
```

---

## What makes this different from a generic "AI content bot"

**Nothing is hallucinated.** The model is never asked to recall scripture. A
topic is claimed from a ledger of 784 real, citable passages, the actual
Sanskrit and a published English translation are fetched and handed to the
model, and it is told to explain only what it was given. Every row in the
dashboard carries a `verify source` link.

**A script can never repeat.** Three independent layers:

| Layer | Mechanism | Catches |
|---|---|---|
| 1 | `topic_ledger` — each verse or story is handed out **at most once, ever**, claimed atomically with `FOR UPDATE SKIP LOCKED` | The same subject coming round again |
| 2 | `content_hash` — a `UNIQUE` SHA-256 over the *normalised* script (case, punctuation and filler words stripped) | A reworded near-identical script |
| 3 | `max_script_similarity()` — pg_trgm similarity against the last 200 scripts, rejected above 45% | A different topic written in the same shape |

A rejection releases the topic and tries a different one, up to four times.

**Timely, not generically inspirational.** A computed panchang tells the engine
what today actually is — tithi, paksha, nakshatra, lunar month — and derives
festivals *by rule*, so Diwali is simply "the new moon of Kartika" and the
calendar never expires. Validated against 15 known festival dates across
2024–2025: **15/15 matched.** Google Trends for India is layered on top, but
filtered hard — a trend can shape the framing, never the scripture.

**Safe by construction.** Gemini's own safety settings run at
`BLOCK_LOW_AND_ABOVE`, then a local filter re-checks the finished text for
profanity (including leetspeak obfuscation), politics, caste, communal
comparison, medical claims and model artefacts. Anything flagged is discarded
before it is ever stored or spoken.

---

## Project structure

```
├── src/
│   ├── app/
│   │   ├── dashboard/page.tsx           mobile-first approval queue (server-rendered)
│   │   ├── layout.tsx  page.tsx  globals.css
│   │   └── api/
│   │       ├── generate/route.ts        Gemini → TTS → Supabase, status 'pending'
│   │       ├── videos/route.ts          queue reads for the dashboard
│   │       ├── approve/route.ts         mark approved + dispatch the renderer
│   │       ├── reject/route.ts          mark rejected
│   │       ├── publish/callback/route.ts  GitHub Actions reports back
│   │       └── cron/generate/route.ts   daily scheduled generation
│   ├── components/
│   │   ├── QueueClient.tsx              state, filters, bottom sheets, toasts
│   │   ├── VideoCard.tsx                one queue item
│   │   └── StatusPill.tsx
│   ├── lib/
│   │   ├── tts/edge-tts.ts              Edge TTS reimplemented in TypeScript
│   ├── gemini/master-prompt.ts      the master system prompt
│   ├── gemini/{prompt,generate}.ts  grounded prompting + structured output
│   │   ├── sources/{gita,puranas,mahapuranas,panchang,trending,hook}.ts
│   │   ├── safety/{profanity,validate}.ts
│   │   ├── dedupe/hash.ts
│   │   ├── youtube/{oauth,upload,analytics}.ts  upload + retention, no googleapis
│   ├── learning/{insights,store}.ts what the channel's own numbers say
│   │   ├── github/dispatch.ts
│   │   ├── supabase/{admin,client}.ts
│   │   └── pipeline/generate-video.ts   the orchestrator
│   └── middleware.ts                    optional password gate (off by default)
├── supabase/schema.sql                  tables, functions, RLS, storage bucket
├── supabase/migrations/                 run in order, after schema.sql
├── scripts/
│   ├── seed-topics.ts                   load 784 topics into the ledger
│   ├── render-and-publish.ts            FFmpeg render + YouTube upload
│   ├── test-tts.ts                      voice smoke test
│   └── self-test.ts                     28 offline checks
├── render/
│   ├── render_short.py                  local Ken Burns + captions renderer
│   ├── minimal_example.py               the 20-line audio + background version
│   └── requirements.txt
├── .github/workflows/
│   ├── render-and-publish.yml           where FFmpeg runs
│   └── daily-generate.yml               free cron alternative
└── assets/backgrounds/                  optional .jpg/.png backgrounds
```

---

## Setup

### 0. Prerequisites

Node 20+. FFmpeg is only needed if you want to render locally — GitHub Actions
already has it.

```bash
npm install
cp .env.example .env.local
npm run selftest        # 29 checks, needs no credentials
```

### 1. Supabase (free)

1. Create a project at [supabase.com](https://supabase.com).
2. **SQL Editor → New query** → paste all of `supabase/schema.sql` → **Run**.
   This creates the tables, the three duplicate-defence functions, RLS policies
   and the public `spiritual-audio` storage bucket.
3. Run each file in `supabase/migrations/` in order, in the same editor.
   `001_settings_and_scheduling.sql` adds the encrypted settings table, the
   scheduler lock and the publish-queue columns; `005_performance_and_learning.sql`
   adds the performance columns the Stats tab reads. Every migration is
   idempotent and safe to re-run — but the SQL editor is transactional, so one
   error rolls back the whole paste. Run them one file at a time.
4. **Project Settings → API** — copy into `.env.local`:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` *(secret — never expose)*

> RLS is enabled with **no permissive policies**, so the public anon key can
> read nothing. All access goes through server routes using the service-role
> key. This is what keeps the queue private even with an unauthenticated
> dashboard.

### 2. Gemini (free)

Get a key at [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey).

Paste it into **Settings → Connections** in the running app, where it is stored
encrypted and can be changed from a phone.

> **While the config migration is in progress**, also keep `GEMINI_API_KEY` in
> `.env.local`. The generation pipeline still reads the environment directly
> and throws when it is missing; only the YouTube connection reads Settings so
> far. Once that migration lands, the environment copy can be deleted.

### 3. Seed the topic ledger

```bash
npm run seed:topics
```

Fetches all 700 Bhagavad Gita verses (Sanskrit + transliteration +
public-domain translation) from the free Vedic Scriptures API and adds the 84
curated Purana / Upanishad / Ramayana topics covering all eighteen Maha Puranas. **784 topics ≈ 2 years of daily
content with zero repeats.**

Re-running is safe — it uses `ON CONFLICT DO NOTHING`, so already-used topics
keep their state and are never handed out again.

### 4. YouTube (free quota)

1. [console.cloud.google.com](https://console.cloud.google.com) → new project.
2. **APIs & Services → Library** → enable **YouTube Data API v3**.
3. **OAuth consent screen** → External → add your own email under *Test users*.
4. **APIs & Services → Library** → also enable **YouTube Analytics API**
   (the Performance page cannot read retention without it).
5. **Credentials → Create OAuth client ID → Web application**. Under
   *Authorised redirect URIs* add:

   ```
   https://your-app.vercel.app/api/youtube/callback
   ```

   Add `http://localhost:3000/api/youtube/callback` too if you develop locally.
   It must match byte for byte.
6. Copy the client ID and secret into **Settings → Connections** in the app.
7. Press **Connect YouTube**. Approve, and the refresh token is stored
   encrypted for you — there is no longer a terminal step and nothing to paste.

> While the consent screen is in *Testing*, Google expires refresh tokens after
> **7 days**. Hit **Publish app** on the consent screen to make it permanent —
> no verification is required for uploading to your own channel.

Start with `YOUTUBE_PRIVACY_STATUS=unlisted` while testing.

### 5. Run it

```bash
npm run dev     # http://localhost:3000/dashboard
```

Press **Generate new script**, listen to the audio, then Approve or Reject.

---

## Deploying to Vercel (free)

1. **Push to GitHub**

   ```bash
   git add -A
   git commit -m "Spiritual content engine v1"
   git push -u origin main
   ```

2. **Import into Vercel** — [vercel.com/new](https://vercel.com/new) → pick the
   repo. Framework preset is detected as Next.js; leave the build settings
   alone.

3. **Add environment variables** — paste every filled-in key from `.env.local`
   into *Settings → Environment Variables*, for **Production, Preview and
   Development**. Deploy.

4. **Set `NEXT_PUBLIC_SITE_URL`** to the deployed URL (e.g.
   `https://your-app.vercel.app`, no trailing slash) and redeploy. The renderer
   needs it to report back.

5. **Wire up the GitHub Actions renderer.** Vercel's serverless functions cap at
   60s with a 250 MB bundle, so FFmpeg cannot run there. GitHub Actions does the
   rendering on free minutes:

   - **GitHub → Settings → Developer settings → Personal access tokens →
     Fine-grained tokens** → select this repository → *Repository permissions →
     Contents: Read and write*. Copy the token.
   - In Vercel set `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_DISPATCH_TOKEN`, and
     `PUBLISH_CALLBACK_SECRET` (any long random string —
     `openssl rand -hex 32`).
   - In the **GitHub repo → Settings → Secrets and variables → Actions**, add:
     `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
     `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN`,
     `PUBLISH_CALLBACK_SECRET` (the same value as in Vercel).

6. **Daily automation.** `vercel.json` already schedules
   `/api/cron/generate` at 01:30 UTC (07:00 IST). Set `CRON_SECRET` in Vercel to
   protect it. If you would rather not spend a Vercel cron slot, delete the
   `crons` block and instead add `SITE_URL` + `CRON_SECRET` as GitHub secrets —
   `.github/workflows/daily-generate.yml` does the same job for free.

7. **Add the dashboard to your home screen.** Open the URL on your phone →
   Share → *Add to Home Screen*. It opens chromeless, like an app.

### Optional: lock the dashboard

You chose to leave it open. If you ever share the link, set
`DASHBOARD_PASSWORD` in Vercel — the middleware immediately requires HTTP Basic
auth on the dashboard and every write route, with no login page to build.

---

## How the video actually gets made

This is the part most "deploy to Vercel" guides skip, so to be explicit:

**Vercel cannot render video.** Hobby functions are limited to 60 seconds and a
250 MB bundle; FFmpeg plus a compositing pass fits in neither. Three viable
answers exist and this project ships the first two:

1. **GitHub Actions (default, automatic).** Approve → Vercel fires a
   `repository_dispatch` → a runner with FFmpeg preinstalled pulls the MP3 and
   script from Supabase, builds a 1080×1920 H.264 MP4 with burned-in captions,
   uploads it to YouTube, and calls back with the video id. Status moves
   `approved → rendering → published` live in the dashboard.
2. **Locally**, for debugging: `npm run render -- --id=<video-uuid>`.
3. A paid render service — unnecessary here.

The renderer needs **no binary assets**: with `assets/backgrounds/` empty,
FFmpeg generates an animated radial gradient. Drop 1080×1920 images in that
folder and it picks one at random with a slow Ken Burns push, blur and vignette
instead. Captions are generated as an SRT with cues weighted by character
count, which matters because most Shorts are watched muted.

---

## Notes on the Edge TTS implementation

`edge-tts` is a Python library, and running a second Python function on Vercel
purely to make an MP3 doubles the cold starts and the deployment surface. The
service underneath is a plain WebSocket protocol, so `src/lib/tts/edge-tts.ts`
speaks it directly: same endpoint, same neural voices, same audio, no Python.

Two details worth knowing if you modify it:

- **`Sec-MS-GEC`** is a DRM token — `SHA256(windows_file_time_ticks_rounded_to_5min + trusted_client_token)`,
  uppercase hex. A skewed system clock produces a 403; the client reads the
  server's `Date` header, corrects the offset and retries once.
- **It uses the `ws` package, not Node's built-in `WebSocket`.** The service
  only completes the handshake when the request carries the read-aloud
  extension's `Origin` header, and the WHATWG WebSocket API cannot set request
  headers. Verified against the live endpoint: with the headers the upgrade
  returns HTTP 101, without the `Origin` it fails with a bare 1006.

Measured: `en-IN-NeerjaNeural` at `rate=-4%` reads **148 words per minute**, so
a 30-second script is ~74 words; the validator accepts 63–85.

None of those three numbers is hardcoded. The window is computed as
`TARGET_SECONDS × TTS_WORDS_PER_MINUTE / 60`, plus or minus
`WORD_COUNT_TOLERANCE`, and the same figures are injected into the prompt — so
changing `TARGET_SECONDS=45` retunes the generator and the validator together
(ideal 111, window 94–128), and switching to a slower Hindi voice is a matter of
retuning `TTS_WORDS_PER_MINUTE`.

Other Indian voices available: `en-IN-NeerjaExpressiveNeural`,
`en-IN-PrabhatNeural` (male), `hi-IN-SwaraNeural`, `hi-IN-MadhurNeural`, plus
Bengali, Gujarati, Kannada, Malayalam, Marathi, Tamil, Telugu and Urdu.
List them all with `npm run tts:test -- --voices`.

---

## Content sourcing

| Source | What it provides | Verified |
|---|---|---|
| [Vedic Scriptures API](https://vedicscriptures.github.io) | All 18 chapters, 700 verses — Sanskrit, transliteration, ~12 English translations. No key, no quota. | HTTP 200 |
| [Wisdomlib](https://www.wisdomlib.org) | Full English translations of 13 Puranas, 3 principal Upanishads and the Ramayana | HTTP 200 on all 17 cited books |

Translations used are the standard scholarly ones (Sivananda, Gambirananda,
Purohit Swami, Adidevananda, Wilson, Pargiter, Shastri). **Prabhupada's Gita
rendering is deliberately excluded** — it is under active BBT copyright and
must not be recited in monetised video.

Scriptures covered: Bhagavad Gita, Vishnu, Bhagavata, Shiva, Markandeya
(including the Devi Mahatmya), Garuda, Skanda, Padma, Linga, Brahma, Brahmanda,
Narada, Devi Bhagavata and Agni Puranas; the Chandogya, Brihadaranyaka and
Taittiriya Upanishads; and the Ramayana of Valmiki.

---

## The daily Maha Purana rotation

The engine walks the eighteen Maha Puranas in their traditional order, one per
day, then wraps. The schedule is a pure function of the date — no cursor is
stored anywhere, so it cannot drift, and any machine asked "what is today?"
gives the same answer.

| # | Purana | Guna | Deity | Verses | Full English text |
|---|---|---|---|---|---|
| 1 | Brahma | rajas | Brahma | 10,000 | yes |
| 2 | Padma | sattva | Vishnu | 55,000 | yes |
| 3 | Vishnu | sattva | Vishnu | 23,000 | yes |
| 4 | Shiva | tamas | Shiva | 24,000 | yes |
| 5 | Bhagavata | sattva | Krishna | 18,000 | yes |
| 6 | Narada | sattva | Vishnu | 25,000 | yes |
| 7 | Markandeya | rajas | Devi / Surya | 9,000 | yes |
| 8 | Agni | tamas | Agni / Vishnu | 15,400 | yes |
| 9 | Bhavishya | rajas | Surya | 14,500 | reference only |
| 10 | Brahmavaivarta | rajas | Krishna / Radha | 18,000 | reference only |
| 11 | Linga | tamas | Shiva | 11,000 | yes |
| 12 | Varaha | sattva | Vishnu (Varaha) | 24,000 | reference only |
| 13 | Skanda | tamas | Kartikeya | 81,100 | yes |
| 14 | Vamana | rajas | Vishnu (Vamana) | 10,000 | reference only |
| 15 | Kurma | tamas | Vishnu (Kurma) / Shiva | 17,000 | reference only |
| 16 | Matsya | tamas | Vishnu (Matsya) | 14,000 | reference only |
| 17 | Garuda | sattva | Vishnu | 19,000 | yes |
| 18 | Brahmanda | rajas | Brahma / Lalita | 12,000 | yes |

Verse counts are the traditional figures the Puranas give for each other (the
Matsya Purana carries the list), totalling about 400,000. Surviving manuscripts
vary, so they are tradition rather than a manuscript census. The guna column is
the Padma Purana's three-fold classification.

The registry lives in `src/lib/sources/mahapuranas.ts`. Each entry carries the
text's character and natural themes, and the prompt builder injects them so a
Garuda Purana script and a Bhagavata Purana script do not come out sounding the
same. Citations resolve through one function — open full text where it exists,
canonical reference otherwise — so no entry carries a URL of its own to rot.

If today's Purana has no unused topics left, the rotation advances to the next
rather than failing. Once all eighteen are spent it falls back to the wider
ledger (Gita, Upanishads, Ramayana). Tune it with `PURANA_ROTATION`,
`ROTATION_EPOCH` and `ROTATION_DAYS_PER_PURANA`; set the first to `off` for
weighted-random selection instead.

Check what is running low before it bites:

```sql
select * from scripture_stock;   -- per-Purana remaining topics, lowest first
```

---

## The master prompt

`src/lib/gemini/master-prompt.ts` is the highest-leverage file here — it decides
whether a thumb stops. It is written as constraints and physics rather than as a
fill-in template, because templates produce identically-shaped scripts, which
the duplicate detection then rejects.

It covers: who is watching and what they are actually carrying; the Telugu
register, taught with a table of verb endings rather than an adjective; the
beat sheet, computed from the configured length rather than fixed at thirty
seconds; what the first three seconds have to do and how the ending has to
close; the rule that the episode is the content, with no bridge to the viewer's
own week; a banned-phrase list in both languages (those are the exact fillers a
model reaches for when it has nothing specific to say); hard safety rails; and a
self-check before answering.

The section on the first three seconds is the only part written against measured
data rather than taste, and it is where the learning loop lands — see
**Performance** below.

Nothing about any specific Purana, deity or story is baked into it. The Purana
of the day, its character, the passage, the Sanskrit and the translation are all
injected at call time from the ledger.

---

## Performance, and the loop that learns from it

The **Stats** tab is not a YouTube Studio clone. Studio is better at charts and
is on the same phone. The only thing this page can do that Studio cannot is put
a video's numbers next to the decisions that produced it — which god, which
register, which opening line — and then say what the engine has concluded.

Every five minutes the tick refreshes a few published videos from the YouTube
Analytics API (`src/lib/youtube/analytics.ts`), oldest measurement first, and
writes the result onto the `published_archive` row. Two reports per video:

- **basic stats** — views, engaged views, likes, comments, shares, subscribers,
  average view duration and `averageViewPercentage`, the completion proxy.
- **audience retention** — the curve, sampled at three seconds in. Half of
  everyone who abandons a Short is gone by then, which makes that one number a
  direct measurement of the opening line.

`src/lib/learning/insights.ts` turns those rows into a paragraph the writer
reads before it writes. Three rules govern it, and they are the difference
between a learning loop and a superstition machine:

1. **Never speak from a small sample.** Nothing is said until six videos have
   been measured, and no comparison is made unless both sides have at least
   three videos and the gap is at least six percentage points. A channel that
   does not yet know says less.
2. **Never compare raw views.** A video published six weeks ago has had six
   weeks to collect them. Every conclusion is drawn from a rate.
3. **Report the gap, not the ranking.** "Shiva does best" is encouragement;
   "Shiva holds 71%, Vishnu 52%, over nine and seven videos" is checkable.

Switch it off with **Settings → Learn from retention**. The numbers keep being
collected; they simply stop reaching the prompt.

> The YouTube **Analytics** API is a separate product from the Data API and is
> enabled separately in Google Cloud. Uploading will work perfectly while every
> analytics call returns 403. If the Stats page says so, that is the first
> thing to check.

---

## Rendering locally with Python

The GitHub Actions renderer is the automatic path. `render/` is the local one —
useful for iterating on the look without burning Actions minutes, and for
matching the style of viral mythological storytelling shorts.

```bash
pip install -r render/requirements.txt

# audio + text; background generated, no key needed
python render/render_short.py --audio narration.mp3 --text "your script"

# with your own mythological artwork
python render/render_short.py --audio narration.mp3 --text-file script.txt     --image assets/backgrounds/krishna.jpg

# fetch a background from Pexels (free key in PEXELS_API_KEY)
python render/render_short.py --audio narration.mp3 --text-file script.txt     --query "ancient indian temple painting"

# pull an approved item straight out of the queue
python render/render_short.py --id <video-uuid> --out short.mp4
```

What it produces: 1080x1920 H.264, a slow ease-out Ken Burns push with a slight
drift so the motion never looks mechanical, and bold phrase-by-phrase captions
with a heavy outline and drop shadow, placed clear of the Shorts UI overlay.
Captions are drawn with Pillow rather than MoviePy's `TextClip`, which avoids
the ImageMagick and font-resolution problems that break that class on most
machines.

Three deliberate behaviours:

- **Audio is the source of truth for duration.** The video runs a fraction
  longer so it can fade on a held frame, and the soundtrack is padded with
  digital silence to match — otherwise MoviePy raises when it seeks past the
  final sample.
- **Nothing is hardcoded.** Resolution, fps, zoom, caption size, stroke, safe
  margins, colours and the font are all CLI flags or environment variables.
  Fonts are discovered per platform rather than assumed.
- **It degrades instead of failing.** No Pexels key, no image, no system font —
  each has a fallback, so it always produces a video. The blur-and-dim
  legibility pass is applied only to photographs; a generated gradient skips it,
  because dimming an already-dark image twice yields a black frame.

`render/minimal_example.py` is the twenty-line version: audio plus one
background into a synced MP4, nothing else.

---

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Local dashboard at `/dashboard` |
| `npm run selftest` | 28 offline checks — run this first when something looks wrong |
| `npm run seed:topics` | Load / top up the topic ledger |
| `npm run tts:test` | Synthesise a sample MP3 to `tmp-tts/` |
| `npm run tts:test -- --voices` | List every available voice |
| `npm run render -- --id=<uuid>` | Render + publish one item locally |
| `npm test` | Unit tests (Vitest) |
| `npm run typecheck` | `tsc --noEmit` |
| `python render/render_short.py --help` | Local renderer options |

---

## Troubleshooting

**"Every topic in the ledger has been used"** — you have published 784 videos,
or seeding did not run. Check with
`select count(*) from topic_ledger where times_used = 0;`

**Generation keeps failing with "too similar"** — the threshold is strict by
design. Raise `SIMILARITY_THRESHOLD` toward `0.6`, or add topics.

**`invalid_grant` on upload** — the refresh token expired. If your OAuth
consent screen is still in *Testing*, tokens die after 7 days: publish the app,
then press **Connect YouTube** in Settings again.

**Edge TTS returns 403** — the system clock is off by more than a few minutes.
The client corrects and retries automatically; if it persists, fix the clock.

**Approve does nothing** — `GITHUB_OWNER`, `GITHUB_REPO`,
`GITHUB_DISPATCH_TOKEN` or `NEXT_PUBLIC_SITE_URL` is missing. The API response
says which; check the Actions tab for the run.

**YouTube quota** — an upload costs 1,600 units of a 10,000/day default, so
about six uploads per day.

---

## Accuracy note on the panchang

Solar longitude is accurate to ~0.01°, lunar to ~0.2° (abridged Meeus series).
A tithi spans 12°, so the label is reliable except within roughly half an hour
of a boundary. It drives the *theme* of a video and nothing else — **do not use
it to decide fasting or ritual timing.**
