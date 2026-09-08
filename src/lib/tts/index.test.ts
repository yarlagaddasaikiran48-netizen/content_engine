import { beforeEach, describe, expect, it, vi } from "vitest";

const edgeCalls: unknown[] = [];
const geminiCalls: unknown[] = [];
let geminiBehaviour: "ok" | "throw" = "ok";

vi.mock("@/lib/tts/edge-tts", () => ({
  synthesize: async (text: string, opts: unknown) => {
    edgeCalls.push({ text, opts });
    return {
      audio: Buffer.from("mp3"),
      durationSeconds: 60,
      voice: "te-IN-ShrutiNeural",
      bytes: 3,
      format: "mp3",
    };
  },
}));

vi.mock("@/lib/tts/gemini-tts", () => ({
  synthesizeWithGemini: async (text: string, opts: unknown) => {
    geminiCalls.push({ text, opts });
    if (geminiBehaviour === "throw") throw new Error("429 rate limited");
    return {
      audio: Buffer.from("wav"),
      durationSeconds: 60,
      voice: "Charon",
      bytes: 3,
      format: "wav",
    };
  },
}));

const { contentTypeFor, extensionFor, speak } = await import("@/lib/tts");

type Cfg = Parameters<typeof speak>[1];

const cfg = {
  ttsProvider: "gemini",
  geminiApiKey: "key",
  ttsVoice: "te-IN-ShrutiNeural",
  ttsGeminiVoice: "Charon",
  ttsStylePrompt: "Read slowly",
  ttsRate: "-4%",
  ttsPitch: "+0Hz",
  ttsVolume: "+0%",
} as Cfg;

beforeEach(() => {
  edgeCalls.length = 0;
  geminiCalls.length = 0;
  geminiBehaviour = "ok";
});

describe("speak", () => {
  it("uses Gemini when it is selected and configured", async () => {
    const result = await speak("మార్కండేయుడు", cfg);
    expect(result.format).toBe("wav");
    expect(geminiCalls).toHaveLength(1);
    expect(edgeCalls).toHaveLength(0);
  });

  it("uses Edge when Edge is selected, without touching Gemini", async () => {
    const result = await speak("మార్కండేయుడు", { ...cfg, ttsProvider: "edge" });
    expect(result.format).toBe("mp3");
    expect(geminiCalls).toHaveLength(0);
    expect(edgeCalls).toHaveLength(1);
  });

  it("falls back to Edge when Gemini fails, and says so in the log", async () => {
    geminiBehaviour = "throw";
    const log: string[] = [];
    const result = await speak("మార్కండేయుడు", cfg, { log });

    expect(result.format).toBe("mp3");
    expect(edgeCalls).toHaveLength(1);
    expect(log.join("\n")).toMatch(/Gemini TTS failed/);
    expect(log.join("\n")).toMatch(/429 rate limited/);
  });

  it("falls back to Edge when Gemini is selected without an API key", async () => {
    const log: string[] = [];
    const result = await speak("మార్కండేయుడు", { ...cfg, geminiApiKey: "" }, { log });

    expect(result.format).toBe("mp3");
    expect(geminiCalls).toHaveLength(0);
    expect(log.join("\n")).toMatch(/no API key/i);
  });

  it("never throws away a script because the voice failed", async () => {
    geminiBehaviour = "throw";
    await expect(speak("మార్కండేయుడు", cfg)).resolves.toBeDefined();
  });
});

describe("format helpers", () => {
  it("maps each format to its extension and content type", () => {
    expect(extensionFor({ format: "wav" })).toBe("wav");
    expect(extensionFor({ format: "mp3" })).toBe("mp3");
    expect(contentTypeFor({ format: "wav" })).toBe("audio/wav");
    expect(contentTypeFor({ format: "mp3" })).toBe("audio/mpeg");
  });
});
