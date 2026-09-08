/**
 * PCM to WAV, because Gemini speaks in raw samples and nothing downstream does.
 *
 * Gemini's TTS models return uncompressed 16-bit little-endian PCM with the
 * sample rate declared in the mime type, not in the bytes. Every consumer we
 * have — Supabase storage, the browser preview, FFmpeg on the runner — wants a
 * container. Transcoding to MP3 is not an option: synthesis runs on Vercel,
 * where there is no FFmpeg, so the only encoder available is one we would have
 * to ship ourselves.
 *
 * A 44-byte RIFF header costs nothing and solves it. The file is larger than an
 * MP3, on a bucket holding one narration per video, and in exchange the
 * duration stops being an estimate: uncompressed audio has an exact length,
 * where the Edge path has to infer one from a constant bitrate.
 */

const DEFAULT_RATE = 24_000;
const BITS_PER_SAMPLE = 16;
const CHANNELS = 1;
const HEADER_BYTES = 44;

/**
 * Pull the sample rate out of a mime type such as
 * `audio/L16;codec=pcm;rate=24000`.
 *
 * Anything unparseable falls back to 24 kHz rather than throwing. A wrong rate
 * makes the narration sound slow or fast, which is obvious in the preview; a
 * throw here would lose a generation that had already been paid for.
 */
export function pcmRateFromMimeType(mimeType: string | undefined): number {
  const match = /rate=(\d+)/.exec(mimeType ?? "");
  if (!match) return DEFAULT_RATE;
  const rate = Number(match[1]);
  return Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_RATE;
}

/** Seconds of audio in `byteLength` bytes of raw samples. Exact, not estimated. */
export function pcmDurationSeconds(byteLength: number, rate: number = DEFAULT_RATE): number {
  return byteLength / (rate * CHANNELS * (BITS_PER_SAMPLE / 8));
}

/** Raw PCM samples wrapped in the smallest header FFmpeg will accept. */
export function wrapPcmAsWav(pcm: Buffer, rate: number = DEFAULT_RATE): Buffer {
  const blockAlign = CHANNELS * (BITS_PER_SAMPLE / 8);
  const header = Buffer.alloc(HEADER_BYTES);

  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8, "ascii");

  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16); // PCM fmt chunks are 16 bytes
  header.writeUInt16LE(1, 20); // 1 = uncompressed
  header.writeUInt16LE(CHANNELS, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * blockAlign, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(BITS_PER_SAMPLE, 34);

  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}
