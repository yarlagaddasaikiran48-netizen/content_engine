/**
 * Reads and writes the app_settings table.
 *
 * Two rules the rest of the app depends on:
 *  - Only `maskedSettings()` is safe to serialise over HTTP. A secret's value
 *    is replaced with null; callers learn that it is set, never what it is.
 *  - A row whose ciphertext will not decrypt is treated as unset rather than
 *    thrown, so one bad row cannot take the whole Settings page down. The
 *    operator's fix is then obvious: paste the credential again.
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

/**
 * Short enough that a settings change takes effect on the next tick, long
 * enough that a burst of requests does not hammer the table.
 */
const CACHE_MS = 60_000;

let cache: { at: number; rows: Map<string, StoredSetting> } | null = null;

export function invalidateSettingsCache(): void {
  cache = null;
}

function encryptionKey(): Buffer {
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return deriveSettingsKey(service, process.env.SETTINGS_MASTER_KEY);
}

export async function readRawSettings(): Promise<Map<string, StoredSetting>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.rows;

  const { data, error } = await supabaseAdmin()
    .from("app_settings")
    .select("key, value_enc, is_secret, updated_at");

  if (error) throw new Error(`Could not read app_settings: ${error.message}`);

  const key = encryptionKey();
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
        value = decryptSetting(value, key);
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
  const key = encryptionKey();
  const now = new Date().toISOString();

  const payload = Object.entries(updates).map(([k, raw]) => {
    const def = settingDef(k); // throws on an unknown key, before anything is written
    const trimmed = raw.trim();
    if (trimmed === "") {
      return { key: k, value_enc: null, is_secret: def.secret, updated_at: now };
    }
    return {
      key: k,
      value_enc: def.secret ? encryptSetting(trimmed, key) : trimmed,
      is_secret: def.secret,
      updated_at: now,
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
