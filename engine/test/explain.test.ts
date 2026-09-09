import { describe, expect, it } from 'vitest';
import { loadKnowledge } from '../src/knowledge/load.js';
import { decide } from '../src/engine/index.js';
import { explain, render } from '../src/explain/template.js';
import { checkFaithfulness } from '../src/explain/faithfulness.js';
import { explainWithModel } from '../src/explain/llm.js';
import type { Garment, Situation } from '../src/types/garment.js';

const kb = loadKnowledge();

const garment: Garment = {
  fibres: [{ fibre: 'merino', pct: 100 }],
  construction: 'knit',
  category: 'knitwear',
};
const situation: Situation = { wears_since_wash: 3, next_to_skin: false, soil: ['none'] };
const decision = decide(kb, garment, situation);

describe('the deterministic explainer', () => {
  it('ties every claim to a rule that actually fired', () => {
    const e = explain(kb, decision);
    const fired = new Set(decision.reasoning.map((h) => h.rule_id));
    for (const claim of e.claims) {
      expect(fired.has(claim.rule_id) || claim.rule_id === 'engine.escalation').toBe(true);
    }
  });

  it('is faithful by construction', () => {
    expect(checkFaithfulness(kb, decision, explain(kb, decision).prose)).toEqual([]);
  });

  it('carries the disclaimer', () => {
    expect(render(kb, decision)).toContain('Advisory only');
  });
});

describe('the faithfulness check', () => {
  it('catches an action the decision does not recommend', () => {
    const v = checkFaithfulness(kb, decision, 'Air it out. Then machine wash warm to finish.');
    expect(v.some((x) => x.kind === 'unsupported_action')).toBe(true);
  });

  it('catches an invented number', () => {
    const v = checkFaithfulness(kb, decision, 'Air it out, then wash it at 47 degrees.');
    expect(v.some((x) => x.kind === 'invented_number')).toBe(true);
  });

  it('catches a health claim', () => {
    const v = checkFaithfulness(kb, decision, 'Air it out — it kills odour bacteria.');
    expect(v.some((x) => x.kind === 'banned_claim')).toBe(true);
  });

  it('catches prose that never states the recommendation', () => {
    const v = checkFaithfulness(kb, decision, 'Merino is a remarkable fibre.');
    expect(v.some((x) => x.kind === 'missing_primary')).toBe(true);
  });

  it('allows an action named inside a warning against it', () => {
    // "Don't spot clean leather with water" mentions spot_clean without
    // recommending it, and must not be reported as an unsupported claim.
    const leather = decide(
      kb,
      { fibres: [{ fibre: 'leather', pct: 100 }], construction: 'leather', category: 'outerwear' },
      { wears_since_wash: 10, next_to_skin: false, soil: ['none'] },
    );
    const prose = explain(kb, leather).prose;
    expect(prose.toLowerCase()).toContain('spot clean');
    expect(checkFaithfulness(kb, leather, prose)).toEqual([]);
  });
});

describe('the model explainer', () => {
  const ok = (text: string): typeof fetch =>
    (async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof fetch;

  const base = { apiKey: 'test-key' } as const;

  it('uses the model when the phrasing is faithful', async () => {
    const result = await explainWithModel(kb, decision, {
      ...base,
      fetchImpl: ok('Air it out. Three wears is well inside what this jumper carries.'),
    });
    expect(result.used_model).toBe(true);
    expect(result.explanation.prose).toContain('Air it out');
  });

  it('falls back to the template when the model invents a claim', async () => {
    const result = await explainWithModel(kb, decision, {
      ...base,
      fetchImpl: ok('Air it out, or machine wash warm if you prefer.'),
    });
    expect(result.used_model).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.explanation.prose).toBe(explain(kb, decision).prose);
  });

  it('falls back when the model invents a number', async () => {
    const result = await explainWithModel(kb, decision, {
      ...base,
      fetchImpl: ok('Air it out for 6 hours and it will be fine.'),
    });
    expect(result.used_model).toBe(false);
    expect(result.violations.some((v) => v.kind === 'invented_number')).toBe(true);
  });

  it('falls back on a provider error rather than failing the decision', async () => {
    // Free-tier models rate-limit upstream without warning, so this is the
    // ordinary case rather than an edge case.
    const rateLimited = (async () =>
      new Response(JSON.stringify({ error: { message: 'temporarily rate-limited upstream' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof fetch;

    const result = await explainWithModel(kb, decision, { ...base, fetchImpl: rateLimited });
    expect(result.used_model).toBe(false);
    expect(result.error).toContain('rate-limited');
    expect(result.explanation.prose).toBe(explain(kb, decision).prose);
  });

  it('falls back on a non-200 response', async () => {
    const failing = (async () => new Response('upstream is down', { status: 502 })) as unknown as typeof fetch;
    const result = await explainWithModel(kb, decision, { ...base, fetchImpl: failing });
    expect(result.used_model).toBe(false);
    expect(result.error).toContain('502');
  });

  it('falls back when the network throws', async () => {
    const throwing = (async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    const result = await explainWithModel(kb, decision, { ...base, fetchImpl: throwing });
    expect(result.used_model).toBe(false);
    expect(result.error).toContain('network down');
  });

  it('falls back when there is no API key at all', async () => {
    // The supported way to run this project is without a key. That path must
    // produce a complete decision, not an error.
    const result = await explainWithModel(kb, decision, {
      apiKey: '',
      fetchImpl: ok('should never be called'),
    });
    expect(result.used_model).toBe(false);
    expect(result.error).toContain('OPENROUTER_API_KEY');
    expect(result.explanation.prose).toBe(explain(kb, decision).prose);
  });
});
