import type { KnowledgeBase } from '../knowledge/load.js';
import type { CareDecision } from '../types/decision.js';
import { explain, type Explanation } from './template.js';
import { checkFaithfulness, type Violation } from './faithfulness.js';
import { loadEnvOnce } from './env.js';

/**
 * The optional explainer.
 *
 * This is the ONLY place in Sprint A where a language model runs, and its job
 * is strictly to rephrase claims that already exist. It is given the claims and
 * nothing else — not the garment, not the situation, not the ladder — so it has
 * nothing to decide with even if it were inclined to.
 *
 * Its output is then checked against the rules that fired, and any unsupported
 * claim, invented number or out-of-scope assertion sends the whole thing back
 * to the deterministic renderer. It fails closed, every time — including when
 * there is no API key, which is the normal case for anyone cloning this repo.
 *
 * src/engine may not import this file, and .dependency-cruiser.cjs enforces it.
 *
 * WHY OPENROUTER: rephrasing three sentences is the cheapest possible LLM task,
 * and the free tier covers it. `openrouter/free` is an auto-router rather than
 * a specific model, which matters here — individual free models rate-limit
 * upstream without warning, and the router moves to whichever is answering.
 * The endpoint is OpenAI-compatible, so pointing KEPT_EXPLAINER_BASE_URL at
 * another provider is a config change, not a rewrite.
 */

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';

/**
 * Free models, tried in order, measured on this exact task.
 *
 * NOT `openrouter/free`. That auto-router picks a different free model per
 * call, and on three consecutive calls it returned good prose once, timed out
 * once, and once routed to a content-safety classifier that replied
 * "User Safety: safe". An ordered list of models known to be general chat
 * models is worth more than a router that might hand the job to a classifier.
 *
 * Free models rate-limit upstream without warning, which is why there is a
 * list rather than a single entry. The fallback below walks it on 429 and on
 * any empty or malformed response.
 */
const DEFAULT_MODELS = [
  'nex-agi/nex-n2.5-mini:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'google/gemma-4-31b-it:free',
] as const;

export type LlmExplainerOptions = {
  /** One model, or an ordered list to try in turn. */
  readonly model?: string | readonly string[];
  readonly baseUrl?: string;
  readonly apiKey?: string;
  readonly timeoutMs?: number;
  /** Injectable for tests. Defaults to global fetch. */
  readonly fetchImpl?: typeof fetch;
};

export type LlmExplainResult = {
  readonly explanation: Explanation;
  readonly used_model: boolean;
  readonly violations: readonly Violation[];
  readonly model?: string;
  readonly error?: string;
  /** Models tried and why each was passed over. Empty on a first-attempt win. */
  readonly attempts?: readonly { model: string; error: string }[];
};

const SYSTEM = `You rephrase garment-care reasoning that has already been decided by a rules engine.

You are given a recommended action and a list of claims. Rewrite the claims as two or three plain, calm sentences addressed to the garment's owner.

Rules, all of them absolute:
- Say the recommended action, by name, in the first sentence.
- Use only the claims given. Add no facts, no temperatures, no numbers, no timings.
- Recommend nothing other than the given action.
- Make no claims about health, hygiene, bacteria, allergens or chemical safety.
- No preamble, no sign-off, no bullet points, no markdown. Just the sentences.`;

type ChatResponse = {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string; code?: number };
};

export async function explainWithModel(
  kb: KnowledgeBase,
  decision: CareDecision,
  options: LlmExplainerOptions = {},
): Promise<LlmExplainResult> {
  const fallback = explain(kb, decision);
  const done = (over: Partial<LlmExplainResult>): LlmExplainResult => ({
    explanation: fallback,
    used_model: false,
    violations: [],
    ...over,
  });

  loadEnvOnce();
  const apiKey = options.apiKey ?? process.env['OPENROUTER_API_KEY'];
  if (!apiKey) {
    return done({ error: 'no OPENROUTER_API_KEY set — using the deterministic explainer' });
  }

  const configured = options.model ?? process.env['KEPT_EXPLAINER_MODEL'];
  const models =
    configured === undefined
      ? [...DEFAULT_MODELS]
      : Array.isArray(configured)
        ? [...configured]
        : [String(configured)];

  const baseUrl = options.baseUrl ?? process.env['KEPT_EXPLAINER_BASE_URL'] ?? DEFAULT_BASE_URL;
  const doFetch = options.fetchImpl ?? fetch;

  const prompt = [
    `Recommended action: ${kb.ladder.actions[decision.primary]?.label ?? decision.primary}`,
    '',
    'Claims:',
    ...fallback.claims.map((c) => `- ${c.text}`),
  ].join('\n');

  const attempts: { model: string; error: string }[] = [];
  /* Violations from the last model that actually produced prose. Kept so the
     caller can see WHAT was rejected, not merely that something was. */
  let lastViolations: readonly Violation[] = [];

  for (const model of models) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000);
    try {
      const response = await doFetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          // OpenRouter uses these for attribution only; both are optional.
          'HTTP-Referer': 'https://github.com/kept',
          'X-Title': 'Kept',
        },
        body: JSON.stringify({
          model,
          max_tokens: 300,
          temperature: 0.3,
          messages: [
            { role: 'system', content: SYSTEM },
            { role: 'user', content: prompt },
          ],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        attempts.push({ model, error: `${response.status}: ${(await response.text()).slice(0, 120)}` });
        continue;
      }

      const payload = (await response.json()) as ChatResponse;
      if (payload.error) {
        attempts.push({ model, error: payload.error.message ?? 'provider error' });
        continue;
      }

      const prose = (payload.choices?.[0]?.message?.content ?? '').trim();
      if (prose.length === 0) {
        attempts.push({ model, error: 'empty response' });
        continue;
      }

      const violations = checkFaithfulness(kb, decision, prose);
      if (violations.length > 0) {
        // A model that says something the rules do not support has failed at
        // the only job it has. Move on rather than showing it.
        lastViolations = violations;
        attempts.push({ model, error: violations.map((v) => v.detail).join('; ') });
        continue;
      }

      return {
        explanation: { ...fallback, prose },
        used_model: true,
        violations: [],
        model,
        ...(attempts.length > 0 ? { attempts } : {}),
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.name === 'AbortError'
            ? 'timed out'
            : error.message
          : String(error);
      attempts.push({ model, error: message });
    } finally {
      clearTimeout(timer);
    }
  }

  const last = attempts.at(-1);
  return done({
    ...(last ? { model: last.model } : {}),
    error: last?.error ?? 'no model configured',
    violations: lastViolations,
    attempts,
  });
}