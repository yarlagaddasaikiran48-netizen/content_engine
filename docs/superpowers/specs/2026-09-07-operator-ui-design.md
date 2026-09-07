# Operator UI, Settings, Scheduling and the Learning Loop

**Date:** 2026-09-07
**Status:** Approved for implementation

---

## 1. Purpose

Turn the engine from a laptop-operated pipeline into something run entirely from
a phone: paste credentials in the UI, judge scripts by swiping, publish on a
schedule, and let measured retention improve the writing over time.

Four things are true today and constrain everything below:

- Credentials live in `process.env` and are read synchronously.
- Approving a script dispatches a render immediately; there is no buffer.
- Nothing measures what happened after publish.
- Script length is fixed at 30 seconds by hardcoded prose in the master prompt.

---

## 2. Locked decisions

| Decision | Choice | Rationale |
|---|---|---|
| Credential storage | Encrypted rows in `app_settings` | Editable from a phone; no redeploy |
| `.env` contents | Supabase URL + service key **only** | Operator's explicit requirement |
| Encryption key | Derived from the service key via HKDF | Keeps `.env` to two values |
| Authentication | **None** | Operator's explicit decision; see §10 |
| Left swipe | Reject, recycle 24h, then auto-delete | Operator's rule |
| Right swipe | Approve into an ordered publish queue | Overflow rolls to following days |
| Scheduler | Supabase `pg_cron` + `pg_net` | Reads posting times from the DB directly |
| Posting slots | 00:00 and 04:00 IST, editable | Operator's choice |
| Renderer | GitHub Actions, unchanged | Already works; only trigger changes |
| Analytics | Stats + retention + weekly learning loop | Retention at 3s is the Shorts metric |
| Script length | Configurable 20–90s, default 30s | Free tier supports 60s comfortably |
| Vedas | Three named hymns only, no bulk Samhitas | Liturgical hymns resist the format |
| Page count | Four | Approve and publish are now separate events |

---

## 3. Architecture

### 3.1 The tick

A single `pg_cron` job runs every five minutes and calls `/api/cron/tick`
through `pg_net`. The shared secret is read from `app_settings` inside the SQL
itself, so no environment variable is required.

The route performs three phases **in this order**:

1. **Expire.** Delete `pending` and `rejected` rows whose `expires_at` has
   passed. For each: delete the MP3 object, call `release_topic()` so the verse
   returns to the pool, and write a `generation_log` entry.
2. **Publish.** For each configured slot, if the current time falls within
   `[slot, slot + 55min]` and no video has been published for that slot today,
   take the head of the approved queue, set it to `rendering`, and dispatch the
   existing GitHub render workflow.
3. **Generate.** If today's generated count is below `scripts_per_day`, generate
   exactly one script.
4. **Measure.** Once per day only (guarded by a `last_stats_at` marker), pull
   YouTube analytics for recently published videos, and on Mondays recompute
   `hook_patterns`. Detailed in §9.

Expiry runs first because it frees topics that generation may want. Publishing
runs before generation because it is time-critical and generation is not.
Measurement runs last because nothing depends on it.

One script per tick keeps every request far inside Vercel's 60-second limit. A
batch of eight completes in forty minutes of wall clock, overnight, unattended.

### 3.2 Overlap protection

Ticks must not run concurrently. A `system_lock` row holds a lease:

```
select * from system_lock where name = 'tick' for update skip locked
```

A tick that cannot take the lease, or finds `locked_until > now()`, returns 200
immediately with `{skipped: "locked"}`. Leases expire after 4 minutes so a
crashed tick cannot wedge the system.

### 3.3 What goes away

- `vercel.json` `crons` block — replaced by `pg_cron`.
- `.github/workflows/daily-generate.yml` — replaced by the tick.
- `scripts/get-youtube-token.ts` — replaced by in-browser OAuth (§8).

`.github/workflows/render-and-publish.yml` is unchanged.

---

## 4. Data model

### 4.1 New table: `app_settings`

```sql
create table public.app_settings (
  key         text primary key,
  value_enc   text,                          -- base64 AES-256-GCM, null = unset
  is_secret   boolean not null default false,
  updated_at  timestamptz not null default now()
);
```

Encryption is AES-256-GCM. The key is `HKDF-SHA256(service_role_key,
salt='app_settings.v1')`, so rotating the Supabase service key invalidates
stored secrets — documented, and an explicit `SETTINGS_MASTER_KEY` override is
honoured when present for exactly that case.

Non-secret values (`is_secret = false`) are stored in clear so they remain
readable from SQL, which the `pg_cron` job depends on for posting times.

### 4.2 New table: `video_stats`

```sql
create table public.video_stats (
  video_id         uuid primary key references spiritual_videos(id) on delete cascade,
  fetched_at       timestamptz not null default now(),
  views            int,
  likes            int,
  comments         int,
  avg_view_pct     real,
  retention_3s     real,       -- fraction still watching at 3 seconds
  retention_10s    real,
  retention_end    real,
  retention_curve  jsonb       -- [{ratio, watch_ratio}, ...] from the API
);
```

### 4.3 New table: `hook_patterns`

```sql
create table public.hook_patterns (
  id             bigserial primary key,
  pattern        text not null,        -- abstracted structure, never verbatim text
  example_hook   text not null,
  avg_retention  real not null,
  sample_size    int  not null,
  active         boolean not null default true,
  computed_at    timestamptz not null default now()
);
```

### 4.4 Added to `spiritual_videos`

| Column | Type | Meaning |
|---|---|---|
| `expires_at` | timestamptz | 24h TTL for `pending` and `rejected` |
| `queue_position` | int | Operator-controlled publish order |
| `scheduled_for` | timestamptz null | Set only when a slot is pinned; otherwise derived |
| `target_seconds` | int | Length this script was written for |
| `seen_at` | timestamptz null | First appearance in the deck |
| `published_slot` | text null | `'00:00'` — proves a slot was filled |

`scheduled_for` is deliberately derived on read from `queue_position` and the
slot list rather than written at approval time. A derived schedule is
self-healing: changing posting times or reordering the queue cannot leave stale
timestamps behind.

### 4.5 New enum values

`video_status` gains nothing. `approved` now means "waiting in line";
`rendering` continues to mean "dispatched". The existing states are sufficient.

`generation_log.outcome` gains `too_long`, `too_short`, `expired`.

---

## 5. Settings catalogue

| Key | Secret | Default | Notes |
|---|---|---|---|
| `gemini_api_key` | yes | — | |
| `gemini_model` | no | `gemini-2.5-flash` | |
| `youtube_client_id` | yes | — | |
| `youtube_client_secret` | yes | — | |
| `youtube_refresh_token` | yes | — | Written by OAuth callback |
| `youtube_privacy` | no | `public` | |
| `github_owner` | no | — | |
| `github_repo` | no | — | |
| `github_dispatch_token` | yes | — | |
| `posting_times` | no | `["00:00","04:00"]` | IST; count defines videos/day |
| `posting_timezone` | no | `Asia/Kolkata` | |
| `scripts_per_day` | no | `8` | |
| `target_seconds` | no | `30` | Range 20–90 |
| `word_count_tolerance` | no | `0.15` | |
| `tts_voice` | no | `en-IN-NeerjaNeural` | |
| `tts_rate` | no | `-4%` | |
| `tts_words_per_minute` | no | `148` | |
| `similarity_threshold` | no | `0.45` | |
| `reject_ttl_hours` | no | `24` | |
| `learning_enabled` | no | `true` | |
| `cron_secret` | **no** | generated | Must stay unencrypted — the `pg_cron` job reads it from SQL and cannot decrypt. It authenticates the tick only; it grants no access to any other value. |

### 5.1 Config loader

`src/lib/env.ts` gains `async function settings()`: loads every row once,
decrypts secrets, merges over `process.env` defaults, and caches in module scope
for 60 seconds. Database values win over environment values.

Roughly 10–15 call sites change from `env.geminiApiKey` to
`(await settings()).geminiApiKey`. The synchronous `env` object remains for the
two Supabase bootstrap values, which cannot come from the database.

---

## 6. Pages

Shared shell: one column, `max-width: 640px`, fixed bottom navigation with four
targets sized at least 48×48px. Built mobile-first; desktop widens the column
and nothing else.

### 6.1 Review — `/`

The swipe deck. One card at a time.

Card contents, in visual order:
1. The **first line of the script**, set large and alone. It decides the video.
2. Play button for the stored MP3, plus duration and word count.
3. Full script body, scrollable within the card.
4. Title, then the five hashtags.
5. Scripture, reference, and a link to `citation_url`.
6. Similarity score, shown only when above 0.30.

Gestures: horizontal drag past 35% of viewport width commits. Card rotates
proportionally to drag distance and tints green right, red left. Below the card,
two buttons perform the same actions for desktop and accessibility. Built on
Pointer Events and CSS transforms; **no new dependency**.

Deck order: unseen first (`seen_at is null`), then rejected-but-unexpired,
oldest first. `seen_at` is stamped when a card is first rendered.

### 6.2 Queue — `/queue`

Approved scripts in publish order, each showing its derived slot
("Tonight 12:00 AM", "Tomorrow 4:00 AM"). Drag to reorder, which rewrites
`queue_position`. Each row can be sent back to the deck. `failed` rows appear at
the top in red with `error_message` and a retry action.

### 6.3 Stats — `/performance`

Published videos ranked by `retention_3s` descending. Each row expands to views,
likes, comments and a sparkline of `retention_curve`. Two summary strips above
the list:

- Retention split by `target_seconds`, so 30s versus 60s is settled with data.
- The current learned finding in one sentence, or "not enough data yet" until
  five qualifying videos exist.

### 6.4 Settings — `/settings`

Grouped as in §5, with a status dot per connection. Secrets render as
`•••• set 3 days ago` and are **never** returned by the API. A "Test" button per
connection performs a live check (Gemini: a one-token completion; YouTube: a
channel fetch; GitHub: a token scope check).

---

## 7. Generation pipeline changes

### 7.1 Duration-aware beat sheet

`master-prompt.ts` currently hardcodes "THE PHYSICS OF THIRTY SECONDS" with
literal second markers. Replace with `buildBeatSheet(targetSeconds)` producing
proportional beats that reproduce today's proven 30-second sheet exactly:

| Beat | Fraction | At 30s | At 60s |
|---|---|---|---|
| Hook | 0 – 6.7% | 0–2s | 0–4s |
| Enter the story | 6.7 – 26.7% | 2–8s | 4–16s |
| The turn | 26.7 – 66.7% | 8–20s | 16–40s |
| The line that lands | 66.7 – 86.7% | 20–26s | 40–52s |
| Close | 86.7 – 100% | 26–30s | 52–60s |

For targets above 45 seconds an extra **second complication** beat is inserted
inside the turn. A long script is not a stretched short one; without a second
turn the middle sags and viewers leave.

### 7.2 Hard duration gate

After synthesis and **before** the row is inserted:

```
if (speech.durationSeconds > targetSeconds * (1 + tolerance)) -> reject 'too_long'
if (speech.durationSeconds < targetSeconds * (1 - tolerance)) -> reject 'too_short'
```

Rejected attempts release the topic and retry within `max_generation_attempts`.

This closes a real gap: today `duration_seconds` is measured and stored
(`generate-video.ts:288`) but never checked, so word count — a proxy — is the
only guard. Long words and heavy punctuation both defeat it.

### 7.3 Learned hooks injected

When `learning_enabled` and at least five qualifying videos exist, the prompt
receives the top three rows from `hook_patterns` as *structural patterns* with
an explicit instruction not to reuse their wording. Below five, nothing is
injected and the prompt is unchanged.

---

## 8. YouTube connection

`GET /api/youtube/connect` redirects to Google's consent screen requesting:

- `youtube.upload` (existing)
- `yt-analytics.readonly` (new — required for retention)
- `youtube.readonly` (new — required to resolve video metadata)

`GET /api/youtube/callback` exchanges the code, encrypts the refresh token into
`app_settings`, and redirects to `/settings`.

The operator must register `${site_url}/api/youtube/callback` as an authorised
redirect URI in Google Cloud Console. This is the one setup step that cannot be
done from the app, and Settings must say so plainly.

Because the scope set widens, **an existing refresh token will not carry over**;
reconnecting once is required.

---

## 9. Analytics and learning

### 9.1 Daily collection

Run inside the tick, once per day, after publishing:

- Batch query: `ids=channel==MINE`, `dimensions=video`,
  `metrics=views,likes,comments,estimatedMinutesWatched,averageViewPercentage`.
- Per video, one retention call: `dimensions=elapsedVideoTimeRatio`,
  `metrics=audienceWatchRatio`, restricted to videos published in the last 30
  days to bound cost.

`retention_3s` is interpolated from the curve at `ratio = 3 / duration_seconds`.

### 9.2 Weekly learning

On Mondays, for videos at least 7 days old with at least 100 views:

1. Rank by `retention_3s`.
2. Take the top five hooks.
3. Ask Gemini to abstract the shared *structure* — never the wording.
4. Replace `hook_patterns` with the result.

Guardrail: only structure is stored and injected, capped at three patterns. This
is deliberate — feeding generated text back into generation collapses variety
and would start tripping the existing similarity check.

---

## 10. Security posture

The operator has explicitly chosen to run with **no authentication**. The URL is
the only secret. Recorded plainly: anyone who learns the URL can approve
scripts, publish to the channel and spend Gemini credit.

Mitigations built regardless:

- Secrets are **write-only** over HTTP. No endpoint returns a decrypted value.
- Destructive actions (purge, reset ledger) require a typed confirmation string.
- `noindex` headers site-wide so the URL cannot be found by search.
- The existing password gate in `middleware.ts` is retained and driven by an
  optional `DASHBOARD_PASSWORD` env var. Unset by default, so it is off, and
  turning it on later is one variable rather than a rewrite. It stays in `env`
  rather than `app_settings` because edge middleware cannot decrypt.

---

## 11. Scripture ledger

Add three Vedic hymns with reliable public-domain translations: **Nasadiya
Sukta** (Rig Veda 10.129), **Gayatri Mantra** (Rig Veda 3.62.10), and **Purusha
Sukta** (Rig Veda 10.90).

Bulk Samhita import is explicitly rejected. The Samhitas are largely ritual and
liturgical; they resist the "one specific pressure a young Indian feels" bridge
that the master prompt requires, and translation quality varies too widely to
cite safely.

Ledger runway at two videos per day is roughly one year.

---

## 12. Out of scope

- Multi-user accounts or roles.
- Editing a script's text by hand before approval.
- Thumbnail generation or selection.
- Comment moderation or replies.
- Any second channel or language.

---

## 13. Assumptions

1. Posting times are IST unless `posting_timezone` says otherwise.
2. Free-tier Supabase stays active because the tick generates continuous API
   traffic, so the 7-day inactivity pause never triggers.
3. GitHub Actions remains the renderer; the operator accepts ~600 minutes of
   monthly usage at 60-second videos.
4. `videos_per_day` is derived from the length of `posting_times`, not stored
   separately, so the two cannot disagree.
