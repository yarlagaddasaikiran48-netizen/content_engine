/**
 * Edge TTS — a dependency-light TypeScript client for Microsoft Edge's
 * "read aloud" neural voice service.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The canonical `edge-tts` library is Python. Vercel's Next.js runtime is
 * Node, and shipping a second Python function just to make an MP3 doubles the
 * cold starts and the deployment surface. The service itself is a plain
 * WebSocket protocol, so we speak it directly. Same endpoint, same voices,
 * same audio, no Python, still free.
 *
 * PROTOCOL (as implemented by rany2/edge-tts)
 *   1. Open  wss://speech.platform.bing.com/.../edge/v1
 *      with ?TrustedClientToken, ?Sec-MS-GEC, ?Sec-MS-GEC-Version, ?ConnectionId
 *   2. Send a `Path:speech.config` text frame declaring the output format.
 *   3. Send a `Path:ssml` text frame with the SSML payload.
 *   4. Receive binary frames: [uint16 headerLength][headers][mp3 bytes].
 *      Keep the payload of every frame whose headers contain `Path:audio`.
 *   5. A text frame containing `Path:turn.end` means the utterance is done.
 *
 * Sec-MS-GEC is a DRM token: SHA256 of (Windows file-time ticks rounded down
 * to a 5-minute boundary + the trusted client token), uppercased hex. If the
 * machine clock is off, the server answers 403 with a `Date` header — we read
 * it, correct the skew, and retry once.
 *
 * WHY `ws` AND NOT NODE'S BUILT-IN WebSocket
 * ------------------------------------------
 * The service only completes the handshake when the request carries the Edge
 * read-aloud extension's `Origin` header. The WHATWG WebSocket API in Node
 * offers no way to set request headers, so the built-in global fails with a
 * bare 1006 close. Verified against the live endpoint: with these headers the
 * upgrade returns HTTP 101; without the Origin it does not.
 */

import { createHash, randomUUID } from "node:crypto";
import WebSocket from "ws";

const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const BASE_URL =
  "speech.platform.bing.com/consumer/speech/synthesize/readaloud";
const WSS_URL = `wss://${BASE_URL}/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}`;
const VOICE_LIST_URL = `https://${BASE_URL}/voices/list?trustedclienttoken=${TRUSTED_CLIENT_TOKEN}`;

const CHROMIUM_FULL_VERSION = "143.0.3650.75";
const CHROMIUM_MAJOR_VERSION = CHROMIUM_FULL_VERSION.split(".")[0];
const SEC_MS_GEC_VERSION = `1-${CHROMIUM_FULL_VERSION}`;

const WIN_EPOCH = 11644473600; // seconds between 1601-01-01 and 1970-01-01
const S_TO_NS = 1e9;

/** 48 kbps constant-bitrate MP3 → duration is derivable from byte count. */
const OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";
const MP3_BITRATE_BPS = 48_000;

/** Max SSML payload per frame. The service caps frames at 64 KiB. */
const MAX_CHARS_PER_REQUEST = 1800;

const WSS_HEADERS: Record<string, string> = {
  Pragma: "no-cache",
  "Cache-Control": "no-cache",
  Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
  "Accept-Encoding": "gzip, deflate, br",
  "Accept-Language": "en-US,en;q=0.9",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) " +
    `Chrome/${CHROMIUM_MAJOR_VERSION}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR_VERSION}.0.0.0`,
};

export interface SynthesizeOptions {
  /** e.g. "en-IN-NeerjaNeural" */
  voice: string;
  /** SSML prosody rate, e.g. "-4%" */
  rate?: string;
  /** SSML prosody pitch, e.g. "+0Hz" */
  pitch?: string;
  /** SSML prosody volume, e.g. "+0%" */
  volume?: string;
  /** Per-connection timeout in ms. */
  timeoutMs?: number;
}

export interface SynthesisResult {
  audio: Buffer;
  /** Seconds, derived exactly from the CBR bitrate. */
  durationSeconds: number;
  voice: string;
  bytes: number;
}

export class EdgeTTSError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "EdgeTTSError";
  }
}

/** Clock-skew correction, learned from a 403 response's Date header. */
let clockSkewSeconds = 0;

function generateSecMsGec(): string {
  // Deliberately mirrors the reference implementation's float arithmetic so
  // the token matches what the real Edge browser would send.
  let ticks = Date.now() / 1000 + clockSkewSeconds + WIN_EPOCH;
  ticks -= ticks % 300; // round down to the nearest 5 minutes
  ticks *= S_TO_NS / 100; // seconds → 100-nanosecond intervals
  const strToHash = `${ticks.toFixed(0)}${TRUSTED_CLIENT_TOKEN}`;
  return createHash("sha256").update(strToHash, "ascii").digest("hex").toUpperCase();
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** JavaScript-style UTC date string, exactly as the Edge client sends it. */
function dateToString(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${DAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${p(d.getUTCDate())} ` +
    `${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} ` +
    `GMT+0000 (Coordinated Universal Time)`
  );
}

/**
 * The service rejects a handful of control characters (the vertical tab in
 * OCR'd text is the classic offender). Replace them with spaces.
 */
function removeIncompatibleCharacters(input: string): string {
  let out = "";
  for (const char of input) {
    const code = char.codePointAt(0)!;
    const banned =
      (code >= 0 && code <= 8) ||
      (code >= 11 && code <= 12) ||
      (code >= 14 && code <= 31);
    out += banned ? " " : char;
  }
  return out;
}

function escapeXml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildSsml(text: string, opts: Required<Omit<SynthesizeOptions, "timeoutMs">>): string {
  return (
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>` +
    `<voice name='${opts.voice}'>` +
    `<prosody pitch='${opts.pitch}' rate='${opts.rate}' volume='${opts.volume}'>` +
    escapeXml(removeIncompatibleCharacters(text)) +
    `</prosody></voice></speak>`
  );
}

/**
 * Split long text on sentence boundaries so no single frame exceeds the
 * service's payload cap. MP3 frames from the same voice/format concatenate
 * cleanly, so the parts are simply joined afterwards.
 */
function splitText(text: string, limit = MAX_CHARS_PER_REQUEST): string[] {
  const clean = text.trim();
  if (clean.length <= limit) return [clean];

  const sentences = clean.match(/[^.!?।\n]+[.!?।\n]*\s*/g) ?? [clean];
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if (current.length + sentence.length > limit && current.trim()) {
      chunks.push(current.trim());
      current = "";
    }
    // A single sentence longer than the limit gets hard-split on spaces.
    if (sentence.length > limit) {
      const words = sentence.split(/\s+/);
      for (const word of words) {
        if (current.length + word.length + 1 > limit && current.trim()) {
          chunks.push(current.trim());
          current = "";
        }
        current += `${word} `;
      }
    } else {
      current += sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function connectionId(): string {
  return randomUUID().replace(/-/g, "");
}

/** Parse an RFC 2616 date (`Date:` response header) into epoch seconds. */
function parseServerDate(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed / 1000;
}

/** One WebSocket round trip for one chunk of text. */
function synthesizeChunk(
  text: string,
  opts: Required<Omit<SynthesizeOptions, "timeoutMs">> & { timeoutMs: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const url =
      `${WSS_URL}&Sec-MS-GEC=${generateSecMsGec()}` +
      `&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}` +
      `&ConnectionId=${connectionId()}`;

    const socket = new WebSocket(url, { headers: WSS_HEADERS });
    const parts: Buffer[] = [];
    let settled = false;
    let sawAudio = false;

    const timer = setTimeout(() => {
      finish(new EdgeTTSError(`Edge TTS timed out after ${opts.timeoutMs}ms`));
    }, opts.timeoutMs);

    function finish(error?: Error, value?: Buffer) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        /* already closing */
      }
      if (error) reject(error);
      else resolve(value!);
    }

    socket.on("open", () => {
      socket.send(
        `X-Timestamp:${dateToString()}\r\n` +
          `Content-Type:application/json; charset=utf-8\r\n` +
          `Path:speech.config\r\n\r\n` +
          `{"context":{"synthesis":{"audio":{"metadataoptions":{` +
          `"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},` +
          `"outputFormat":"${OUTPUT_FORMAT}"}}}}\r\n`,
      );

      socket.send(
        `X-RequestId:${connectionId()}\r\n` +
          `Content-Type:application/ssml+xml\r\n` +
          // The trailing Z is a quirk of the real client; the service expects it.
          `X-Timestamp:${dateToString()}Z\r\n` +
          `Path:ssml\r\n\r\n` +
          buildSsml(text, opts),
      );
    });

    socket.on("message", (data: Buffer, isBinary: boolean) => {
      if (isBinary) {
        if (data.length < 2) return;
        const headerLength = data.readUInt16BE(0);
        if (data.length < headerLength + 2) return;
        const headers = data.subarray(2, headerLength + 2).toString("utf8");
        if (headers.includes("Path:audio")) {
          const payload = data.subarray(headerLength + 2);
          if (payload.length > 0) {
            parts.push(Buffer.from(payload));
            sawAudio = true;
          }
        }
        return;
      }

      const message = data.toString("utf8");
      if (message.includes("Path:turn.end")) {
        if (!sawAudio) {
          finish(
            new EdgeTTSError(
              "Edge TTS returned no audio. The text may be empty or the voice name invalid.",
            ),
          );
          return;
        }
        finish(undefined, Buffer.concat(parts));
      }
    });

    socket.on("unexpected-response", (_req, res) => {
      // 403 almost always means the Sec-MS-GEC token was computed from a
      // skewed clock. Learn the offset from the server so the retry succeeds.
      const serverSeconds = parseServerDate(res.headers.date as string | undefined);
      if (res.statusCode === 403 && serverSeconds !== null) {
        clockSkewSeconds += serverSeconds - Date.now() / 1000;
        finish(
          new EdgeTTSError(
            `Edge TTS handshake rejected (403). Clock skew corrected by ${clockSkewSeconds.toFixed(1)}s; retrying.`,
          ),
        );
        return;
      }
      finish(
        new EdgeTTSError(
          `Edge TTS handshake failed with HTTP ${res.statusCode ?? "unknown"}.`,
        ),
      );
    });

    socket.on("error", (err) => {
      finish(new EdgeTTSError(`Edge TTS socket error: ${(err as Error).message}`, err));
    });

    socket.on("close", (code) => {
      if (settled) return;
      if (parts.length > 0) {
        finish(undefined, Buffer.concat(parts));
        return;
      }
      finish(new EdgeTTSError(`Edge TTS connection closed early (code ${code}).`));
    });
  });
}

/**
 * Turn text into a single MP3 buffer.
 *
 * Retries once on a clock-skew 403, because the first failure teaches the
 * client the correct offset.
 */
export async function synthesize(
  text: string,
  options: SynthesizeOptions,
): Promise<SynthesisResult> {
  const clean = text.trim();
  if (!clean) throw new EdgeTTSError("Cannot synthesize empty text.");

  const opts = {
    voice: options.voice,
    rate: options.rate ?? "+0%",
    pitch: options.pitch ?? "+0Hz",
    volume: options.volume ?? "+0%",
    timeoutMs: options.timeoutMs ?? 30_000,
  };

  const chunks = splitText(clean);
  const buffers: Buffer[] = [];

  for (const chunk of chunks) {
    let lastError: unknown;
    let audio: Buffer | null = null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        audio = await synthesizeChunk(chunk, opts);
        break;
      } catch (error) {
        lastError = error;
      }
    }

    if (!audio) {
      throw new EdgeTTSError(
        `Edge TTS failed for a text chunk: ${(lastError as Error)?.message ?? "unknown error"}`,
        lastError,
      );
    }
    buffers.push(audio);
  }

  const audio = Buffer.concat(buffers);
  return {
    audio,
    // CBR 48 kbps → bytes * 8 / 48000 gives seconds with no decoding needed.
    durationSeconds: Number(((audio.length * 8) / MP3_BITRATE_BPS).toFixed(2)),
    voice: opts.voice,
    bytes: audio.length,
  };
}

export interface EdgeVoice {
  Name: string;
  ShortName: string;
  Gender: string;
  Locale: string;
  FriendlyName: string;
}

/** Handy for `npm run tts:test` — lists every voice the service offers. */
export async function listVoices(): Promise<EdgeVoice[]> {
  const response = await fetch(
    `${VOICE_LIST_URL}&Sec-MS-GEC=${generateSecMsGec()}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}`,
    { headers: WSS_HEADERS },
  );
  if (!response.ok) {
    throw new EdgeTTSError(`Voice list request failed: HTTP ${response.status}`);
  }
  return (await response.json()) as EdgeVoice[];
}
