import { describe, expect, it } from "vitest";

import { pcmDurationSeconds, pcmRateFromMimeType, wrapPcmAsWav } from "@/lib/tts/wav";

/** One second of silence at 24 kHz, 16-bit mono: 24000 samples of two bytes. */
const oneSecond = Buffer.alloc(24_000 * 2);

describe("pcmRateFromMimeType", () => {
  it("reads the rate Gemini reports", () => {
    expect(pcmRateFromMimeType("audio/L16;codec=pcm;rate=24000")).toBe(24_000);
    expect(pcmRateFromMimeType("audio/L16; codec=pcm; rate=16000")).toBe(16_000);
  });

  it("falls back to 24 kHz when the rate is missing or unparseable", () => {
    expect(pcmRateFromMimeType("audio/L16;codec=pcm")).toBe(24_000);
    expect(pcmRateFromMimeType(undefined)).toBe(24_000);
    expect(pcmRateFromMimeType("audio/L16;rate=abc")).toBe(24_000);
  });
});

describe("wrapPcmAsWav", () => {
  const wav = wrapPcmAsWav(oneSecond, 24_000);

  it("prefixes exactly 44 bytes and keeps the samples intact", () => {
    expect(wav.length).toBe(oneSecond.length + 44);
    expect(wav.subarray(44).equals(oneSecond)).toBe(true);
  });

  it("writes a RIFF/WAVE header ffmpeg will accept", () => {
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.toString("ascii", 8, 12)).toBe("WAVE");
    expect(wav.toString("ascii", 12, 16)).toBe("fmt ");
    expect(wav.toString("ascii", 36, 40)).toBe("data");

    expect(wav.readUInt32LE(4)).toBe(36 + oneSecond.length); // RIFF chunk size
    expect(wav.readUInt32LE(16)).toBe(16); // PCM fmt chunk size
    expect(wav.readUInt16LE(20)).toBe(1); // format 1 = uncompressed PCM
    expect(wav.readUInt16LE(22)).toBe(1); // mono
    expect(wav.readUInt32LE(24)).toBe(24_000); // sample rate
    expect(wav.readUInt32LE(28)).toBe(48_000); // byte rate = rate * blockAlign
    expect(wav.readUInt16LE(32)).toBe(2); // block align
    expect(wav.readUInt16LE(34)).toBe(16); // bits per sample
    expect(wav.readUInt32LE(40)).toBe(oneSecond.length); // data size
  });
});

describe("pcmDurationSeconds", () => {
  it("is exact arithmetic, not a bitrate estimate", () => {
    expect(pcmDurationSeconds(oneSecond.length, 24_000)).toBe(1);
    expect(pcmDurationSeconds(24_000 * 2 * 60, 24_000)).toBe(60);
  });

  it("measures the samples only, ignoring any header already present", () => {
    const wav = wrapPcmAsWav(oneSecond, 24_000);
    expect(pcmDurationSeconds(wav.length - 44, 24_000)).toBe(1);
  });

  it("handles a rate other than the default", () => {
    expect(pcmDurationSeconds(16_000 * 2 * 3, 16_000)).toBe(3);
  });
});
