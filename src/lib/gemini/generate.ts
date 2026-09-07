/**
 * The brain: Gemini 2.5 Flash, constrained to structured JSON.
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

import { config, env } from "@/lib/env";
import { buildPrompt, SYSTEM_INSTRUCTION, type PromptInput } from "@/lib/gemini/prompt";
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
      description: "Exactly 5 hashtags, each a single word starting with #.",
      items: { type: Type.STRING },
      minItems: "5",
      maxItems: "5",
    },
  },
  required: ["title", "script_body", "seo_description", "hashtags"],
  propertyOrdering: ["title", "script_body", "seo_description", "hashtags"],
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

let client: GoogleGenAI | null = null;

function ai(): GoogleGenAI {
  if (!client) client = new GoogleGenAI({ apiKey: env.geminiApiKey });
  return client;
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
export async function generateScript(input: PromptInput): Promise<GeneratedScript> {
  const prompt = buildPrompt(input);
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await ai().models.generateContent({
        model: config.geminiModel,
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
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

      return parsed;
    } catch (error) {
      lastError = error;

      const message = error instanceof Error ? error.message : String(error);
      const transient =
        message.includes("429") ||
        message.includes("RESOURCE_EXHAUSTED") ||
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
