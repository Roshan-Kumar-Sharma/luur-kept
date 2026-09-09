import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { loadKnowledge } from '../src/knowledge/load.js';
import { decide, buildProfile, foldCeiling } from '../src/engine/index.js';
import { isDomestic, requireDomesticRung, topOfDomestic } from '../src/engine/ladder.js';
import { SOIL_TYPES, type Garment, type Situation } from '../src/types/garment.js';

/**
 * The claims in the README that matter are claims about ALL inputs, not about
 * the forty in the golden set. These check them over generated ones.
 *
 * `damage_avoidance_recall` is measured on the golden set; it is GUARANTEED
 * here.
 */

const kb = loadKnowledge();
const fibreIds = [...kb.fibres.keys()];
const constructionIds = Object.keys(kb.constructions.constructions);
const subConstructionIds = Object.keys(kb.constructions.sub_constructions);
const finishIds = Object.keys(kb.constructions.finishes);
const categoryIds = Object.keys(kb.categories);

const arbGarment: fc.Arbitrary<Garment> = fc
  .record({
    ids: fc.uniqueArray(fc.constantFrom(...fibreIds), { minLength: 1, maxLength: 3 }),
    split: fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 3, maxLength: 3 }),
    construction: fc.constantFrom(...constructionIds),
    sub_construction: fc.option(fc.constantFrom(...subConstructionIds), { nil: undefined }),
    category: fc.constantFrom(...categoryIds),
    finish: fc.option(fc.uniqueArray(fc.constantFrom(...finishIds), { maxLength: 2 }), {
      nil: undefined,
    }),
    colour_depth: fc.option(fc.constantFrom('white' as const, 'light' as const, 'mid' as const, 'dark' as const), {
      nil: undefined,
    }),
    structured: fc.option(fc.boolean(), { nil: undefined }),
  })
  .map(({ ids, split, ...rest }) => {
    const weights = ids.map((_, i) => split[i] ?? 1);
    const total = weights.reduce((a, b) => a + b, 0);
    const fibres = ids.map((fibre, i) => ({
      fibre,
      pct: Math.round(((weights[i] ?? 1) / total) * 100),
    }));
    return { fibres, ...rest };
  });

const arbSituation: fc.Arbitrary<Situation> = fc.record({
  wears_since_wash: fc.integer({ min: 0, max: 30 }),
  next_to_skin: fc.boolean(),
  soil: fc.uniqueArray(fc.constantFrom(...SOIL_TYPES), { minLength: 1, maxLength: 3 }),
  activity: fc.option(fc.constantFrom('sedentary' as const, 'active' as const, 'workout' as const), {
    nil: undefined,
  }),
  ambient: fc.option(fc.constantFrom('cold' as const, 'temperate' as const, 'hot_humid' as const), {
    nil: undefined,
  }),
});

describe('the care ceiling holds, for every input', () => {
  it('never recommends a domestic action above the ceiling', () => {
    fc.assert(
      fc.property(arbGarment, arbSituation, (garment, situation) => {
        const d = decide(kb, garment, situation);
        if (!isDomestic(kb.ladder, d.primary)) return; // professional is off this axis
        expect(requireDomesticRung(kb.ladder, d.primary)).toBeLessThanOrEqual(d.ceiling.rung);
      }),
      { numRuns: 3000 },
    );
  });

  it('never offers an alternative above the ceiling either', () => {
    fc.assert(
      fc.property(arbGarment, arbSituation, (garment, situation) => {
        const d = decide(kb, garment, situation);
        for (const alt of d.alternatives) {
          if (!isDomestic(kb.ladder, alt)) continue;
          expect(requireDomesticRung(kb.ladder, alt)).toBeLessThanOrEqual(d.ceiling.rung);
        }
      }),
      { numRuns: 2000 },
    );
  });

  it('never recommends something a constraint forbade', () => {
    fc.assert(
      fc.property(arbGarment, arbSituation, (garment, situation) => {
        const d = decide(kb, garment, situation);
        const forbidden = new Set(
          d.reasoning.flatMap((h) => (h.effect.kind === 'forbid' ? [h.effect.action] : [])),
        );
        expect(forbidden.has(d.primary)).toBe(false);
        for (const alt of d.alternatives) expect(forbidden.has(alt)).toBe(false);
      }),
      { numRuns: 2000 },
    );
  });

  it('never puts the ceiling above the top of the domestic segment', () => {
    const top = requireDomesticRung(kb.ladder, topOfDomestic(kb.ladder));
    fc.assert(
      fc.property(arbGarment, arbSituation, (garment, situation) => {
        const d = decide(kb, garment, situation);
        expect(d.ceiling.rung).toBeLessThanOrEqual(top);
      }),
      { numRuns: 1000 },
    );
  });
});

describe('the folds are monotone', () => {
  it('adding a fibre can only lower the ceiling, never raise it', () => {
    // This is the elastane case stated as a law: five per cent of something
    // fragile governs the whole garment.
    fc.assert(
      fc.property(
        arbGarment,
        fc.constantFrom(...fibreIds),
        (garment, extra) => {
          if (garment.fibres.some((f) => f.fibre === extra)) return;
          const before = foldCeiling(kb, buildProfile(kb, garment).hits);
          const widened: Garment = {
            ...garment,
            fibres: [...garment.fibres.map((f) => ({ ...f, pct: f.pct * 0.95 })), { fibre: extra, pct: 5 }],
          };
          const after = foldCeiling(kb, buildProfile(kb, widened).hits);
          expect(after.rung).toBeLessThanOrEqual(before.rung);
        },
      ),
      { numRuns: 2000 },
    );
  });

  it('adding a soil never makes the recommendation gentler', () => {
    fc.assert(
      fc.property(arbGarment, arbSituation, fc.constantFrom(...SOIL_TYPES), (garment, situation, extra) => {
        if (situation.soil.includes(extra)) return;
        const before = decide(kb, garment, situation);
        const after = decide(kb, garment, { ...situation, soil: [...situation.soil, extra] });
        if (!isDomestic(kb.ladder, before.primary)) return;
        if (!isDomestic(kb.ladder, after.primary)) return; // escalated, which is not gentler
        expect(requireDomesticRung(kb.ladder, after.primary)).toBeGreaterThanOrEqual(
          requireDomesticRung(kb.ladder, before.primary),
        );
      }),
      { numRuns: 3000 },
    );
  });

  it('more wears never makes the recommendation gentler', () => {
    fc.assert(
      fc.property(arbGarment, arbSituation, fc.integer({ min: 1, max: 20 }), (garment, situation, more) => {
        const before = decide(kb, garment, situation);
        const after = decide(kb, garment, {
          ...situation,
          wears_since_wash: situation.wears_since_wash + more,
        });
        if (!isDomestic(kb.ladder, before.primary) || !isDomestic(kb.ladder, after.primary)) return;
        expect(requireDomesticRung(kb.ladder, after.primary)).toBeGreaterThanOrEqual(
          requireDomesticRung(kb.ladder, before.primary),
        );
      }),
      { numRuns: 2000 },
    );
  });
});

describe('the engine is deterministic', () => {
  it('returns the same decision for the same input', () => {
    fc.assert(
      fc.property(arbGarment, arbSituation, (garment, situation) => {
        expect(decide(kb, garment, situation)).toEqual(decide(kb, garment, situation));
      }),
      { numRuns: 500 },
    );
  });
});

describe('every decision can be explained', () => {
  it('names at least one rule that produced it', () => {
    fc.assert(
      fc.property(arbGarment, arbSituation, (garment, situation) => {
        const d = decide(kb, garment, situation);
        expect(d.reasoning.length).toBeGreaterThan(0);
        for (const hit of d.reasoning) {
          expect(hit.sources.length).toBeGreaterThan(0);
          expect(hit.because.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 1000 },
    );
  });
});
