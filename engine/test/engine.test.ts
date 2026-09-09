import { describe, expect, it } from 'vitest';
import { loadKnowledge } from '../src/knowledge/load.js';
import { decide } from '../src/engine/index.js';
import type { Garment, Situation } from '../src/types/garment.js';

const kb = loadKnowledge();
const d = (g: Garment, s: Situation) => decide(kb, g, s);

const merinoJumper: Garment = {
  fibres: [{ fibre: 'merino', pct: 100 }],
  construction: 'knit',
  category: 'knitwear',
};

describe('the demo case', () => {
  it('says air it out, not wash it', () => {
    const decision = d(merinoJumper, {
      wears_since_wash: 3,
      next_to_skin: false,
      soil: ['none'],
      activity: 'sedentary',
    });
    expect(decision.primary).toBe('air_out');
    expect(decision.ceiling.action).toBe('hand_wash_cold');
    expect(decision.reasoning.some((h) => h.rule_id === 'need.wear_budget_within')).toBe(true);
    expect(decision.impact_estimate.wears_extended_estimate).toBeGreaterThan(0);
  });

  it('names the never-do list even when it is not recommending a wash', () => {
    const decision = d(merinoJumper, { wears_since_wash: 3, next_to_skin: false, soil: ['none'] });
    const ids = decision.never_do.map((c) => c.rule_id);
    expect(ids).toContain('never_tumble_dry_protein');
    expect(ids).toContain('never_bleach_protein');
    for (const c of decision.never_do) expect(c.sources.length).toBeGreaterThan(0);
  });
});

describe('odour retention decides whether "wash less" is true', () => {
  const situation: Situation = {
    wears_since_wash: 2,
    next_to_skin: true,
    soil: ['body_odour'],
    activity: 'active',
  };

  it('refreshes wool', () => {
    const decision = d({ ...merinoJumper, category: 'tee' }, situation);
    expect(decision.primary).toBe('refresh_spray');
  });

  it('washes polyester, given the identical situation', () => {
    const decision = d(
      { fibres: [{ fibre: 'polyester', pct: 100 }], construction: 'knit', category: 'tee' },
      situation,
    );
    expect(decision.primary).toBe('machine_wash_cold');
  });
});

describe('a minor fibre still governs the whole garment', () => {
  it('lets five per cent elastane set the ceiling for a cotton tee', () => {
    const plain = d(
      { fibres: [{ fibre: 'cotton', pct: 100 }], construction: 'knit', category: 'tee' },
      { wears_since_wash: 2, next_to_skin: true, soil: ['visible_sweat'] },
    );
    const stretch = d(
      {
        fibres: [
          { fibre: 'cotton', pct: 95 },
          { fibre: 'elastane', pct: 5 },
        ],
        construction: 'knit',
        category: 'tee',
      },
      { wears_since_wash: 2, next_to_skin: true, soil: ['visible_sweat'] },
    );
    expect(plain.ceiling.action).toBe('machine_wash_warm');
    expect(stretch.ceiling.action).toBe('machine_wash_cold_delicate');
    expect(stretch.never_do.map((c) => c.rule_id)).toContain('never_hot_wash_elastane');
  });
});

describe('escalation is a separate axis, not a higher rung', () => {
  it('sends a stained leather jacket to a professional rather than washing it', () => {
    const decision = d(
      { fibres: [{ fibre: 'leather', pct: 100 }], construction: 'leather', category: 'outerwear' },
      { wears_since_wash: 12, next_to_skin: false, soil: ['stain'] },
    );
    expect(decision.primary).toBe('dry_clean');
    expect(decision.escalated).toBe(true);
    expect(decision.ceiling.action).toBe('brush'); // and dry_clean does not violate it
  });

  it('hand washes a sweaty silk blouse instead of escalating', () => {
    // The relaxed floor exists for exactly this: the garment cannot take the
    // usual treatment, but something gentler still deals with the soil.
    const decision = d(
      {
        fibres: [{ fibre: 'silk', pct: 100 }],
        construction: 'woven',
        sub_construction: 'satin',
        category: 'shirt',
      },
      { wears_since_wash: 2, next_to_skin: true, soil: ['visible_sweat'], ambient: 'hot_humid' },
    );
    expect(decision.primary).toBe('hand_wash_cold');
    expect(decision.escalated).toBe(false);
  });

  it('keeps a structured blazer out of the machine', () => {
    const decision = d(
      {
        fibres: [{ fibre: 'wool', pct: 100 }],
        construction: 'woven',
        sub_construction: 'twill',
        category: 'tailoring',
        structured: true,
      },
      { wears_since_wash: 4, next_to_skin: false, soil: ['stain'] },
    );
    expect(decision.ceiling.action).toBe('spot_clean');
    expect(decision.primary).toBe('spot_clean');
    expect(decision.never_do.map((c) => c.rule_id)).toContain('never_machine_wash_structured');
  });
});

describe('stains are treated before anything else', () => {
  it('requires spot cleaning first and forbids heat', () => {
    const decision = d(
      { fibres: [{ fibre: 'cotton', pct: 100 }], construction: 'knit', category: 'tee' },
      { wears_since_wash: 3, next_to_skin: true, soil: ['stain', 'body_odour'], activity: 'active' },
    );
    expect(decision.do_first).toContain('spot_clean');
    expect(decision.primary).not.toBe('machine_wash_warm');
    expect(decision.never_do.map((c) => c.rule_id)).toContain(
      'spot_treat_protein_stain_before_washing',
    );
  });
});

describe('drying', () => {
  it('never tumble dries wool, and dries it flat out of the sun', () => {
    const decision = d({ ...merinoJumper, colour_depth: 'dark' }, {
      wears_since_wash: 12,
      next_to_skin: true,
      soil: ['body_odour'],
    });
    expect(decision.drying).toBe('flat_dry_shade');
  });
});

describe('unknown inputs', () => {
  it('rejects a fibre it does not know, rather than guessing', () => {
    expect(() =>
      d({ fibres: [{ fibre: 'hemp', pct: 100 }], construction: 'woven', category: 'shirt' }, {
        wears_since_wash: 1,
        next_to_skin: true,
        soil: ['none'],
      }),
    ).toThrow(/unknown fibre "hemp"/);
  });

  it('says so when the composition does not add up', () => {
    const decision = d(
      {
        fibres: [
          { fibre: 'cotton', pct: 60 },
          { fibre: 'polyester', pct: 20 },
        ],
        construction: 'knit',
        category: 'tee',
      },
      { wears_since_wash: 1, next_to_skin: true, soil: ['none'] },
    );
    expect(decision.unknowns.some((u) => u.includes('80%'))).toBe(true);
  });
});
