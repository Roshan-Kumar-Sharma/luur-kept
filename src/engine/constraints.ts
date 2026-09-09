import type { KnowledgeBase } from '../knowledge/load.js';
import type { ConstraintDef } from '../knowledge/schema.js';
import type { Garment, Situation } from '../types/garment.js';
import type { Constraint, RuleHit } from '../types/decision.js';
import { mkHit } from './hit.js';
import { scaleIndex } from './scales.js';
import type { GarmentProfile } from './profile.js';

/**
 * Evaluate the hard constraints in knowledge/constraints.yaml.
 *
 * Conditions inside one `when` are ANDed; lists inside a condition are ORed.
 * Deliberately the dullest possible matcher — a constraint language you have
 * to learn is a constraint language a textiles expert will not edit.
 */
function matches(
  kb: KnowledgeBase,
  def: ConstraintDef,
  garment: Garment,
  situation: Situation,
  profile: GarmentProfile,
): boolean {
  const w = def.when;

  if (w.any_fibre && !garment.fibres.some((f) => w.any_fibre?.includes(f.fibre))) return false;

  if (w.any_fibre_class) {
    const classes = new Set(profile.fibres.map((f) => f.fibre.class));
    if (!w.any_fibre_class.some((c) => classes.has(c))) return false;
  }

  if (w.any_fibre_min_pct) {
    const { fibre, pct } = w.any_fibre_min_pct;
    if (!garment.fibres.some((f) => f.fibre === fibre && f.pct >= pct)) return false;
  }

  if (w.category && !w.category.includes(garment.category)) return false;
  if (w.construction && !w.construction.includes(garment.construction)) return false;

  if (w.finish_any) {
    const finishes = garment.finish ?? [];
    if (!w.finish_any.some((f) => finishes.includes(f))) return false;
  }

  if (w.colour_depth) {
    if (!garment.colour_depth || !w.colour_depth.includes(garment.colour_depth)) return false;
  }

  if (w.soil_any && !w.soil_any.some((s) => situation.soil.includes(s))) return false;

  if (w.structured !== undefined) {
    const category = kb.categories[garment.category];
    const structured = garment.structured ?? category?.typically_structured ?? false;
    if (structured !== w.structured) return false;
  }

  if (w.wet_strength_at_most) {
    const scale = kb.blending.scales['wet_strength'];
    if (!scale) throw new Error('blending.yaml has no wet_strength scale');
    const limit = Math.max(...w.wet_strength_at_most.map((v) => scaleIndex(scale, v)));
    if (scaleIndex(scale, profile.wet_strength) > limit) return false;
  }

  return true;
}

export type ConstraintResult = {
  readonly hits: readonly RuleHit[];
  readonly never_do: readonly Constraint[];
};

export function evaluateConstraints(
  kb: KnowledgeBase,
  garment: Garment,
  situation: Situation,
  profile: GarmentProfile,
): ConstraintResult {
  const hits: RuleHit[] = [];
  const never_do: Constraint[] = [];

  for (const def of kb.constraints) {
    if (!matches(kb, def, garment, situation, profile)) continue;

    for (const effect of def.effects) {
      hits.push(
        mkHit(kb, {
          rule_id: `constraint.${def.id}`,
          layer: 'constraint',
          effect,
          because: def.because,
          sources: def.sources,
          inputs: Object.keys(def.when),
        }),
      );
    }

    never_do.push({
      rule_id: def.id,
      never_do: def.never_do,
      because: def.because,
      sources: def.sources.map((id) => {
        const s = kb.sources.get(id);
        if (!s) throw new Error(`constraint ${def.id} cites unknown source "${id}"`);
        return s;
      }),
    });
  }

  return { hits, never_do };
}
