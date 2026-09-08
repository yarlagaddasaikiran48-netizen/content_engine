import { describe, expect, it } from "vitest";

import { audioFromResponse, buildSpeechRequest, GeminiTTSError } from "@/lib/tts/gemini-tts";

describe("buildSpeechRequest", () => {
  it("returns the transcript untouched when there are no director's notes", () => {
    expect(buildSpeechRequest("మార్కండేయుడు")).toBe("మార్కండేయుడు");
    expect(buildSpeechRequest("మార్కండేయుడు", "   ")).toBe("మార్కండేయుడు");
  });

  it("puts the notes above the transcript, ending in a colon", () => {
    const request = buildSpeechRequest("మార్కండేయుడు", "Read slowly, like a grandmother");
    expect(request).toBe("Read slowly, like a grandmother:\n\nమార్కండేయుడు");
  });

  it("does not double the colon when the notes already end in one", () => {
    const request = buildSpeechRequest("మార్కండేయుడు", "Read slowly:");
    expect(request).toBe("Read slowly:\n\nమార్కండేయుడు");
    expect(request).not.toContain("::");
  });
});

describe("audioFromResponse", () => {
  const pcm = Buffer.from([0, 1, 2, 3]);

  function responseWith(mimeType: string) {
    return {
      candidates: [
        { content: { parts: [{ inlineData: { data: pcm.toString("base64"), mimeType } }] } },
      ],
    };
  }

  it("decodes the inline audio and reads its rate", () => {
    const got = audioFromResponse(responseWith("audio/L16;codec=pcm;rate=24000"));
    expect(got.pcm.equals(pcm)).toBe(true);
    expect(got.rate).toBe(24_000);
  });

  it("skips leading parts that carry no audio", () => {
    const response = {
      candidates: [
        {
          content: {
            parts: [
              { text: "here you go" },
              { inlineData: { data: pcm.toString("base64"), mimeType: "audio/L16;rate=16000" } },
            ],
          },
        },
      ],
    };
    const got = audioFromResponse(response);
    expect(got.pcm.equals(pcm)).toBe(true);
    expect(got.rate).toBe(16_000);
  });

  it("throws a named error rather than returning empty audio", () => {
    expect(() => audioFromResponse({})).toThrow(GeminiTTSError);
    expect(() => audioFromResponse({ candidates: [] })).toThrow(/no audio/i);
    expect(() =>
      audioFromResponse({ candidates: [{ content: { parts: [{ text: "refused" }] } }] }),
    ).toThrow(/no audio/i);
  });
});
