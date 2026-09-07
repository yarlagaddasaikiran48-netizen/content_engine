# Foundation: Encrypted Settings Store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every credential and tuning knob out of `process.env` and into an encrypted database table that is editable from a phone, so the engine can be operated without a laptop.

**Architecture:** A single catalogue file (`catalogue.ts`) declares every setting once — its key, group, type, default, and whether it is secret. That catalogue drives three consumers: the encrypted store, the typed async config loader, and the Settings UI. Secrets are AES-256-GCM encrypted with a key derived from the Supabase service key via HKDF, so `.env` stays at two values. Secrets are write-only over HTTP.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript 5.9, Tailwind 4, Supabase JS 2, Node `crypto`, Vitest (new, dev-only).

**Spec:** `docs/superpowers/specs/2026-09-07-operator-ui-design.md`

## Global Constraints

- `.env` must end this plan containing only `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. `SETTINGS_MASTER_KEY` and `DASHBOARD_PASSWORD` are optional overrides, unset by default.
- No endpoint may return a decrypted secret value. Ever. Masked shape only.
- No new runtime dependencies. Vitest is `devDependencies` only.
- Encryption: AES-256-GCM. Key = `hkdfSync('sha256', serviceRoleKey, 'app_settings.v1', 'settings-encryption', 32)`.
- Stored ciphertext format: base64 of `iv(12) || authTag(16) || ciphertext`.
- `cron_secret` is stored **unencrypted** (`secret: false`) — `pg_cron` reads it from SQL and cannot decrypt.
- Settings written to the database always win over `process.env`.
- Cache TTL for the merged settings object: 60 seconds, module-scope.
- All SQL is idempotent and re-runnable, matching the existing `supabase/schema.sql` convention.
- Path alias `@/*` maps to `./src/*`.

---

### Task 1: Test harness

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json`
- Test: `src/lib/settings/crypto.test.ts` (created in Task 2)

**Interfaces:**
- Consumes: nothing.
- Produces: `npm test` runs Vitest; `@/` alias resolves inside tests.

- [ ] **Step 1: Install Vitest**

```bash
npm install --save-dev vitest@^3 vite-tsconfig-paths@^5
```

- [ ] **Step 2: Create the config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
  },
});
```

- [ ] **Step 3: Add the script**

In `package.json`, inside `"scripts"`, add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Verify the runner starts**

Run: `npm test`
Expected: exits 0 with "No test files found" (no tests exist yet).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "Add Vitest so the settings crypto can be tested"
```

---

### Task 2: Encryption primitives

**Files:**
- Create: `src/lib/settings/crypto.ts`
- Test: `src/lib/settings/crypto.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `deriveSettingsKey(serviceRoleKey: string, override?: string): Buffer`
  - `encryptSetting(plaintext: string, key: Buffer): string` (base64)
  - `decryptSetting(payload: string, key: Buffer): string`

- [ ] **Step 1: Write the failing test**

Create `src/lib/settings/crypto.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { decryptSetting, deriveSettingsKey, encryptSetting } from "@/lib/settings/crypto";

const KEY = deriveSettingsKey("service-role-key-abc123");

describe("deriveSettingsKey", () => {
  it("returns 32 bytes", () => {
    expect(KEY.length).toBe(32);
  });

  it("is deterministic for the same input", () => {
    expect(deriveSettingsKey("service-role-key-abc123").equals(KEY)).toBe(true);
  });

  it("differs when the service key differs", () => {
    expect(deriveSettingsKey("a-different-key").equals(KEY)).toBe(false);
  });

  it("prefers an explicit override when supplied", () => {
    const overridden = deriveSettingsKey("service-role-key-abc123", "explicit-master-key");
    expect(overridden.equals(KEY)).toBe(false);
  });
});

describe("encryptSetting / decryptSetting", () => {
  it("round-trips a value", () => {
    const payload = encryptSetting("AIzaSyExampleGeminiKey", KEY);
    expect(decryptSetting(payload, KEY)).toBe("AIzaSyExampleGeminiKey");
  });

  it("never emits the plaintext", () => {
    const payload = encryptSetting("AIzaSyExampleGeminiKey", KEY);
    expect(payload).not.toContain("AIzaSy");
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const a = encryptSetting("same", KEY);
    const b = encryptSetting("same", KEY);
    expect(a).not.toBe(b);
    expect(decryptSetting(a, KEY)).toBe(decryptSetting(b, KEY));
  });

  it("round-trips an empty string", () => {
    expect(decryptSetting(encryptSetting("", KEY), KEY)).toBe("");
  });

  it("round-trips multi-line and unicode values", () => {
    const value = "line one\nline two — ॐ";
    expect(decryptSetting(encryptSetting(value, KEY), KEY)).toBe(value);
  });

  it("rejects a payload that was tampered with", () => {
    const payload = encryptSetting("secret", KEY);
    const bytes = Buffer.from(payload, "base64");
    bytes[bytes.length - 1] ^= 0xff;
    expect(() => decryptSetting(bytes.toString("base64"), KEY)).toThrow();
  });

  it("rejects decryption under the wrong key", () => {
    const payload = encryptSetting("secret", KEY);
    expect(() => decryptSetting(payload, deriveSettingsKey("wrong"))).toThrow();
  });

  it("rejects a payload too short to contain iv and tag", () => {
    expect(() => decryptSetting(Buffer.from("short").toString("base64"), KEY)).toThrow(
      /malformed/i,
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/lib/settings/crypto.test.ts`
Expected: FAIL — cannot resolve `@/lib/settings/crypto`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/settings/crypto.ts`:

```ts
/**
 * Encryption for the settings table.
 *
 * The key is derived from the Supabase service-role key rather than being a
 * separate secret to paste, which is what keeps .env down to two values. The
 * trade-off is explicit: rotating the service key makes existing ciphertext
 * unreadable, so SETTINGS_MASTER_KEY exists as an override for that day.
 */

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

const HKDF_SALT = "app_settings.v1";
const HKDF_INFO = "settings-encryption";

/**
 * 32 bytes of key material. `override` wins when present so a rotated service
 * key does not strand the stored secrets.
 */
export function deriveSettingsKey(serviceRoleKey: string, override?: string): Buffer {
  const material = override && override.trim() !== "" ? override.trim() : serviceRoleKey;
  if (!material || material.trim() === "") {
    throw new Error("Cannot derive a settings key from an empty secret.");
  }
  return Buffer.from(hkdfSync("sha256", material, HKDF_SALT, HKDF_INFO, KEY_BYTES));
}

/** base64( iv | authTag | ciphertext ) */
export function encryptSetting(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}

export function decryptSetting(payload: string, key: Buffer): string {
  const raw = Buffer.from(payload, "base64");
  if (raw.length < IV_BYTES + TAG_BYTES) {
    throw new Error("Stored setting is malformed: too short to contain an IV and auth tag.");
  }
  const iv = raw.subarray(0, IV_BYTES);
  const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = raw.subarray(IV_BYTES + TAG_BYTES);

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/lib/settings/crypto.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/settings/crypto.ts src/lib/settings/crypto.test.ts
git commit -m "Encrypt settings with a key derived from the service key"
```

---

### Task 3: Setting catalogue

**Files:**
- Create: `src/lib/settings/catalogue.ts`
- Test: `src/lib/settings/catalogue.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type SettingGroup = "connections" | "publishing" | "writing" | "advanced"`
  - `type SettingKind = "text" | "password" | "number" | "boolean" | "select" | "times"`
  - `interface SettingDef { key; group; label; kind; secret; fallbackEnv?; fallback: string; options?: string[]; min?: number; max?: number; help?: string }`
  - `const SETTING_DEFS: readonly SettingDef[]`
  - `function settingDef(key: string): SettingDef` (throws on unknown key)

This is the single source of truth for Tasks 4, 5, 6 and 8. Adding a setting later means editing this file only.

- [ ] **Step 1: Write the failing test**

Create `src/lib/settings/catalogue.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SETTING_DEFS, settingDef } from "@/lib/settings/catalogue";

describe("SETTING_DEFS", () => {
  it("has unique keys", () => {
    const keys = SETTING_DEFS.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("uses snake_case keys so they read the same in SQL and the UI", () => {
    for (const def of SETTING_DEFS) {
      expect(def.key, `${def.key} is not snake_case`).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it("gives every setting a non-empty label", () => {
    for (const def of SETTING_DEFS) {
      expect(def.label.trim().length, `${def.key} has no label`).toBeGreaterThan(0);
    }
  });

  it("keeps cron_secret unencrypted because pg_cron reads it from SQL", () => {
    expect(settingDef("cron_secret").secret).toBe(false);
  });

  it("marks every credential as secret", () => {
    for (const key of [
      "gemini_api_key",
      "youtube_client_id",
      "youtube_client_secret",
      "youtube_refresh_token",
      "github_dispatch_token",
    ]) {
      expect(settingDef(key).secret, `${key} must be secret`).toBe(true);
    }
  });

  it("gives every select a fallback drawn from its own options", () => {
    for (const def of SETTING_DEFS) {
      if (def.kind === "select") {
        expect(def.options, `${def.key} is a select with no options`).toBeDefined();
        expect(def.options).toContain(def.fallback);
      }
    }
  });

  it("bounds target_seconds to the range the spec allows", () => {
    const def = settingDef("target_seconds");
    expect(def.min).toBe(20);
    expect(def.max).toBe(90);
    expect(def.fallback).toBe("30");
  });

  it("defaults posting_times to the two slots the operator chose", () => {
    expect(JSON.parse(settingDef("posting_times").fallback)).toEqual(["00:00", "04:00"]);
  });

  it("throws a helpful error for an unknown key", () => {
    expect(() => settingDef("nope")).toThrow(/unknown setting/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/lib/settings/catalogue.test.ts`
Expected: FAIL — cannot resolve `@/lib/settings/catalogue`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/settings/catalogue.ts`:

```ts
/**
 * Every setting, declared once.
 *
 * Three things read this file: the encrypted store (to know what to encrypt),
 * the config loader (to know the fallbacks), and the Settings page (to know
 * what to render). Adding a knob means editing here and nowhere else.
 */

export type SettingGroup = "connections" | "publishing" | "writing" | "advanced";

export type SettingKind = "text" | "password" | "number" | "boolean" | "select" | "times";

export interface SettingDef {
  key: string;
  group: SettingGroup;
  label: string;
  kind: SettingKind;
  /** Encrypted at rest, and never returned over HTTP. */
  secret: boolean;
  /** Environment variable consulted when the row is unset. */
  fallbackEnv?: string;
  /** Used when neither the row nor the environment supplies a value. */
  fallback: string;
  options?: string[];
  min?: number;
  max?: number;
  help?: string;
}

export const SETTING_DEFS: readonly SettingDef[] = [
  // ---- connections -------------------------------------------------------
  {
    key: "gemini_api_key",
    group: "connections",
    label: "Gemini API key",
    kind: "password",
    secret: true,
    fallbackEnv: "GEMINI_API_KEY",
    fallback: "",
    help: "From aistudio.google.com. Free tier is enough for eight scripts a day.",
  },
  {
    key: "gemini_model",
    group: "connections",
    label: "Gemini model",
    kind: "text",
    secret: false,
    fallbackEnv: "GEMINI_MODEL",
    fallback: "gemini-2.5-flash",
  },
  {
    key: "youtube_client_id",
    group: "connections",
    label: "YouTube client ID",
    kind: "password",
    secret: true,
    fallbackEnv: "YOUTUBE_CLIENT_ID",
    fallback: "",
  },
  {
    key: "youtube_client_secret",
    group: "connections",
    label: "YouTube client secret",
    kind: "password",
    secret: true,
    fallbackEnv: "YOUTUBE_CLIENT_SECRET",
    fallback: "",
  },
  {
    key: "youtube_refresh_token",
    group: "connections",
    label: "YouTube refresh token",
    kind: "password",
    secret: true,
    fallbackEnv: "YOUTUBE_REFRESH_TOKEN",
    fallback: "",
    help: "Written automatically by the Connect YouTube button.",
  },
  {
    key: "github_owner",
    group: "connections",
    label: "GitHub owner",
    kind: "text",
    secret: false,
    fallbackEnv: "GITHUB_OWNER",
    fallback: "",
  },
  {
    key: "github_repo",
    group: "connections",
    label: "GitHub repo",
    kind: "text",
    secret: false,
    fallbackEnv: "GITHUB_REPO",
    fallback: "",
  },
  {
    key: "github_dispatch_token",
    group: "connections",
    label: "GitHub dispatch token",
    kind: "password",
    secret: true,
    fallbackEnv: "GITHUB_DISPATCH_TOKEN",
    fallback: "",
    help: "A fine-grained token with Actions: read and write on this repo.",
  },

  // ---- publishing --------------------------------------------------------
  {
    key: "posting_times",
    group: "publishing",
    label: "Posting times",
    kind: "times",
    secret: false,
    fallback: '["00:00","04:00"]',
    help: "How many times you list is how many videos go out per day.",
  },
  {
    key: "posting_timezone",
    group: "publishing",
    label: "Timezone",
    kind: "text",
    secret: false,
    fallback: "Asia/Kolkata",
  },
  {
    key: "youtube_privacy",
    group: "publishing",
    label: "Privacy",
    kind: "select",
    secret: false,
    options: ["public", "unlisted", "private"],
    fallbackEnv: "YOUTUBE_PRIVACY_STATUS",
    fallback: "public",
  },

  // ---- writing -----------------------------------------------------------
  {
    key: "scripts_per_day",
    group: "writing",
    label: "Scripts generated per day",
    kind: "number",
    secret: false,
    min: 1,
    max: 30,
    fallback: "8",
    help: "How many you swipe through. Only the ones you approve get published.",
  },
  {
    key: "target_seconds",
    group: "writing",
    label: "Video length (seconds)",
    kind: "number",
    secret: false,
    min: 20,
    max: 90,
    fallbackEnv: "TARGET_SECONDS",
    fallback: "30",
    help: "The word count and the prompt's beat sheet both follow this.",
  },
  {
    key: "word_count_tolerance",
    group: "writing",
    label: "Length tolerance",
    kind: "number",
    secret: false,
    min: 0.05,
    max: 0.4,
    fallbackEnv: "WORD_COUNT_TOLERANCE",
    fallback: "0.15",
  },
  {
    key: "tts_voice",
    group: "writing",
    label: "Voice",
    kind: "text",
    secret: false,
    fallbackEnv: "TTS_VOICE",
    fallback: "en-IN-NeerjaNeural",
  },
  {
    key: "tts_rate",
    group: "writing",
    label: "Speaking rate",
    kind: "text",
    secret: false,
    fallbackEnv: "TTS_RATE",
    fallback: "-4%",
  },
  {
    key: "tts_words_per_minute",
    group: "writing",
    label: "Measured words per minute",
    kind: "number",
    secret: false,
    min: 60,
    max: 260,
    fallbackEnv: "TTS_WORDS_PER_MINUTE",
    fallback: "148",
    help: "Retune this if you change voice or rate; the word window follows it.",
  },
  {
    key: "similarity_threshold",
    group: "writing",
    label: "Duplicate similarity limit",
    kind: "number",
    secret: false,
    min: 0.1,
    max: 0.9,
    fallbackEnv: "SIMILARITY_THRESHOLD",
    fallback: "0.45",
  },
  {
    key: "learning_enabled",
    group: "writing",
    label: "Learn from retention",
    kind: "boolean",
    secret: false,
    fallback: "true",
  },

  // ---- advanced ----------------------------------------------------------
  {
    key: "reject_ttl_hours",
    group: "advanced",
    label: "Rejected scripts expire after (hours)",
    kind: "number",
    secret: false,
    min: 1,
    max: 168,
    fallback: "24",
  },
  {
    key: "cron_secret",
    group: "advanced",
    label: "Scheduler secret",
    kind: "text",
    // Deliberately NOT secret: the pg_cron job reads this straight from SQL to
    // authenticate its own tick, and SQL cannot decrypt. It authorises nothing
    // beyond triggering the tick.
    secret: false,
    fallbackEnv: "CRON_SECRET",
    fallback: "",
  },
  {
    key: "site_url",
    group: "advanced",
    label: "Site URL",
    kind: "text",
    secret: false,
    fallbackEnv: "NEXT_PUBLIC_SITE_URL",
    fallback: "",
    help: "Used for the YouTube redirect URI and by the scheduler.",
  },
] as const;

const BY_KEY = new Map(SETTING_DEFS.map((def) => [def.key, def]));

export function settingDef(key: string): SettingDef {
  const def = BY_KEY.get(key);
  if (!def) {
    throw new Error(`Unknown setting "${key}". Add it to SETTING_DEFS first.`);
  }
  return def;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/lib/settings/catalogue.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/settings/catalogue.ts src/lib/settings/catalogue.test.ts
git commit -m "Declare every setting once in a catalogue"
```

---

### Task 4: Database migration

**Files:**
- Create: `supabase/migrations/001_settings_and_scheduling.sql`
- Modify: `supabase/schema.sql` (append a pointer comment)

**Interfaces:**
- Consumes: nothing.
- Produces: tables `app_settings`, `system_lock`; columns on `spiritual_videos`.

`system_lock` and the `spiritual_videos` columns land here rather than in a later plan because they are pure schema, they are idempotent, and having one migration to run is kinder than three.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/001_settings_and_scheduling.sql`:

```sql
-- ============================================================================
--  Migration 001 — settings store, scheduler lock, queue columns
--  Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- app_settings — every credential and knob, editable from the UI.
--   value_enc holds base64(iv|tag|ciphertext) when is_secret, else plain text.
--   Non-secret rows stay readable so the pg_cron job can read posting times
--   and its own secret directly from SQL.
-- ---------------------------------------------------------------------------
create table if not exists public.app_settings (
  key        text primary key,
  value_enc  text,
  is_secret  boolean     not null default false,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

-- ---------------------------------------------------------------------------
-- system_lock — leases that stop two scheduler ticks running at once.
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
create or replace function public.try_lock(p_name text, p_seconds int default 240)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  acquired boolean := false;
begin
  update public.system_lock
     set locked_until = now() + make_interval(secs => p_seconds),
         updated_at   = now()
   where name = p_name
     and (locked_until is null or locked_until < now());

  get diagnostics acquired = row_count;
  return acquired > 0;
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
-- spiritual_videos — columns the swipe deck and the publish queue need.
-- ---------------------------------------------------------------------------
alter table public.spiritual_videos
  add column if not exists expires_at      timestamptz,
  add column if not exists queue_position  int,
  add column if not exists scheduled_for   timestamptz,
  add column if not exists target_seconds  int,
  add column if not exists seen_at         timestamptz,
  add column if not exists published_slot  text;

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
```

- [ ] **Step 2: Point the main schema at it**

Append to `supabase/schema.sql`:

```sql
-- ============================================================================
--  Migrations applied after this file:
--    supabase/migrations/001_settings_and_scheduling.sql
--  Run them in order after this one. Each is idempotent.
-- ============================================================================
```

- [ ] **Step 3: Verify the SQL parses**

Paste `supabase/migrations/001_settings_and_scheduling.sql` into the Supabase SQL editor and run it.
Expected: "Success. No rows returned."

Then confirm the lock helper works:

```sql
select public.try_lock('tick', 60);   -- expect true
select public.try_lock('tick', 60);   -- expect false, still held
select public.release_lock('tick');
select public.try_lock('tick', 60);   -- expect true again
select public.release_lock('tick');
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/001_settings_and_scheduling.sql supabase/schema.sql
git commit -m "Add settings table, scheduler lock and queue columns"
```

---

### Task 5: Settings store

**Files:**
- Create: `src/lib/settings/store.ts`
- Test: `src/lib/settings/store.test.ts`

**Interfaces:**
- Consumes: `crypto.ts`, `catalogue.ts`, `@/lib/supabase/admin`.
- Produces:
  - `interface StoredSetting { key: string; value: string | null; updatedAt: string | null }`
  - `interface MaskedSetting { key: string; group: SettingGroup; label: string; kind: SettingKind; secret: boolean; value: string | null; isSet: boolean; updatedAt: string | null; options?: string[]; min?: number; max?: number; help?: string }`
  - `async function readRawSettings(): Promise<Map<string, StoredSetting>>`
  - `async function writeSettings(updates: Record<string, string>): Promise<void>`
  - `async function maskedSettings(): Promise<MaskedSetting[]>`
  - `function invalidateSettingsCache(): void`

`maskedSettings()` is the only shape allowed to leave the server. For a secret it sets `value: null` and `isSet: true`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/settings/store.test.ts`. It stubs the Supabase admin module so no network is touched:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const rows = new Map<string, { key: string; value_enc: string | null; is_secret: boolean; updated_at: string }>();

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: () => ({
    from: () => ({
      select: async () => ({ data: [...rows.values()], error: null }),
      upsert: async (payload: Array<{ key: string; value_enc: string | null; is_secret: boolean }>) => {
        for (const row of payload) {
          rows.set(row.key, { ...row, updated_at: new Date().toISOString() });
        }
        return { error: null };
      },
    }),
  }),
}));

process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";

const { invalidateSettingsCache, maskedSettings, readRawSettings, writeSettings } = await import(
  "@/lib/settings/store"
);

beforeEach(() => {
  rows.clear();
  invalidateSettingsCache();
});

describe("writeSettings / readRawSettings", () => {
  it("round-trips a non-secret in clear text", async () => {
    await writeSettings({ scripts_per_day: "12" });
    expect(rows.get("scripts_per_day")!.value_enc).toBe("12");
    expect(rows.get("scripts_per_day")!.is_secret).toBe(false);
    expect((await readRawSettings()).get("scripts_per_day")!.value).toBe("12");
  });

  it("round-trips a secret without ever storing the plaintext", async () => {
    await writeSettings({ gemini_api_key: "AIzaSyRealLookingKey" });
    expect(rows.get("gemini_api_key")!.value_enc).not.toContain("AIzaSy");
    expect(rows.get("gemini_api_key")!.is_secret).toBe(true);
    expect((await readRawSettings()).get("gemini_api_key")!.value).toBe("AIzaSyRealLookingKey");
  });

  it("stores cron_secret unencrypted so SQL can read it", async () => {
    await writeSettings({ cron_secret: "tick-secret-123" });
    expect(rows.get("cron_secret")!.value_enc).toBe("tick-secret-123");
    expect(rows.get("cron_secret")!.is_secret).toBe(false);
  });

  it("clears a value when handed an empty string", async () => {
    await writeSettings({ gemini_api_key: "something" });
    invalidateSettingsCache();
    await writeSettings({ gemini_api_key: "" });
    expect(rows.get("gemini_api_key")!.value_enc).toBeNull();
    expect((await readRawSettings()).get("gemini_api_key")!.value).toBeNull();
  });

  it("rejects an unknown key rather than storing junk", async () => {
    await expect(writeSettings({ not_a_setting: "x" })).rejects.toThrow(/unknown setting/i);
  });

  it("survives a row whose ciphertext no longer decrypts", async () => {
    rows.set("gemini_api_key", {
      key: "gemini_api_key",
      value_enc: "bm90LXZhbGlkLWNpcGhlcnRleHQ=",
      is_secret: true,
      updated_at: new Date().toISOString(),
    });
    const read = await readRawSettings();
    expect(read.get("gemini_api_key")!.value).toBeNull();
  });
});

describe("maskedSettings", () => {
  it("never returns a secret value but does say it is set", async () => {
    await writeSettings({ gemini_api_key: "AIzaSyRealLookingKey" });
    invalidateSettingsCache();
    const masked = await maskedSettings();
    const gemini = masked.find((m) => m.key === "gemini_api_key")!;
    expect(gemini.value).toBeNull();
    expect(gemini.isSet).toBe(true);
    expect(JSON.stringify(masked)).not.toContain("AIzaSy");
  });

  it("returns non-secret values in clear so the form can show them", async () => {
    await writeSettings({ tts_voice: "en-IN-PrabhatNeural" });
    invalidateSettingsCache();
    const masked = await maskedSettings();
    expect(masked.find((m) => m.key === "tts_voice")!.value).toBe("en-IN-PrabhatNeural");
  });

  it("returns one entry per catalogue setting even when nothing is stored", async () => {
    const { SETTING_DEFS } = await import("@/lib/settings/catalogue");
    expect((await maskedSettings()).length).toBe(SETTING_DEFS.length);
  });

  it("reports an unset secret as not set", async () => {
    const masked = await maskedSettings();
    expect(masked.find((m) => m.key === "gemini_api_key")!.isSet).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/lib/settings/store.test.ts`
Expected: FAIL — cannot resolve `@/lib/settings/store`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/settings/store.ts`:

```ts
/**
 * Reads and writes the app_settings table.
 *
 * Two rules the rest of the app depends on:
 *  - Only `maskedSettings()` is safe to serialise over HTTP. A secret's value
 *    is replaced with null; callers learn that it is set, never what it is.
 *  - A row whose ciphertext will not decrypt is treated as unset rather than
 *    thrown, so one bad row cannot take the whole Settings page down.
 */

import {
  SETTING_DEFS,
  settingDef,
  type SettingGroup,
  type SettingKind,
} from "@/lib/settings/catalogue";
import { decryptSetting, deriveSettingsKey, encryptSetting } from "@/lib/settings/crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";

export interface StoredSetting {
  key: string;
  value: string | null;
  updatedAt: string | null;
}

export interface MaskedSetting {
  key: string;
  group: SettingGroup;
  label: string;
  kind: SettingKind;
  secret: boolean;
  /** Always null for secrets. */
  value: string | null;
  isSet: boolean;
  updatedAt: string | null;
  options?: string[];
  min?: number;
  max?: number;
  help?: string;
}

const CACHE_MS = 60_000;

let cache: { at: number; rows: Map<string, StoredSetting> } | null = null;

export function invalidateSettingsCache(): void {
  cache = null;
}

function key(): Buffer {
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return deriveSettingsKey(service, process.env.SETTINGS_MASTER_KEY);
}

export async function readRawSettings(): Promise<Map<string, StoredSetting>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.rows;

  const { data, error } = await supabaseAdmin()
    .from("app_settings")
    .select("key, value_enc, is_secret, updated_at");

  if (error) throw new Error(`Could not read app_settings: ${error.message}`);

  const encryptionKey = key();
  const rows = new Map<string, StoredSetting>();

  for (const row of (data ?? []) as Array<{
    key: string;
    value_enc: string | null;
    is_secret: boolean;
    updated_at: string;
  }>) {
    let value: string | null = row.value_enc;
    if (value !== null && row.is_secret) {
      try {
        value = decryptSetting(value, encryptionKey);
      } catch {
        // A rotated service key, or a corrupted row. Treat as unset so the
        // operator can simply paste the credential again.
        value = null;
      }
    }
    rows.set(row.key, { key: row.key, value, updatedAt: row.updated_at });
  }

  cache = { at: Date.now(), rows };
  return rows;
}

export async function writeSettings(updates: Record<string, string>): Promise<void> {
  const encryptionKey = key();

  const payload = Object.entries(updates).map(([k, raw]) => {
    const def = settingDef(k); // throws on an unknown key
    const trimmed = raw.trim();
    if (trimmed === "") {
      return { key: k, value_enc: null, is_secret: def.secret, updated_at: new Date().toISOString() };
    }
    return {
      key: k,
      value_enc: def.secret ? encryptSetting(trimmed, encryptionKey) : trimmed,
      is_secret: def.secret,
      updated_at: new Date().toISOString(),
    };
  });

  const { error } = await supabaseAdmin().from("app_settings").upsert(payload);
  if (error) throw new Error(`Could not write app_settings: ${error.message}`);

  invalidateSettingsCache();
}

export async function maskedSettings(): Promise<MaskedSetting[]> {
  const rows = await readRawSettings();

  return SETTING_DEFS.map((def) => {
    const row = rows.get(def.key);
    const stored = row?.value ?? null;
    const isSet = stored !== null && stored !== "";

    return {
      key: def.key,
      group: def.group,
      label: def.label,
      kind: def.kind,
      secret: def.secret,
      value: def.secret ? null : stored,
      isSet,
      updatedAt: row?.updatedAt ?? null,
      options: def.options,
      min: def.min,
      max: def.max,
      help: def.help,
    };
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/lib/settings/store.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/settings/store.ts src/lib/settings/store.test.ts
git commit -m "Read and write settings, masking secrets on the way out"
```

---

### Task 6: Async config loader

**Files:**
- Create: `src/lib/settings/config.ts`
- Test: `src/lib/settings/config.test.ts`
- Modify: `src/lib/env.ts`

**Interfaces:**
- Consumes: `store.ts`, `catalogue.ts`.
- Produces:
  - `interface AppConfig` with camelCase typed fields (see code).
  - `async function loadConfig(): Promise<AppConfig>`
  - `async function requireSetting(key: string): Promise<string>` — throws a message naming the Settings page.
  - `function wordWindow(cfg: AppConfig): { ideal: number; min: number; max: number }`

`src/lib/env.ts` keeps only the two Supabase bootstrap getters plus `features`; everything else is superseded. Existing call sites migrate in Task 7 of Plan 2 — this task deliberately leaves `env` intact so nothing breaks mid-plan.

- [ ] **Step 1: Write the failing test**

Create `src/lib/settings/config.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const stored = new Map<string, { key: string; value: string | null; updatedAt: string | null }>();

vi.mock("@/lib/settings/store", () => ({
  readRawSettings: async () => stored,
  invalidateSettingsCache: () => {},
}));

const { loadConfig, requireSetting, wordWindow } = await import("@/lib/settings/config");

beforeEach(() => {
  stored.clear();
  delete process.env.TARGET_SECONDS;
  delete process.env.GEMINI_API_KEY;
});

function set(key: string, value: string) {
  stored.set(key, { key, value, updatedAt: new Date().toISOString() });
}

describe("loadConfig", () => {
  it("falls back to the catalogue default when nothing is stored", async () => {
    expect((await loadConfig()).targetSeconds).toBe(30);
  });

  it("uses the environment variable when the row is unset", async () => {
    process.env.TARGET_SECONDS = "45";
    expect((await loadConfig()).targetSeconds).toBe(45);
  });

  it("lets the stored row beat the environment variable", async () => {
    process.env.TARGET_SECONDS = "45";
    set("target_seconds", "60");
    expect((await loadConfig()).targetSeconds).toBe(60);
  });

  it("parses posting_times into an array", async () => {
    expect((await loadConfig()).postingTimes).toEqual(["00:00", "04:00"]);
  });

  it("falls back to the default slots when posting_times is malformed", async () => {
    set("posting_times", "not json");
    expect((await loadConfig()).postingTimes).toEqual(["00:00", "04:00"]);
  });

  it("derives videosPerDay from the number of posting times", async () => {
    set("posting_times", '["00:00","04:00","12:00"]');
    expect((await loadConfig()).videosPerDay).toBe(3);
  });

  it("parses booleans", async () => {
    set("learning_enabled", "false");
    expect((await loadConfig()).learningEnabled).toBe(false);
  });

  it("clamps a number below its catalogue minimum", async () => {
    set("target_seconds", "5");
    expect((await loadConfig()).targetSeconds).toBe(20);
  });

  it("clamps a number above its catalogue maximum", async () => {
    set("target_seconds", "600");
    expect((await loadConfig()).targetSeconds).toBe(90);
  });

  it("ignores a non-numeric number and uses the default", async () => {
    set("scripts_per_day", "lots");
    expect((await loadConfig()).scriptsPerDay).toBe(8);
  });
});

describe("wordWindow", () => {
  it("reproduces the documented 30s window", async () => {
    const w = wordWindow(await loadConfig());
    expect(w.ideal).toBe(74);
    expect(w.min).toBe(63);
    expect(w.max).toBe(85);
  });

  it("scales with the configured length", async () => {
    set("target_seconds", "60");
    const w = wordWindow(await loadConfig());
    expect(w.ideal).toBe(148);
    expect(w.min).toBe(126);
    expect(w.max).toBe(170);
  });

  it("follows the voice's measured rate", async () => {
    set("target_seconds", "45");
    set("tts_words_per_minute", "132");
    set("word_count_tolerance", "0.1");
    const w = wordWindow(await loadConfig());
    expect(w.ideal).toBe(99);
    expect(w.min).toBe(89);
    expect(w.max).toBe(109);
  });
});

describe("requireSetting", () => {
  it("returns a set value", async () => {
    set("gemini_api_key", "AIzaKey");
    expect(await requireSetting("gemini_api_key")).toBe("AIzaKey");
  });

  it("throws a message that names the Settings page", async () => {
    await expect(requireSetting("gemini_api_key")).rejects.toThrow(/Settings/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/lib/settings/config.test.ts`
Expected: FAIL — cannot resolve `@/lib/settings/config`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/settings/config.ts`:

```ts
/**
 * The typed, merged view of configuration.
 *
 * Precedence, highest first: the app_settings row, then the environment
 * variable named in the catalogue, then the catalogue's own fallback. That
 * order is what lets an operator override a deploy-time value from a phone
 * without ever editing an environment variable again.
 */

import { SETTING_DEFS, settingDef } from "@/lib/settings/catalogue";
import { readRawSettings } from "@/lib/settings/store";

export interface AppConfig {
  geminiApiKey: string;
  geminiModel: string;

  youtubeClientId: string;
  youtubeClientSecret: string;
  youtubeRefreshToken: string;
  youtubePrivacy: string;

  githubOwner: string;
  githubRepo: string;
  githubDispatchToken: string;

  postingTimes: string[];
  postingTimezone: string;
  /** Derived: one video per configured slot. Never stored separately. */
  videosPerDay: number;

  scriptsPerDay: number;
  targetSeconds: number;
  wordCountTolerance: number;
  ttsVoice: string;
  ttsRate: string;
  ttsWordsPerMinute: number;
  similarityThreshold: number;
  learningEnabled: boolean;

  rejectTtlHours: number;
  cronSecret: string;
  siteUrl: string;
}

const DEFAULT_SLOTS = ["00:00", "04:00"];

/** Row, then environment, then catalogue fallback. */
function resolve(rows: Map<string, { value: string | null }>, key: string): string {
  const def = settingDef(key);
  const row = rows.get(key)?.value;
  if (row !== undefined && row !== null && row !== "") return row;
  if (def.fallbackEnv) {
    const fromEnv = process.env[def.fallbackEnv];
    if (fromEnv && fromEnv.trim() !== "") return fromEnv.trim();
  }
  return def.fallback;
}

function asNumber(rows: Map<string, { value: string | null }>, key: string): number {
  const def = settingDef(key);
  const parsed = Number(resolve(rows, key));
  const fallback = Number(def.fallback);
  if (!Number.isFinite(parsed)) return fallback;
  if (def.min !== undefined && parsed < def.min) return def.min;
  if (def.max !== undefined && parsed > def.max) return def.max;
  return parsed;
}

function asBoolean(rows: Map<string, { value: string | null }>, key: string): boolean {
  return resolve(rows, key) === "true";
}

function asTimes(rows: Map<string, { value: string | null }>): string[] {
  try {
    const parsed = JSON.parse(resolve(rows, "posting_times"));
    if (
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      parsed.every((t) => typeof t === "string" && /^\d{2}:\d{2}$/.test(t))
    ) {
      return parsed;
    }
  } catch {
    // fall through
  }
  return DEFAULT_SLOTS;
}

export async function loadConfig(): Promise<AppConfig> {
  const rows = await readRawSettings();
  const postingTimes = asTimes(rows);

  return {
    geminiApiKey: resolve(rows, "gemini_api_key"),
    geminiModel: resolve(rows, "gemini_model"),

    youtubeClientId: resolve(rows, "youtube_client_id"),
    youtubeClientSecret: resolve(rows, "youtube_client_secret"),
    youtubeRefreshToken: resolve(rows, "youtube_refresh_token"),
    youtubePrivacy: resolve(rows, "youtube_privacy"),

    githubOwner: resolve(rows, "github_owner"),
    githubRepo: resolve(rows, "github_repo"),
    githubDispatchToken: resolve(rows, "github_dispatch_token"),

    postingTimes,
    postingTimezone: resolve(rows, "posting_timezone"),
    videosPerDay: postingTimes.length,

    scriptsPerDay: asNumber(rows, "scripts_per_day"),
    targetSeconds: asNumber(rows, "target_seconds"),
    wordCountTolerance: asNumber(rows, "word_count_tolerance"),
    ttsVoice: resolve(rows, "tts_voice"),
    ttsRate: resolve(rows, "tts_rate"),
    ttsWordsPerMinute: asNumber(rows, "tts_words_per_minute"),
    similarityThreshold: asNumber(rows, "similarity_threshold"),
    learningEnabled: asBoolean(rows, "learning_enabled"),

    rejectTtlHours: asNumber(rows, "reject_ttl_hours"),
    cronSecret: resolve(rows, "cron_secret"),
    siteUrl: resolve(rows, "site_url").replace(/\/+$/, ""),
  };
}

export async function requireSetting(key: string): Promise<string> {
  const rows = await readRawSettings();
  const value = resolve(rows, key);
  if (!value || value.trim() === "") {
    throw new Error(
      `${settingDef(key).label} is not set. Open Settings and add it, then try again.`,
    );
  }
  return value;
}

/**
 * The one place a target duration becomes a word count. Everything that cares
 * about length — the prompt, the validator, the duration gate — reads this, so
 * they cannot disagree.
 */
export function wordWindow(cfg: AppConfig): { ideal: number; min: number; max: number } {
  const ideal = Math.round((cfg.targetSeconds * cfg.ttsWordsPerMinute) / 60);
  return {
    ideal,
    min: Math.round(ideal * (1 - cfg.wordCountTolerance)),
    max: Math.round(ideal * (1 + cfg.wordCountTolerance)),
  };
}

/** Names of every catalogue key, for callers that iterate. */
export const SETTING_KEYS = SETTING_DEFS.map((d) => d.key);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/lib/settings/config.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 5: Typecheck the whole project**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/settings/config.ts src/lib/settings/config.test.ts
git commit -m "Merge stored settings over env into one typed config"
```

---

### Task 7: Settings API

**Files:**
- Create: `src/app/api/settings/route.ts`
- Create: `src/app/api/settings/test/route.ts`

**Interfaces:**
- Consumes: `store.ts`, `config.ts`.
- Produces:
  - `GET /api/settings` → `{ ok: true, data: { settings: MaskedSetting[] } }`
  - `POST /api/settings` body `{ updates: Record<string,string> }` → `{ ok: true, data: { saved: number } }`
  - `POST /api/settings/test` body `{ target: "gemini" | "youtube" | "github" }` → `{ ok: true, data: { target, healthy: boolean, detail: string } }`

- [ ] **Step 1: Write the settings route**

Create `src/app/api/settings/route.ts`:

```ts
import { fail, messageOf, ok } from "@/lib/api";
import { maskedSettings, writeSettings } from "@/lib/settings/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET returns the masked catalogue: enough for the form to render, never
 * enough to read a credential back out. A secret comes back as
 * `{ value: null, isSet: true }`.
 */
export async function GET() {
  try {
    return ok({ settings: await maskedSettings() });
  } catch (error) {
    return fail(messageOf(error), 500);
  }
}

/**
 * POST accepts a partial map of key -> value. An empty string clears a value.
 * Unknown keys are rejected by writeSettings rather than silently stored.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { updates?: Record<string, string> };
    const updates = body.updates ?? {};

    if (typeof updates !== "object" || Array.isArray(updates)) {
      return fail("Expected an object of setting keys to values.", 400);
    }
    const entries = Object.entries(updates);
    if (entries.length === 0) return fail("No settings supplied.", 400);
    if (entries.some(([, v]) => typeof v !== "string")) {
      return fail("Every setting value must be a string.", 400);
    }

    await writeSettings(updates);
    return ok({ saved: entries.length });
  } catch (error) {
    return fail(messageOf(error), 400);
  }
}
```

- [ ] **Step 2: Write the connection test route**

Create `src/app/api/settings/test/route.ts`:

```ts
import { fail, messageOf, ok } from "@/lib/api";
import { loadConfig } from "@/lib/settings/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Target = "gemini" | "youtube" | "github";

/**
 * A live check per connection, so a wrong key is caught while the operator is
 * still looking at the field rather than at 4am when a publish fails.
 */
async function probe(target: Target): Promise<string> {
  const cfg = await loadConfig();

  if (target === "gemini") {
    if (!cfg.geminiApiKey) throw new Error("No Gemini API key saved.");
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(cfg.geminiApiKey)}`,
      { cache: "no-store" },
    );
    if (!response.ok) throw new Error(`Gemini rejected the key (HTTP ${response.status}).`);
    const body = (await response.json()) as { models?: unknown[] };
    return `Key works. ${body.models?.length ?? 0} models visible.`;
  }

  if (target === "github") {
    if (!cfg.githubOwner || !cfg.githubRepo) throw new Error("Owner and repo are both required.");
    if (!cfg.githubDispatchToken) throw new Error("No GitHub token saved.");
    const response = await fetch(
      `https://api.github.com/repos/${cfg.githubOwner}/${cfg.githubRepo}`,
      {
        headers: {
          Authorization: `Bearer ${cfg.githubDispatchToken}`,
          Accept: "application/vnd.github+json",
        },
        cache: "no-store",
      },
    );
    if (!response.ok) {
      throw new Error(
        response.status === 404
          ? "Repo not found, or the token cannot see it."
          : `GitHub rejected the token (HTTP ${response.status}).`,
      );
    }
    return `Reached ${cfg.githubOwner}/${cfg.githubRepo}.`;
  }

  if (!cfg.youtubeRefreshToken) throw new Error("YouTube is not connected yet.");
  const token = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.youtubeClientId,
      client_secret: cfg.youtubeClientSecret,
      refresh_token: cfg.youtubeRefreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  if (!token.ok) throw new Error("The saved refresh token was refused. Reconnect YouTube.");
  const { access_token } = (await token.json()) as { access_token: string };

  const channel = await fetch(
    "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
    { headers: { Authorization: `Bearer ${access_token}` }, cache: "no-store" },
  );
  if (!channel.ok) throw new Error(`Could not read the channel (HTTP ${channel.status}).`);
  const body = (await channel.json()) as { items?: Array<{ snippet: { title: string } }> };
  const title = body.items?.[0]?.snippet.title;
  return title ? `Connected to "${title}".` : "Connected, but no channel was returned.";
}

export async function POST(request: Request) {
  try {
    const { target } = (await request.json()) as { target?: Target };
    if (target !== "gemini" && target !== "youtube" && target !== "github") {
      return fail('target must be "gemini", "youtube" or "github".', 400);
    }
    return ok({ target, healthy: true, detail: await probe(target) });
  } catch (error) {
    // A failed probe is information, not a server fault: report it as a
    // successful check with an unhealthy result so the UI can show the reason.
    return ok({ healthy: false, detail: messageOf(error) });
  }
}
```

- [ ] **Step 3: Verify by hand**

Run: `npm run dev`, then in a second terminal:

```bash
curl -s localhost:3000/api/settings | head -c 400
curl -s -X POST localhost:3000/api/settings \
  -H 'content-type: application/json' \
  -d '{"updates":{"scripts_per_day":"6"}}'
curl -s localhost:3000/api/settings | grep -o '"key":"scripts_per_day","[^}]*'
curl -s -X POST localhost:3000/api/settings \
  -H 'content-type: application/json' -d '{"updates":{"bogus":"x"}}'
```

Expected: the catalogue lists on GET; the save reports `{"saved":1}`; the re-read shows `"value":"6"`; the bogus key returns a 400 naming the unknown setting.

- [ ] **Step 4: Confirm no secret leaks**

```bash
curl -s -X POST localhost:3000/api/settings \
  -H 'content-type: application/json' \
  -d '{"updates":{"gemini_api_key":"AIzaSyLeakCanary"}}'
curl -s localhost:3000/api/settings | grep -c 'AIzaSyLeakCanary'
```

Expected: the final command prints `0`.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/settings
git commit -m "Serve and save settings without ever returning a secret"
```

---

### Task 8: YouTube OAuth in the browser

**Files:**
- Create: `src/app/api/youtube/connect/route.ts`
- Create: `src/app/api/youtube/callback/route.ts`
- Modify: `src/lib/youtube/oauth.ts:15`
- Delete: `scripts/get-youtube-token.ts`
- Modify: `package.json` (drop the `auth:youtube` script)

**Interfaces:**
- Consumes: `config.ts`, `store.ts`.
- Produces:
  - `YOUTUBE_SCOPES: string[]` exported from `oauth.ts`
  - `GET /api/youtube/connect` → 302 to Google
  - `GET /api/youtube/callback?code=…` → 302 to `/settings?youtube=connected`

- [ ] **Step 1: Widen the scopes**

In `src/lib/youtube/oauth.ts`, replace line 14-15:

```ts
/**
 * Upload is what publishes; the two readonly scopes are what make the
 * Performance page possible. Widening this list invalidates any existing
 * refresh token, so reconnecting once is required after this change.
 */
export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
  "https://www.googleapis.com/auth/youtube.readonly",
];

/** @deprecated Use YOUTUBE_SCOPES. Kept so existing imports keep compiling. */
export const YOUTUBE_SCOPE = YOUTUBE_SCOPES.join(" ");
```

- [ ] **Step 2: Write the connect route**

Create `src/app/api/youtube/connect/route.ts`:

```ts
import { fail, messageOf } from "@/lib/api";
import { loadConfig } from "@/lib/settings/config";
import { YOUTUBE_SCOPES } from "@/lib/youtube/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirectUri(request: Request, siteUrl: string): string {
  const base = siteUrl || new URL(request.url).origin;
  return `${base.replace(/\/+$/, "")}/api/youtube/callback`;
}

/**
 * Replaces the old `npm run auth:youtube` terminal dance, which could not be
 * run from a phone. `prompt=consent` is required: without it Google reissues
 * an access token and withholds the refresh token on a repeat authorisation.
 */
export async function GET(request: Request) {
  try {
    const cfg = await loadConfig();
    if (!cfg.youtubeClientId || !cfg.youtubeClientSecret) {
      return fail("Save the YouTube client ID and secret in Settings first.", 400);
    }

    const params = new URLSearchParams({
      client_id: cfg.youtubeClientId,
      redirect_uri: redirectUri(request, cfg.siteUrl),
      response_type: "code",
      scope: YOUTUBE_SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
    });

    return Response.redirect(
      `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
      302,
    );
  } catch (error) {
    return fail(messageOf(error), 500);
  }
}
```

- [ ] **Step 3: Write the callback route**

Create `src/app/api/youtube/callback/route.ts`:

```ts
import { messageOf } from "@/lib/api";
import { loadConfig } from "@/lib/settings/config";
import { writeSettings } from "@/lib/settings/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function back(request: Request, siteUrl: string, query: string): Response {
  const base = (siteUrl || new URL(request.url).origin).replace(/\/+$/, "");
  return Response.redirect(`${base}/settings?${query}`, 302);
}

export async function GET(request: Request) {
  const cfg = await loadConfig();
  const url = new URL(request.url);

  const denied = url.searchParams.get("error");
  if (denied) {
    return back(request, cfg.siteUrl, `youtube=error&detail=${encodeURIComponent(denied)}`);
  }

  const code = url.searchParams.get("code");
  if (!code) return back(request, cfg.siteUrl, "youtube=error&detail=no_code");

  try {
    const base = (cfg.siteUrl || url.origin).replace(/\/+$/, "");
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: cfg.youtubeClientId,
        client_secret: cfg.youtubeClientSecret,
        redirect_uri: `${base}/api/youtube/callback`,
        grant_type: "authorization_code",
      }),
    });

    const body = (await response.json()) as {
      refresh_token?: string;
      error_description?: string;
    };

    if (!response.ok) {
      throw new Error(body.error_description ?? `Token exchange failed (${response.status}).`);
    }
    if (!body.refresh_token) {
      // Almost always a repeat authorisation without prompt=consent.
      throw new Error("Google returned no refresh token. Remove the app's access and retry.");
    }

    await writeSettings({ youtube_refresh_token: body.refresh_token });
    return back(request, cfg.siteUrl, "youtube=connected");
  } catch (error) {
    return back(
      request,
      cfg.siteUrl,
      `youtube=error&detail=${encodeURIComponent(messageOf(error))}`,
    );
  }
}
```

- [ ] **Step 4: Remove the superseded CLI script**

```bash
git rm scripts/get-youtube-token.ts
```

In `package.json`, delete the `"auth:youtube"` line.

- [ ] **Step 5: Verify nothing still references it**

Run:

```bash
grep -rn "get-youtube-token\|auth:youtube\|YOUTUBE_SCOPE\b" src scripts .github README.md 2>/dev/null
npm run typecheck
npm test
npm run build
```

Expected: the grep returns only `YOUTUBE_SCOPE` uses that still compile via the deprecated alias; typecheck, tests and build all pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Connect YouTube from the browser instead of the terminal"
```

---

### Task 9: App shell and bottom navigation

**Files:**
- Create: `src/components/BottomNav.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: nothing.
- Produces: `<BottomNav />`, rendered once in the root layout; `--nav-height` CSS variable reserved as page padding.

- [ ] **Step 1: Write the navigation component**

Create `src/components/BottomNav.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Four destinations, fixed to the bottom because that is where a thumb rests.
 * Targets are 48px minimum and the bar sits above the iOS home indicator via
 * env(safe-area-inset-bottom).
 */
const TABS = [
  { href: "/", label: "Review", icon: "♡" },
  { href: "/queue", label: "Queue", icon: "≡" },
  { href: "/performance", label: "Stats", icon: "▲" },
  { href: "/settings", label: "Settings", icon: "⚙" },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="bottom-nav" aria-label="Main">
      {TABS.map((tab) => {
        const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`bottom-nav__tab${active ? " is-active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <span aria-hidden="true" className="bottom-nav__icon">
              {tab.icon}
            </span>
            <span className="bottom-nav__label">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: Add the styles**

Append to `src/app/globals.css`:

```css
:root {
  --nav-height: 60px;
}

/* Every page reserves room so the bar never covers the last row. */
.app-shell {
  padding-bottom: calc(var(--nav-height) + env(safe-area-inset-bottom, 0px) + 16px);
}

.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 50;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  height: calc(var(--nav-height) + env(safe-area-inset-bottom, 0px));
  padding-bottom: env(safe-area-inset-bottom, 0px);
  background: var(--surface, #ffffff);
  border-top: 1px solid var(--border, rgba(0, 0, 0, 0.1));
}

.bottom-nav__tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-height: 48px;
  text-decoration: none;
  color: var(--text-muted, #6b7280);
  font-size: 11px;
  font-weight: 600;
  -webkit-tap-highlight-color: transparent;
}

.bottom-nav__tab.is-active {
  color: var(--accent, #b45309);
}

.bottom-nav__icon {
  font-size: 19px;
  line-height: 1;
}
```

- [ ] **Step 3: Mount it in the layout**

In `src/app/layout.tsx`, import `BottomNav` and render it as the last child inside `<body>`, after `{children}`.

- [ ] **Step 4: Verify on a phone viewport**

Run `npm run dev`, open `http://localhost:3000/dashboard` with devtools set to iPhone SE (375×667).
Expected: four tabs pinned to the bottom, none overlapping content, the active tab tinted.

- [ ] **Step 5: Commit**

```bash
git add src/components/BottomNav.tsx src/app/layout.tsx src/app/globals.css
git commit -m "Add the four-tab bottom navigation shell"
```

---

### Task 10: Settings page

**Files:**
- Create: `src/app/settings/page.tsx`
- Create: `src/components/SettingsClient.tsx`

**Interfaces:**
- Consumes: `GET/POST /api/settings`, `POST /api/settings/test`, `GET /api/youtube/connect`.
- Produces: the `/settings` route.

- [ ] **Step 1: Write the server page**

Create `src/app/settings/page.tsx`:

```tsx
import { SettingsClient } from "@/components/SettingsClient";
import { maskedSettings } from "@/lib/settings/store";
import type { MaskedSetting } from "@/lib/settings/store";

export const dynamic = "force-dynamic";

/**
 * Server-rendered so the form arrives filled in — on a phone connection a
 * spinner on the settings screen is the difference between "saved" and
 * "gave up".
 */
export default async function SettingsPage() {
  let settings: MaskedSetting[] = [];
  let error: string | null = null;

  try {
    settings = await maskedSettings();
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  }

  return (
    <div className="app-shell">
      <SettingsClient initialSettings={settings} loadError={error} />
    </div>
  );
}
```

- [ ] **Step 2: Write the client component**

Create `src/components/SettingsClient.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import type { MaskedSetting } from "@/lib/settings/store";

const GROUPS = [
  { id: "connections", title: "Connections", blurb: "Keys and the YouTube account." },
  { id: "publishing", title: "Publishing", blurb: "When videos go out, and how many." },
  { id: "writing", title: "Writing", blurb: "Length, voice and how many scripts a day." },
  { id: "advanced", title: "Advanced", blurb: "Rarely needs changing." },
] as const;

type Probe = { healthy: boolean; detail: string } | null;

function setAgo(updatedAt: string | null): string {
  if (!updatedAt) return "set";
  const days = Math.floor((Date.now() - new Date(updatedAt).getTime()) / 86_400_000);
  if (days <= 0) return "set today";
  if (days === 1) return "set yesterday";
  return `set ${days} days ago`;
}

export function SettingsClient({
  initialSettings,
  loadError,
}: {
  initialSettings: MaskedSetting[];
  loadError: string | null;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [probes, setProbes] = useState<Record<string, Probe>>({});

  const dirty = Object.keys(edits).length > 0;
  const byGroup = useMemo(
    () => GROUPS.map((g) => ({ ...g, items: settings.filter((s) => s.group === g.id) })),
    [settings],
  );

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ updates: edits }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error ?? "Save failed.");

      const refreshed = await fetch("/api/settings", { cache: "no-store" });
      const next = await refreshed.json();
      if (next.ok) setSettings(next.data.settings);

      setEdits({});
      setStatus("Saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  async function test(target: "gemini" | "youtube" | "github") {
    setProbes((p) => ({ ...p, [target]: null }));
    const response = await fetch("/api/settings/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ target }),
    });
    const body = await response.json();
    setProbes((p) => ({
      ...p,
      [target]: { healthy: Boolean(body.data?.healthy), detail: body.data?.detail ?? "No detail." },
    }));
  }

  if (loadError) {
    return (
      <div className="card p-6">
        <h1 className="text-lg font-extrabold">Settings unavailable</h1>
        <pre className="mt-3 text-xs whitespace-pre-wrap">{loadError}</pre>
        <p className="mt-3 text-sm">
          Check that <code>supabase/migrations/001_settings_and_scheduling.sql</code> has been run.
        </p>
      </div>
    );
  }

  return (
    <div className="pt-6">
      <h1 className="text-xl font-extrabold">Settings</h1>

      {byGroup.map((group) => (
        <section key={group.id} className="card mt-4 p-4">
          <h2 className="text-base font-bold">{group.title}</h2>
          <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
            {group.blurb}
          </p>

          {group.id === "connections" && (
            <div className="mt-3 flex flex-col gap-2">
              <a className="btn" href="/api/youtube/connect">
                Connect YouTube
              </a>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Add <code>{`${typeof window === "undefined" ? "" : window.location.origin}/api/youtube/callback`}</code>{" "}
                as an authorised redirect URI in Google Cloud Console first.
              </p>
              <div className="flex flex-wrap gap-2">
                {(["gemini", "youtube", "github"] as const).map((target) => (
                  <button key={target} type="button" className="btn" onClick={() => test(target)}>
                    Test {target}
                  </button>
                ))}
              </div>
              {Object.entries(probes).map(([target, probe]) =>
                probe ? (
                  <p
                    key={target}
                    className="text-xs"
                    style={{ color: probe.healthy ? "var(--ok, #15803d)" : "var(--danger)" }}
                  >
                    {target}: {probe.detail}
                  </p>
                ) : null,
              )}
            </div>
          )}

          <div className="mt-3 flex flex-col gap-3">
            {group.items.map((item) => {
              const edited = edits[item.key];
              const value = edited ?? (item.secret ? "" : (item.value ?? ""));

              return (
                <label key={item.key} className="flex flex-col gap-1">
                  <span className="text-sm font-semibold">
                    {item.label}
                    {item.secret && item.isSet && (
                      <span className="ml-2 text-xs font-normal" style={{ color: "var(--ok, #15803d)" }}>
                        •••• {setAgo(item.updatedAt)}
                      </span>
                    )}
                  </span>

                  {item.kind === "boolean" ? (
                    <select
                      className="input"
                      value={value || "true"}
                      onChange={(e) => setEdits({ ...edits, [item.key]: e.target.value })}
                    >
                      <option value="true">On</option>
                      <option value="false">Off</option>
                    </select>
                  ) : item.kind === "select" ? (
                    <select
                      className="input"
                      value={value}
                      onChange={(e) => setEdits({ ...edits, [item.key]: e.target.value })}
                    >
                      {(item.options ?? []).map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="input"
                      type={item.secret ? "password" : item.kind === "number" ? "number" : "text"}
                      inputMode={item.kind === "number" ? "decimal" : undefined}
                      min={item.min}
                      max={item.max}
                      step="any"
                      value={value}
                      placeholder={item.secret && item.isSet ? "•••••••• (leave blank to keep)" : ""}
                      autoComplete="off"
                      onChange={(e) => setEdits({ ...edits, [item.key]: e.target.value })}
                    />
                  )}

                  {item.help && (
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {item.help}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </section>
      ))}

      <div className="sticky bottom-20 mt-4 flex items-center gap-3">
        <button type="button" className="btn" disabled={!dirty || saving} onClick={save}>
          {saving ? "Saving…" : dirty ? `Save ${Object.keys(edits).length} change(s)` : "Saved"}
        </button>
        {status && <span className="text-sm">{status}</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add the input and button styles**

Append to `src/app/globals.css` if `.input` and `.btn` are not already defined there:

```css
.input {
  width: 100%;
  min-height: 44px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--border, rgba(0, 0, 0, 0.15));
  background: var(--surface, #fff);
  font-size: 16px; /* 16px stops iOS Safari zooming the page on focus */
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 0 16px;
  border-radius: 10px;
  border: 1px solid var(--border, rgba(0, 0, 0, 0.15));
  background: var(--surface, #fff);
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
  text-decoration: none;
  color: inherit;
}

.btn:disabled {
  opacity: 0.5;
  cursor: default;
}
```

- [ ] **Step 4: Verify end to end**

Run `npm run dev` and open `/settings` at a 375px viewport.

Check each of these:
1. All four groups render, every field visible without horizontal scrolling.
2. Type a value into "Scripts generated per day", press Save, reload — it persists.
3. Paste a real Gemini key, Save, reload — the field is empty and shows `•••• set today`.
4. Press "Test gemini" — a green line reports how many models are visible.
5. `curl -s localhost:3000/api/settings | grep -c '<the key you pasted>'` prints `0`.

- [ ] **Step 5: Full verification**

```bash
npm test
npm run typecheck
npm run build
```

Expected: all three pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/settings src/components/SettingsClient.tsx src/app/globals.css
git commit -m "Add the Settings page"
```

---

### Task 11: Shrink .env and document the two-value setup

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `src/lib/env.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: an `.env.example` containing two required values.

- [ ] **Step 1: Rewrite `.env.example`**

```bash
# ============================================================================
#  Only two values belong here. Everything else is pasted into Settings in the
#  app, stored encrypted in the database, and editable from a phone.
# ============================================================================

# Supabase — the one thing a database cannot store about itself.
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# ---------------------------------------------------------------------------
#  Optional overrides. Leave both unset unless you need them.
# ---------------------------------------------------------------------------

# Settings are encrypted with a key derived from SUPABASE_SERVICE_ROLE_KEY.
# Set this ONLY if you rotate that key and need the old secrets to keep
# decrypting; set it to the previous service-role key.
# SETTINGS_MASTER_KEY=

# Turns the password gate in middleware.ts back on. Unset means no login.
# DASHBOARD_PASSWORD=
```

- [ ] **Step 2: Trim `src/lib/env.ts`**

Keep `required`, `optional`, `env.supabaseUrl`, `env.supabaseAnonKey`, `env.supabaseServiceKey`, and `features.passwordGate`. Delete the rest of `env` and `config`, and delete `features.githubRenderer` and `features.youtube` — Plan 2 replaces their call sites with `loadConfig()`. Add at the top:

```ts
/**
 * Bootstrap configuration only.
 *
 * Everything else moved to the database: see src/lib/settings/config.ts. Only
 * values needed to *reach* the database, or read by edge middleware which
 * cannot decrypt, are allowed to stay here.
 */
```

> If deleting those breaks imports, leave the deletions to Plan 2 Task 1 and commit only the header comment plus `.env.example`. Do not leave the tree failing `npm run typecheck`.

- [ ] **Step 3: Update the README setup section**

Replace the environment-variable list with:

1. Copy `.env.example` to `.env.local`, fill in the two Supabase values.
2. Run `supabase/schema.sql`, then `supabase/migrations/001_settings_and_scheduling.sql`.
3. Run `npm run seed:topics`.
4. Run `npm run dev`, open `/settings`, paste the Gemini key and the YouTube client ID/secret.
5. In Google Cloud Console add `<your site>/api/youtube/callback` as an authorised redirect URI.
6. Press **Connect YouTube**.

- [ ] **Step 4: Verify**

```bash
npm test
npm run typecheck
npm run build
grep -c "=" .env.example
```

Expected: tests, typecheck and build pass.

- [ ] **Step 5: Commit**

```bash
git add .env.example README.md src/lib/env.ts
git commit -m "Reduce .env to the two Supabase bootstrap values"
```

---

## Self-review notes

**Spec coverage.** §4.1 `app_settings` → Task 4. §4.4 columns → Task 4. §5 catalogue → Task 3. §5.1 loader → Task 6. §6.4 Settings page → Task 10. §8 OAuth → Task 8. §10 write-only secrets → Tasks 5, 7, 10.

**Deferred to Plan 2** (scheduler, swipe deck, queue, generation changes): §3 tick and `pg_cron`, §4.2/§4.3 stats tables, §6.1–§6.3 pages, §7 beat sheet and duration gate, §9 analytics, §11 Vedic hymns. `system_lock` ships early in Task 4 so there is one migration to run rather than three.

**Known consequence.** Task 8 widens the OAuth scopes, which invalidates any existing `YOUTUBE_REFRESH_TOKEN`. Reconnecting once is required and the README says so.
