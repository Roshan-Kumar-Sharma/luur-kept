import type { KnowledgeBase } from '../knowledge/load.js';
import type { FibreFile, Modifier } from '../knowledge/schema.js';
import type { Garment } from '../types/garment.js';
import type { DryingAction, ProfessionalRoute } from '../types/ladder.js';
import type { RuleHit, ShedClass } from '../types/decision.js';
import { mkHit } from './hit.js';
import { shiftOrdinal, weightedOrdinal, worstOrdinal } from './scales.js';
import { topOfDomestic } from './ladder.js';

export type GarmentProfile = {
  readonly fibres: readonly { readonly fibre: FibreFile; readonly pct: number }[];
  readonly odour_retention: string;
  readonly shed_class: ShedClass;
  readonly pilling_risk: string;
  readonly wet_strength: string;
  readonly agitation_tolerance: string;
  readonly max_safe_temp_c: number;
  readonly permitted_drying: readonly DryingAction[];
  /** Wears this garment supports before a wash is indicated, before situation. */
  readonly wear_budget: number;
  readonly professional_route: ProfessionalRoute;
  readonly hits: readonly RuleHit[];
  readonly unknowns: readonly string[];
};

const ROUTE_RANK: Record<ProfessionalRoute, number> = { none: 0, wet_clean: 1, dry_clean: 2 };

function modifiersFor(kb: KnowledgeBase, garment: Garment): { id: string; group: string; mod: Modifier }[] {
  const out: { id: string; group: string; mod: Modifier }[] = [];
  const c = kb.constructions.constructions[garment.construction];
  if (c) out.push({ id: garment.construction, group: 'constructions', mod: c });
  if (garment.sub_construction) {
    const s = kb.constructions.sub_constructions[garment.sub_construction];
    if (s) out.push({ id: garment.sub_construction, group: 'sub_constructions', mod: s });
  }
  for (const f of garment.finish ?? []) {
    const fin = kb.constructions.finishes[f];
    if (fin) out.push({ id: f, group: 'finishes', mod: fin });
  }
  return out;
}

/**
 * Fibre matrix + construction → what this garment can tolerate.
 *
 * Safety fields take the worst case across every declared fibre at any
 * percentage; behavioural fields are percentage-weighted. See the comment at
 * the top of knowledge/blending.yaml for why averaging the safety fields would
 * be the most dangerous simplification available here.
 */
export function buildProfile(kb: KnowledgeBase, garment: Garment): GarmentProfile {
  const hits: RuleHit[] = [];
  const unknowns: string[] = [];
  const scales = kb.blending.scales;
  const worstEnd = kb.blending.worst_end;

  const scaleOf = (name: string): readonly string[] => {
    const s = scales[name];
    if (!s) throw new Error(`blending.yaml has no scale for "${name}"`);
    return s;
  };
  const worstEndOf = (name: string): 'low' | 'high' => {
    const w = worstEnd[name];
    if (!w) throw new Error(`blending.yaml has no worst_end for "${name}"`);
    return w;
  };

  /* ── resolve fibres ─────────────────────────────────────────────────── */

  const resolved = garment.fibres.map(({ fibre, pct }) => {
    const found = kb.fibres.get(fibre);
    if (!found) {
      throw new Error(
        `unknown fibre "${fibre}". Known fibres: ${[...kb.fibres.keys()].sort().join(', ')}`,
      );
    }
    return { fibre: found, pct };
  });

  const totalPct = resolved.reduce((s, f) => s + f.pct, 0);
  if (Math.abs(totalPct - 100) > 1) {
    unknowns.push(
      `The fibre percentages add up to ${totalPct}%, not 100%. Treating them as relative ` +
        'proportions. Check the composition on the label.',
    );
  }

  for (const { fibre } of resolved) {
    for (const u of fibre.unknowns ?? []) {
      hits.push(
        mkHit(kb, {
          rule_id: `fibre.${fibre.id}.unknown.${u.id}`,
          layer: 'fibre',
          effect: { kind: 'unknown', note: u.ask },
          because: u.note ?? u.ask,
          sources: fibre.sources['ceiling'] ?? ['engineer-inference'],
          inputs: ['fibres'],
        }),
      );
    }
  }

  /* ── safety: worst case, every fibre counts at any percentage ───────── */

  const top = topOfDomestic(kb.ladder);
  for (const { fibre, pct } of resolved) {
    if (fibre.ceiling === top) continue; // contributes no limit worth stating
    hits.push(
      mkHit(kb, {
        rule_id: `fibre.${fibre.id}.ceiling`,
        layer: 'fibre',
        effect: { kind: 'ceiling', max: fibre.ceiling },
        because: fibre.rationale['ceiling'] ?? `${fibre.display_name} limits how it can be washed.`,
        sources: fibre.sources['ceiling'] ?? ['engineer-inference'],
        inputs: ['fibres'],
      }),
    );
    if (pct < 20 && fibre.minor_component_still_governs) {
      hits.push(
        mkHit(kb, {
          rule_id: `blend.minor_component.${fibre.id}`,
          layer: 'blend',
          effect: { kind: 'ceiling', max: fibre.ceiling },
          because:
            fibre.rationale['minor_component_still_governs'] ??
            kb.blending.safety.rationale,
          sources: fibre.sources['minor_component_still_governs'] ?? kb.blending.safety.sources,
          inputs: ['fibres'],
        }),
      );
    }
  }

  const maxSafeTemp = Math.min(...resolved.map((f) => f.fibre.properties.max_safe_temp_c));
  const agitation = worstOrdinal(
    scaleOf('agitation_tolerance'),
    worstEndOf('agitation_tolerance'),
    resolved.map((f) => f.fibre.properties.agitation_tolerance),
  );
  const wetStrength = worstOrdinal(
    scaleOf('wet_strength'),
    worstEndOf('wet_strength'),
    resolved.map((f) => f.fibre.properties.wet_strength),
  );

  /* Drying: only what every fibre in the blend permits. */
  let permitted: DryingAction[] = kb.ladder.drying.order.filter((d) =>
    resolved.every((f) => f.fibre.properties.permitted_drying.includes(d)),
  );
  if (permitted.length === 0) {
    permitted = ['air_only'];
    unknowns.push(
      'The fibres in this blend permit no drying method in common, so the gentlest ' +
        'available is used. Check the label before machine drying.',
    );
  }

  /* ── behaviour: percentage-weighted, with a dominant-fibre override ─── */

  const odourScale = scaleOf('odour_retention');
  let odour = weightedOrdinal(
    odourScale,
    resolved.map((f) => ({ value: f.fibre.properties.odour_retention, weight: f.pct })),
  );
  const override = kb.blending.behaviour.dominant_override;
  if (override.applies_to.includes('odour_retention')) {
    const dominant = resolved.filter((f) => f.pct >= override.min_pct);
    if (dominant.length > 0) {
      const worst = worstOrdinal(
        odourScale,
        worstEndOf('odour_retention'),
        dominant.map((f) => f.fibre.properties.odour_retention),
      );
      if (odourScale.indexOf(worst) > odourScale.indexOf(odour)) {
        const driver = dominant.find((f) => f.fibre.properties.odour_retention === worst);
        odour = worst;
        hits.push(
          mkHit(kb, {
            rule_id: 'blend.dominant_odour_override',
            layer: 'blend',
            effect: { kind: 'unknown', note: override.rationale },
            because: driver
              ? `At ${driver.pct}% of this garment, ${driver.fibre.display_name} governs how it holds odour — a weighted average would hide it.`
              : override.rationale,
            sources: override.sources,
            inputs: ['fibres'],
          }),
        );
      }
    }
  }

  const pilling = weightedOrdinal(
    scaleOf('pilling_risk'),
    resolved.map((f) => ({ value: f.fibre.properties.pilling_risk, weight: f.pct })),
  );

  /* ── shedding: fibre baseline, then construction ────────────────────── */

  const shedScale = scaleOf('shed_class');
  let shed = weightedOrdinal(
    shedScale,
    resolved.map((f) => ({ value: f.fibre.properties.shed_class, weight: f.pct })),
  );

  let route: ProfessionalRoute = resolved.reduce<ProfessionalRoute>(
    (acc, f) => (ROUTE_RANK[f.fibre.professional_route] > ROUTE_RANK[acc] ? f.fibre.professional_route : acc),
    'none',
  );

  for (const { id, group, mod } of modifiersFor(kb, garment)) {
    if (mod.shed_shift) {
      shed = shiftOrdinal(shedScale, shed, mod.shed_shift);
      hits.push(
        mkHit(kb, {
          rule_id: `construction.${group}.${id}.shed`,
          layer: group === 'finishes' ? 'finish' : 'construction',
          effect: { kind: 'shed_shift', steps: mod.shed_shift },
          because: mod.rationale,
          sources: mod.sources,
          inputs: group === 'finishes' ? ['finish'] : ['construction', 'sub_construction'],
        }),
      );
    }
    if (mod.ceiling) {
      hits.push(
        mkHit(kb, {
          rule_id: `construction.${group}.${id}.ceiling`,
          layer: group === 'finishes' ? 'finish' : 'construction',
          effect: { kind: 'ceiling', max: mod.ceiling },
          because: mod.rationale,
          sources: mod.sources,
          inputs: group === 'finishes' ? ['finish'] : ['construction'],
        }),
      );
    }
    if (mod.professional_route && ROUTE_RANK[mod.professional_route] > ROUTE_RANK[route]) {
      route = mod.professional_route;
    }
    for (const param of mod.forbid_params ?? []) {
      hits.push(
        mkHit(kb, {
          rule_id: `construction.${group}.${id}.forbid.${param}`,
          layer: group === 'finishes' ? 'finish' : 'construction',
          effect: { kind: 'forbid_param', param },
          because: mod.rationale,
          sources: mod.sources,
          inputs: group === 'finishes' ? ['finish'] : ['construction'],
        }),
      );
    }
  }

  /* ── wear budget ────────────────────────────────────────────────────── */

  const weightTotal = resolved.reduce((s, f) => s + f.pct, 0) || 1;
  const fibreBudget =
    resolved.reduce((s, f) => s + f.fibre.wears_per_wash_baseline * f.pct, 0) / weightTotal;

  const category = kb.categories[garment.category];
  if (!category) {
    throw new Error(
      `unknown category "${garment.category}". Known: ${Object.keys(kb.categories).sort().join(', ')}`,
    );
  }
  let wearBudget = fibreBudget * category.wears_multiplier;
  for (const { id, group, mod } of modifiersFor(kb, garment)) {
    if (!mod.wears_multiplier) continue;
    wearBudget *= mod.wears_multiplier;
    hits.push(
      mkHit(kb, {
        rule_id: `construction.${group}.${id}.wears`,
        layer: group === 'finishes' ? 'finish' : 'construction',
        effect: { kind: 'unknown', note: mod.rationale },
        because: mod.rationale,
        sources: mod.sources,
        inputs: group === 'finishes' ? ['finish'] : ['construction'],
      }),
    );
  }

  return {
    fibres: resolved,
    odour_retention: odour,
    shed_class: shed as ShedClass,
    pilling_risk: pilling,
    wet_strength: wetStrength,
    agitation_tolerance: agitation,
    max_safe_temp_c: maxSafeTemp,
    permitted_drying: permitted,
    wear_budget: wearBudget,
    professional_route: route,
    hits,
    unknowns,
  };
}
