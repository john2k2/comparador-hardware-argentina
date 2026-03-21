import { GoogleGenAI, Type } from '@google/genai';
import { withAbortTimeout } from '@/lib/async/with-abort-timeout';
import type { NormalizationMapping } from './types';
import { GEMINI_MODEL_CANDIDATES, GEMINI_BATCH_TIMEOUT_MS } from './config';
import { buildPrompt } from './prompt';
import { isModelNotAvailableError } from './utils';

const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

export async function normalizeBatchWithGemini(
  batchTitles: string[],
  queryContext?: string,
): Promise<{ model: string; mappings: NormalizationMapping[] }> {
  if (!ai) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  let lastError: unknown;

  for (const model of GEMINI_MODEL_CANDIDATES) {
    try {
      const response = await withAbortTimeout(
        (signal) => ai.models.generateContent({
          model,
          contents: buildPrompt(batchTitles, queryContext),
          config: {
            temperature: 0.1,
            responseMimeType: 'application/json',
            abortSignal: signal,
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                normalizedMap: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      originalTitle: { type: Type.STRING },
                      standardTitle: { type: Type.STRING },
                    },
                    required: ['originalTitle', 'standardTitle'],
                  },
                },
              },
              required: ['normalizedMap'],
            },
          },
        }),
        GEMINI_BATCH_TIMEOUT_MS,
        `gemini-normalizer:${model}`,
      );

      const responseText = response.text;
      if (!responseText) {
        throw new Error('Empty Gemini response body');
      }

      const parsed = JSON.parse(responseText) as { normalizedMap?: NormalizationMapping[] };
      const mappings = Array.isArray(parsed.normalizedMap) ? parsed.normalizedMap : [];

      return { model, mappings };
    } catch (error) {
      lastError = error;

      if (isModelNotAvailableError(error)) {
        console.warn(`[Gemini Normalizer] Model ${model} unavailable, trying next model.`);
        continue;
      }

      throw error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('No Gemini model candidate could normalize titles');
}
