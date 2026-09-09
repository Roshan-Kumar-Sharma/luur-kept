import { describe, expect, it } from 'vitest';
import { loadKnowledge } from '../src/knowledge/load.js';
import { lintKnowledge, provenanceReport } from '../src/knowledge/lint.js';
import { CARE_ACTIONS } from '../src/types/ladder.js';

const kb = loadKnowledge();

describe('the knowledge base', () => {
  it('loads and lints clean', () => {
    const errors = lintKnowledge(kb).filter((f) => f.severity === 'error');
    expect(errors, errors.map((e) => `${e.where}: ${e.message}`).join('\n')).toEqual([]);
  });

  it('has the fifteen fibres Sprint A calls for', () => {
    expect(kb.fibres.size).toBe(15);
    for (const id of [
      'cotton', 'linen', 'wool', 'merino', 'cashmere', 'silk', 'viscose', 'lyocell',
      'modal', 'polyester', 'nylon', 'acrylic', 'elastane', 'acetate', 'leather',
    ]) {
      expect(kb.fibres.has(id), `missing fibre ${id}`).toBe(true);
    }
  });

  it('cites a source for every claim', () => {
    for (const [id, fibre] of kb.fibres) {
      for (const [field, ids] of Object.entries(fibre.sources)) {
        expect(ids.length, `${id}.${field} has no source`).toBeGreaterThan(0);
        for (const sourceId of ids) expect(kb.sources.has(sourceId)).toBe(true);
      }
    }
    for (const c of kb.constraints) {
      expect(c.sources.length, `constraint ${c.id} has no source`).toBeGreaterThan(0);
    }
  });

  it('orders the ladder in YAML rather than in code', () => {
    const laddered = [
      ...kb.ladder.segments.domestic,
      ...kb.ladder.segments.professional,
    ];
    expect(new Set(laddered).size).toBe(CARE_ACTIONS.length);
  });

  it('keeps professional cleaning off the domestic segment', () => {
    // If a professional route ever became a domestic rung, the ceiling would
    // silently stop clamping the thing it exists to clamp.
    expect(kb.ladder.segments.domestic).not.toContain('dry_clean');
    expect(kb.ladder.segments.domestic).not.toContain('professional_wet_clean');
  });

  it('reports honestly on how much rests on engineer inference', () => {
    const report = provenanceReport(kb);
    expect(report.fibres_total).toBe(15);
    // Sprint A ships with none of it expert-reviewed. When that stops being
    // true this assertion should be updated, deliberately, in the same commit
    // as the review.
    expect(report.fibres_expert_reviewed).toBe(0);
    expect(report.claims_engineer_inference_only).toBeGreaterThan(0);
  });
});

describe('the odour_retention field', () => {
  it('separates wool from polyester, which is the point of it', () => {
    expect(kb.fibres.get('merino')?.properties.odour_retention).toBe('very_low');
    expect(kb.fibres.get('polyester')?.properties.odour_retention).toBe('very_high');
  });

  it('drives a different intervention for the same soil', () => {
    const byOdour = kb.soils.soils['body_odour']?.need_floor_by_odour_retention;
    expect(byOdour?.very_low).toBe('refresh_spray');
    expect(byOdour?.very_high).toBe('machine_wash_cold');
  });
});
