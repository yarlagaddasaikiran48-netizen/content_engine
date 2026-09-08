/**
 * The brain: Gemini, constrained to structured JSON.
 *
 * Structured output means the response is schema-valid by construction, so
 * there is no brittle markdown-fence parsing. Safety settings are set to the
 * strictest useful level; the local filter in lib/safety runs afterwards
 * regardless, because provider-side filters and channel standards are not the
 * same thing.
 */

import {
  GoogleGenAI,
  HarmBlockThreshold,
  HarmCategory,
  Type,
  type GenerateContentResponse,
} from "@google/genai";

import { buildPrompt, systemInstruction, type PromptInput } from "@/lib/gemini/prompt";
import { withGeminiTarget } from "@/lib/gemini/rotate";
import type { GeminiTarget } from "@/lib/pipeline/cooldown";
import { isQuotaError } from "@/lib/pipeline/fatal";
import { normaliseTone } from "@/lib/tts/voice";
import type { GeneratedScript } from "@/lib/types";

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: {
      type: Type.STRING,
      description: "YouTube title, under 70 characters, honest and specific.",
    },
    script_body: {
      type: Type.STRING,
      description:
        "The narration spoken aloud, 62-96 words, plain text only, no stage directions.",
    },
    seo_description: {
      type: Type.STRING,
      description:
        "YouTube description: substance, then scripture reference and citation URL, then hashtags.",
    },
    hashtags: {
      type: Type.ARRAY,
      description:
        "Exactly 8 hashtags, each a single word starting with #. Two broad (#shorts, #telugu), two about the tradition or text, two about this character or episode, two about the theme.",
      items: { type: Type.STRING },
      minItems: "8",
      maxItems: "8",
    },
    deity: {
      type: Type.STRING,
      description:
        "The one god or figure this episode centres on, in English, as a bare name — 'Shiva', 'Krishna', 'Parvati', 'Narada'. Whoever the story is actually about, not whichever Purana it sits in. This chooses what is on screen.",
    },
    scene_prompt: {
      type: Type.STRING,
      description:
        "One English sentence describing the single image this episode should show, written as a prompt for a photorealistic CGI render: the figure, what they are doing at the story's turn, the setting, the light. Cinematic and reverent, never cartoon or comic styling.",
    },
    tone: {
      type: Type.STRING,
      description:
        "The register this episode is written in. 'intense' for wrath, war, a curse, death or a god's judgement; 'soft' for teaching, devotion, consolation or a quiet turn. This picks whether a man or a woman narrates it.",
      enum: ["soft", "intense"],
    },
  },
  required: ["title", "script_body", "seo_description", "hashtags", "deity", "scene_prompt", "tone"],
  propertyOrdering: [
    "title",
    "script_body",
    "seo_description",
    "hashtags",
    "deity",
    "scene_prompt",
    "tone",
  ],
};

/** Block anything the provider considers even low-probability harmful. */
const SAFETY_SETTINGS = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
  },
];

/**
 * Cached per API key. The key now comes from the database and can change
 * without a redeploy, so a client cached against the old one would keep
 * failing until the instance recycled.
 */
let client: { key: string; instance: GoogleGenAI } | null = null;

function ai(apiKey: string): GoogleGenAI {
  if (!apiKey) {
    throw new GeminiError("No Gemini API key is set. Open Settings and add it.");
  }
  if (!client || client.key !== apiKey) {
    client = { key: apiKey, instance: new GoogleGenAI({ apiKey }) };
  }
  return client.instance;
}

export class GeminiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiError";
  }
}

/** Pull the text payload out, with a clear message when the model was blocked. */
function extractText(response: GenerateContentResponse): string {
  const blockReason = response.promptFeedback?.blockReason;
  if (blockReason) {
    throw new GeminiError(
      `Gemini blocked the prompt (${blockReason}). This usually means the topic summary tripped a safety filter.`,
    );
  }

  const candidate = response.candidates?.[0];
  if (candidate?.finishReason && !["STOP", "MAX_TOKENS"].includes(candidate.finishReason)) {
    throw new GeminiError(
      `Gemini stopped early with finishReason=${candidate.finishReason}.`,
    );
  }

  const text = response.text;
  if (!text || !text.trim()) {
    throw new GeminiError("Gemini returned an empty response.");
  }
  return text;
}

/**
 * Generate one candidate script.
 *
 * Retries transient failures (429 / 5xx) with backoff. Does NOT retry
 * validation failures — that decision belongs to the pipeline, which will pick
 * a different topic instead.
 */
export async function generateScript(
  input: PromptInput,
  options: { log?: string[] } = {},
): Promise<GeneratedScript> {
  // Every model has its own daily budget, and every key its own copy of every
  // model. Only a quota refusal moves on — see lib/gemini/rotate.
  return withGeminiTarget(
    "text",
    input.cfg.geminiApiKeys,
    input.cfg.geminiModels,
    (target) => generateWithTarget(input, target),
    options,
  );
}

async function generateWithTarget(
  input: PromptInput,
  target: GeminiTarget,
): Promise<GeneratedScript> {
  const config = input.cfg;
  const prompt = buildPrompt(input);
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await ai(target.key).models.generateContent({
        model: target.model,
        contents: prompt,
        config: {
          systemInstruction: systemInstruction(config),
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
          safetySettings: SAFETY_SETTINGS,
          // High enough for genuinely different phrasing between videos,
          // low enough to keep the model obedient to the word count.
          temperature: 1.1,
          topP: 0.95,
          maxOutputTokens: 2_048,
          thinkingConfig: { thinkingBudget: config.geminiThinkingBudget },
        },
      });

      const parsed = JSON.parse(extractText(response)) as GeneratedScript;

      if (
        typeof parsed.title !== "string" ||
        typeof parsed.script_body !== "string" ||
        typeof parsed.seo_description !== "string" ||
        !Array.isArray(parsed.hashtags)
      ) {
        throw new GeminiError("Gemini response did not match the expected shape.");
      }

      // Not part of the shape check: an unrecognised register is a worse
      // narration, not a broken script, and throwing the whole thing away over
      // it would spend another topic and another request to fix a one-word
      // field. Anything unexpected reads as the gentler of the two.
      return { ...parsed, tone: normaliseTone(parsed.tone) };
    } catch (error) {
      lastError = error;

      const message = error instanceof Error ? error.message : String(error);

      // A spent quota is not a transient error, whatever its status code says.
      // Retrying it 800ms later spends one more request from the budget that
      // just ran out, and the answer cannot change until the window rolls
      // over — tens of seconds away at best. Leave immediately and let the
      // caller decide how long to stand down.
      if (isQuotaError(message)) break;

      const transient =
        message.includes("500") ||
        message.includes("503") ||
        message.includes("UNAVAILABLE") ||
        message.includes("fetch failed");

      if (!transient || attempt === 2) break;

      await new Promise((resolve) => setTimeout(resolve, 800 * 2 ** attempt));
    }
  }

  throw new GeminiError(
    `Gemini generation failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}
