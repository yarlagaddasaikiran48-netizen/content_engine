/**
 * Encryption for the settings table.
 *
 * The key is derived from the Supabase service-role key rather than being a
 * separate secret to paste, which is what keeps .env down to two values. The
 * trade-off is explicit: rotating the service key makes existing ciphertext
 * unreadable, so SETTINGS_MASTER_KEY exists as an override for that day.
 *
 * AES-256-GCM rather than CBC because it authenticates as well as encrypts: a
 * tampered row fails loudly at decryption instead of returning plausible
 * garbage that would then be sent to Google as an API key.
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
