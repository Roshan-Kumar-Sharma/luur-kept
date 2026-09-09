import type { KnowledgeBase } from '../knowledge/load.js';
import type { Garment, Situation } from '../types/garment.js';
import type { RuleHit } from '../types/decision.js';
import { mkHit } from './hit.js';
import type { GarmentProfile } from './profile.js';

export type NeedResult = {
  readonly hits: readonly RuleHit[];
  readonly unknowns: readonly string[];
  /** Wears this garment supports in THIS situation. Shown in the output. */
  readonly effective_wear_budget: number;
};

/**
 * The need model: is an intervention required at all, and what is the least
 * that will actually deal with what happened to the garment?
 *
 * Everything here pushes the floor UP. Nothing here can lower the ceiling, and
 * nothing here selects an action. The two folds meet in select.ts.
 */
export function buildNeed(
  kb: KnowledgeBase,
  garment: Garment,
  situation: Situation,
  profile: GarmentProfile,
): NeedResult {
  const hits: RuleHit[] = [];
  const unknowns: string[] = [];
  const mods = kb.soils.wear_budget_modifiers;
  const wornPhrase = (n: number) =>
    n === 0
      ? 'Not worn since the last wash'
      : n === 1
        ? 'Worn once since the last wash'
        : `Worn ${n} times since the last wash`;
  const odourPhrase =
    mods.odour_phrases[profile.odour_retention as keyof typeof mods.odour_phrases] ??
    `holds odour ${profile.odour_retention}`;

  /* ── soils present ──────────────────────────────────────────────────── */

  for (const soilId of situation.soil) {
    const soil = kb.soils.soils[soilId];
    if (!soil) throw new Error(`soils.yaml has no entry for "${soilId}"`);

    const unworn = situation.wears_since_wash === 0;
    let floor = soil.need_floor;
    let because = soil.rationale;

    if (unworn && soil.need_floor_when_unworn) {
      floor = soil.need_floor_when_unworn;
      because = soil.rationale_when_unworn ?? soil.rationale;
    } else if (soil.need_floor_by_odour_retention) {
      const byOdour = soil.need_floor_by_odour_retention[
        profile.odour_retention as keyof typeof soil.need_floor_by_odour_retention
      ];
      if (byOdour) {
        floor = byOdour;
        because =
          `${soil.rationale} This blend ${odourPhrase}, which is what decides ` +
          'whether that can be lifted without washing.';
      }
    }

    if (floor) {
      hits.push(
        mkHit(kb, {
          rule_id: `soil.${soilId}.need`,
          layer: 'soil',
          effect: { kind: 'need', floor },
          because,
          sources: soil.sources,
          inputs: ['soil', ...(soil.need_floor_by_odour_retention ? ['fibres'] : [])],
        }),
      );

      /* Every need floor also states the lowest thing that still deals with
         the soil. Where nothing gentler works — a stain on leather — that is
         the floor itself, so this soil cannot be relaxed by another one that
         can be. */
      hits.push(
        mkHit(kb, {
          rule_id: `soil.${soilId}.need_min`,
          layer: 'soil',
          effect: { kind: 'need_min', floor: soil.need_floor_min ?? floor },
          because: soil.rationale_min ?? because,
          sources: soil.sources,
          inputs: ['soil'],
        }),
      );
    }

    if (soil.require_first) {
      hits.push(
        mkHit(kb, {
          rule_id: `soil.${soilId}.require_first`,
          layer: 'soil',
          effect: { kind: 'require_first', action: soil.require_first },
          because: soil.rationale,
          sources: soil.sources,
          inputs: ['soil'],
        }),
      );
    }

    for (const param of soil.forbid_params ?? []) {
      hits.push(
        mkHit(kb, {
          rule_id: `soil.${soilId}.forbid.${param}`,
          layer: 'soil',
          effect: { kind: 'forbid_param', param },
          because: soil.rationale,
          sources: soil.sources,
          inputs: ['soil'],
        }),
      );
    }
  }

  /* ── wear budget ────────────────────────────────────────────────────── */

  let budget = profile.wear_budget;
  /* The category multiplier already assumes typical usage — a tee is worn
     against skin, a blazer is not — so this corrects only for the unusual case.
     Applying it unconditionally counted skin contact twice and left a cotton
     T-shirt with a budget of well under one wear. */
  const category = kb.categories[garment.category];
  if (category && situation.next_to_skin !== category.typically_next_to_skin) {
    budget *= situation.next_to_skin
      ? mods.next_to_skin.multiplier
      : 1 / mods.next_to_skin.multiplier;
  }
  if (situation.activity) budget *= mods.activity[situation.activity].multiplier;
  if (situation.ambient) budget *= mods.ambient[situation.ambient].multiplier;

  if (!situation.activity) {
    unknowns.push('What the garment was doing was not given, so an ordinary day is assumed.');
  }

  if (situation.wears_since_wash < budget) {
    hits.push(
      mkHit(kb, {
        rule_id: 'need.wear_budget_within',
        layer: 'need',
        effect: { kind: 'need', floor: 'wear_again' },
        because:
          `${wornPhrase(situation.wears_since_wash)}, against about ` +
          `${Math.max(1, Math.round(budget))} for this garment in this situation — ` +
          `it ${odourPhrase}. No wash is indicated yet. ` +
          mods.within.rationale.trim(),
        sources: mods.within.sources,
        inputs: ['wears_since_wash', 'next_to_skin', 'activity', 'ambient', 'fibres'],
      }),
    );
  }

  if (situation.wears_since_wash >= budget) {
    const bodyOdour = kb.soils.soils['body_odour'];
    const floor =
      bodyOdour?.need_floor_by_odour_retention?.[
        profile.odour_retention as keyof NonNullable<typeof bodyOdour.need_floor_by_odour_retention>
      ] ?? 'machine_wash_cold';
    hits.push(
      mkHit(kb, {
        rule_id: 'need.wear_budget_exceeded',
        layer: 'need',
        effect: { kind: 'need', floor },
        because:
          (budget < 1
            ? `${wornPhrase(situation.wears_since_wash)}. A garment of this kind, worn ` +
              `like this, is washed after every wear — it ${odourPhrase}. `
            : `${wornPhrase(situation.wears_since_wash)}, against about ` +
              `${Math.round(budget)} for this garment in this situation — ` +
              `it ${odourPhrase}. `) + mods.exceeded.rationale.trim(),
        sources: mods.exceeded.sources,
        inputs: ['wears_since_wash', 'next_to_skin', 'activity', 'ambient', 'fibres'],
      }),
    );
    hits.push(
      mkHit(kb, {
        rule_id: 'need.wear_budget_exceeded.min',
        layer: 'need',
        effect: { kind: 'need_min', floor: bodyOdour?.need_floor_min ?? floor },
        because: bodyOdour?.rationale_min ?? mods.exceeded.rationale.trim(),
        sources: mods.exceeded.sources,
        inputs: ['wears_since_wash', 'fibres'],
      }),
    );
  }

  /* ── category minimums ──────────────────────────────────────────────── */

  if (category?.min_need_after_wears && situation.wears_since_wash >= category.min_need_after_wears.wears) {
    hits.push(
      mkHit(kb, {
        rule_id: `category.${garment.category}.min_need`,
        layer: 'category',
        effect: { kind: 'need', floor: category.min_need_after_wears.floor },
        because: category.rationale,
        sources: category.sources,
        inputs: ['category', 'wears_since_wash'],
      }),
    );
    hits.push(
      mkHit(kb, {
        rule_id: `category.${garment.category}.min_need.min`,
        layer: 'category',
        effect: { kind: 'need_min', floor: category.min_need_after_wears.floor },
        because: category.rationale,
        sources: category.sources,
        inputs: ['category', 'wears_since_wash'],
      }),
    );
  }

  return { hits, unknowns, effective_wear_budget: budget };
}
