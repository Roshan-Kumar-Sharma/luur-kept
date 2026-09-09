import type { KnowledgeBase } from '../knowledge/load.js';
import type { Garment, Situation } from '../types/garment.js';
import type { CareDecision, ImpactEstimate, RuleHit } from '../types/decision.js';
import type { CareParam, DryingAction } from '../types/ladder.js';
import { buildProfile, type GarmentProfile } from './profile.js';
import { evaluateConstraints } from './constraints.js';
import { buildNeed } from './need.js';
import { select } from './select.js';
import { gentlestDrying } from './ladder.js';

export { buildProfile } from './profile.js';
export { buildNeed } from './need.js';
export { evaluateConstraints } from './constraints.js';
export { select, foldCeiling, foldNeed, assertClampHeld } from './select.js';
export type { GarmentProfile } from './profile.js';
export type { Selection } from './select.js';

function chooseDrying(
  kb: KnowledgeBase,
  profile: GarmentProfile,
  forbiddenParams: ReadonlySet<CareParam>,
): { drying: DryingAction; notes: string[] } {
  const notes: string[] = [];
  let permitted = [...profile.permitted_drying];

  if (forbiddenParams.has('tumble_dry')) {
    permitted = permitted.filter((d) => !d.startsWith('tumble_'));
  }
  if (forbiddenParams.has('direct_sun')) {
    permitted = permitted.filter((d) => d !== 'line_dry' && d !== 'flat_dry');
    if (!permitted.includes('flat_dry_shade')) permitted.push('flat_dry_shade');
  }
  if (forbiddenParams.has('hang_wet')) {
    permitted = permitted.filter((d) => !d.startsWith('line_dry'));
  }
  if (permitted.length === 0) {
    permitted = ['air_only'];
    notes.push('No drying method survived the constraints, so the gentlest is used.');
  }
  const drying = gentlestDrying(kb.ladder, permitted) ?? 'air_only';
  return { drying, notes };
}

function estimateImpact(
  kb: KnowledgeBase,
  profile: GarmentProfile,
  primaryIsWet: boolean,
  primaryHeat: string,
  wearsRemaining: number | null,
): ImpactEstimate {
  const energy_note = primaryIsWet
    ? primaryHeat === 'high'
      ? 'A warm machine cycle. Heating the water is most of the energy a wash uses, and heat also increases how much fibre the garment sheds.'
      : 'A cold cycle. Most of a wash cycle&apos;s energy goes on heating water, so a cold one uses substantially less and sheds less fibre.'
    : 'No machine cycle, so no wash-related energy or water use, and no fibre released to the drain.';

  const estimate: ImpactEstimate = {
    relative_shedding: profile.shed_class,
    energy_note: energy_note.replace('&apos;', "'"),
    method:
      'Relative, not absolute, and it applies only if the garment is washed. Fibre class ' +
      'from the matrix, weighted by composition, then shifted by construction and finish ' +
      'per the published shedding research cited on each rule. It ranks garments against ' +
      'each other rather than measuring any of them. Note that this counts fibre released, ' +
      'not microplastic released — cotton and wool shed heavily too, and those fibres are ' +
      'not persistent in the way synthetic ones are.',
    ...(wearsRemaining !== null && wearsRemaining > 0
      ? { wears_extended_estimate: wearsRemaining }
      : {}),
  };
  void kb;
  return estimate;
}

function computeConfidence(
  profile: GarmentProfile,
  garment: Garment,
  situation: Situation,
  unknownCount: number,
  escalated: boolean,
): number {
  let c = 0.95; // never 1.0 — nothing in here is certain enough to claim it
  // Capped: a long list of things worth checking is not the same as a decision
  // the engine is unsure of, and letting it compound would say it was.
  c -= Math.min(0.15, 0.04 * unknownCount);
  if (escalated) c -= 0.1;
  if (!garment.colour_depth) c -= 0.03;
  if (!garment.sub_construction) c -= 0.03;
  if (!situation.activity) c -= 0.03;

  const worst = profile.fibres.reduce((acc, f) => {
    const rank = { low: 0, medium: 1, high: 2 }[f.fibre.provenance.confidence];
    return Math.min(acc, rank);
  }, 2);
  if (worst === 0) c -= 0.1;
  else if (worst === 1) c -= 0.05;

  return Math.max(0.3, Math.min(0.95, Number(c.toFixed(2))));
}

/**
 * Garment + situation → a care decision, with every rule that produced it.
 *
 * Pure. Takes the knowledge base as an argument rather than loading it, which
 * is what makes the property tests in test/invariants.test.ts possible.
 */
export function decide(kb: KnowledgeBase, garment: Garment, situation: Situation): CareDecision {
  const profile = buildProfile(kb, garment);
  const constraints = evaluateConstraints(kb, garment, situation, profile);
  const need = buildNeed(kb, garment, situation, profile);

  const hits: RuleHit[] = [...profile.hits, ...constraints.hits, ...need.hits];
  const selection = select(kb, hits, profile.professional_route);

  const { drying, notes } = chooseDrying(kb, profile, selection.forbidden_params);
  const action = kb.ladder.actions[selection.primary];
  const primaryIsWet = action?.wet_process ?? true;

  const wearsRemaining = primaryIsWet
    ? null
    : Math.max(0, Math.round(need.effective_wear_budget - situation.wears_since_wash));

  const unknowns = [
    ...profile.unknowns,
    ...need.unknowns,
    ...selection.unknowns,
    ...notes,
    ...hits.flatMap((h) => (h.effect.kind === 'unknown' ? [h.effect.note] : [])),
  ];

  return {
    primary: selection.primary,
    alternatives: selection.alternatives,
    confidence: computeConfidence(profile, garment, situation, unknowns.length, selection.escalated),
    reasoning: hits,
    never_do: constraints.never_do,
    drying,
    impact_estimate: estimateImpact(
      kb,
      profile,
      primaryIsWet,
      action?.heat ?? 'none',
      wearsRemaining,
    ),
    unknowns: [...new Set(unknowns)],
    do_first: selection.do_first,
    ceiling: selection.ceiling,
    need: selection.need,
    escalated: selection.escalated,
  };
}
