import Anthropic from '@anthropic-ai/sdk';
import type { KnowledgeBase } from '../knowledge/load.js';
import type { CareDecision } from '../types/decision.js';
import { explain, type Explanation } from './template.js';
import { checkFaithfulness, type Violation } from './faithfulness.js';

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
 * to the deterministic renderer. It fails closed, every time.
 *
 * src/engine may not import this file, and .dependency-cruiser.cjs enforces it.
 */

export type LlmExplainerOptions = {
  /**
   * Defaults to Claude Opus 5. Phrasing three sentences is not demanding work,
   * so `claude-haiku-4-5` is a reasonable trade if cost per decision matters
   * more than polish — but that is a decision to make deliberately.
   */
  readonly model?: string;
  readonly client?: Pick<Anthropic, 'messages'>;
};

export type LlmExplainResult = {
  readonly explanation: Explanation;
  readonly used_model: boolean;
  readonly violations: readonly Violation[];
  readonly error?: string;
};

const SYSTEM = `You rephrase garment-care reasoning that has already been decided by a rules engine.

You are given a recommended action and a list of claims. Rewrite the claims as two or three plain, calm sentences addressed to the garment's owner.

Rules, all of them absolute:
- Say the recommended action, by name, in the first sentence.
- Use only the claims given. Add no facts, no temperatures, no numbers, no timings.
- Recommend nothing other than the given action.
- Make no claims about health, hygiene, bacteria, allergens or chemical safety.
- No preamble, no sign-off, no bullet points. Just the sentences.`;

export async function explainWithModel(
  kb: KnowledgeBase,
  decision: CareDecision,
  options: LlmExplainerOptions = {},
): Promise<LlmExplainResult> {
  const fallback = explain(kb, decision);
  const model = options.model ?? 'claude-opus-5';

  const prompt = [
    `Recommended action: ${kb.ladder.actions[decision.primary]?.label ?? decision.primary}`,
    '',
    'Claims:',
    ...fallback.claims.map((c) => `- ${c.text}`),
  ].join('\n');

  try {
    const client = options.client ?? new Anthropic();
    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      system: SYSTEM,
      // Phrasing three sentences does not need deep reasoning, and low effort
      // keeps this cheap enough to run on every decision.
      output_config: { effort: 'low' },
      messages: [{ role: 'user', content: prompt }],
    });

    const prose = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();

    if (prose.length === 0) {
      return { explanation: fallback, used_model: false, violations: [], error: 'empty response' };
    }

    const violations = checkFaithfulness(kb, decision, prose);
    if (violations.length > 0) {
      return { explanation: fallback, used_model: false, violations };
    }

    return {
      explanation: { ...fallback, prose },
      used_model: true,
      violations: [],
    };
  } catch (error) {
    const message =
      error instanceof Anthropic.APIError
        ? `${error.status ?? 'API'}: ${error.message}`
        : error instanceof Error
          ? error.message
          : String(error);
    return { explanation: fallback, used_model: false, violations: [], error: message };
  }
}
