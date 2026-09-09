import type { KnowledgeBase } from '../knowledge/load.js';
import type { CareAction, CareParam, ProfessionalRoute, Rung } from '../types/ladder.js';
import type { CareCeiling, NeedFloor, RuleHit } from '../types/decision.js';
import {
  gentlestDomestic,
  isDomestic,
  requireDomesticRung,
  topOfDomestic,
} from './ladder.js';

/**
 * ────────────────────────────────────────────────────────────────────────────
 *  The clamp.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Asymmetric loss is the whole design idea: recommending too aggressively
 * destroys the garment and cannot be undone, while recommending too gently
 * costs one extra cycle. So the engine is built so that the aggressive mistake
 * is not merely unlikely but unavailable.
 *
 * Two things make that true, and neither of them is a convention someone has
 * to remember:
 *
 *   1. The rule vocabulary (see src/types/decision.ts) has no operation that
 *      loosens anything. There is no `raise_ceiling`, no `permit`, no
 *      `override`. A rule cannot ask for more aggression; the language will
 *      not let it say so.
 *
 *   2. The ceiling is folded here, in one function, with one branch, taking
 *      min(). It starts at the top of the domestic segment and only ever
 *      descends. The need floor folds the other way with max(). Neither fold
 *      can see the other, so neither can be argued into crossing.
 *
 * Selection is then `the gentlest candidate that still meets the need`, which
 * is also what keeps over_wash_rate down — the engine cannot recommend a wash
 * when airing would do, because airing sorts first.
 */

export type Selection = {
  readonly primary: CareAction;
  readonly alternatives: readonly CareAction[];
  readonly ceiling: CareCeiling;
  readonly need: NeedFloor;
  readonly forbidden_actions: ReadonlySet<CareAction>;
  readonly forbidden_params: ReadonlySet<CareParam>;
  readonly do_first: readonly CareAction[];
  readonly escalated: boolean;
  readonly unknowns: readonly string[];
};

/** Monotonically non-increasing. There is no branch here that raises. */
export function foldCeiling(kb: KnowledgeBase, hits: readonly RuleHit[]): CareCeiling {
  const start = topOfDomestic(kb.ladder);
  let action = start;
  let rung = requireDomesticRung(kb.ladder, start);
  const set_by: RuleHit[] = [];

  for (const hit of hits) {
    if (hit.effect.kind !== 'ceiling') continue;
    const candidate = requireDomesticRung(kb.ladder, hit.effect.max);
    if (candidate < rung) {
      rung = candidate;
      action = hit.effect.max;
      set_by.push(hit);
    }
  }
  return { action, rung, set_by };
}

/**
 * The relaxed floor: the lowest intervention that still deals with the soil.
 * Folded with max() like the preferred floor, then clamped so it can never sit
 * above it — a relaxation that relaxed upward would not be one.
 */
export function foldNeedMin(
  kb: KnowledgeBase,
  hits: readonly RuleHit[],
  preferred: NeedFloor,
): NeedFloor {
  const start = gentlestDomestic(kb.ladder);
  let action = start;
  let rung = requireDomesticRung(kb.ladder, start);
  const set_by: RuleHit[] = [];

  for (const hit of hits) {
    if (hit.effect.kind !== 'need_min') continue;
    const candidate = requireDomesticRung(kb.ladder, hit.effect.floor);
    if (candidate > rung) {
      rung = candidate;
      action = hit.effect.floor;
      set_by.push(hit);
    }
  }
  if (rung > preferred.rung) return preferred;
  return { action, rung, set_by };
}

/** Monotonically non-decreasing. There is no branch here that lowers. */
export function foldNeed(kb: KnowledgeBase, hits: readonly RuleHit[]): NeedFloor {
  const start = gentlestDomestic(kb.ladder);
  let action = start;
  let rung = requireDomesticRung(kb.ladder, start);
  const set_by: RuleHit[] = [];

  for (const hit of hits) {
    if (hit.effect.kind !== 'need') continue;
    const candidate = requireDomesticRung(kb.ladder, hit.effect.floor);
    if (candidate > rung) {
      rung = candidate;
      action = hit.effect.floor;
      set_by.push(hit);
    }
  }
  return { action, rung, set_by };
}

function foldForbidden(hits: readonly RuleHit[]): {
  actions: Set<CareAction>;
  params: Set<CareParam>;
} {
  const actions = new Set<CareAction>();
  const params = new Set<CareParam>();
  for (const hit of hits) {
    if (hit.effect.kind === 'forbid') actions.add(hit.effect.action);
    if (hit.effect.kind === 'forbid_param') params.add(hit.effect.param);
  }
  return { actions, params };
}

/** Forbidding a way of working also forbids the rungs that require it. */
function actionsBlockedByParams(
  kb: KnowledgeBase,
  params: ReadonlySet<CareParam>,
): Set<CareAction> {
  const blocked = new Set<CareAction>();
  if (params.has('hot_water')) {
    for (const action of kb.ladder.segments.domestic) {
      if (kb.ladder.actions[action]?.heat === 'high') blocked.add(action);
    }
  }
  return blocked;
}

function routeAction(route: ProfessionalRoute): CareAction | null {
  if (route === 'dry_clean') return 'dry_clean';
  if (route === 'wet_clean') return 'professional_wet_clean';
  return null;
}

export function select(
  kb: KnowledgeBase,
  hits: readonly RuleHit[],
  professionalRoute: ProfessionalRoute,
): Selection {
  const ceiling = foldCeiling(kb, hits);
  const need = foldNeed(kb, hits);
  const { actions: forbiddenActions, params: forbiddenParams } = foldForbidden(hits);
  for (const a of actionsBlockedByParams(kb, forbiddenParams)) forbiddenActions.add(a);

  const do_first = [
    ...new Set(
      hits.flatMap((h) => (h.effect.kind === 'require_first' ? [h.effect.action] : [])),
    ),
  ].filter((a) => requireDomesticRung(kb.ladder, a) <= ceiling.rung);


  const unknowns: string[] = [];
  const permitted = (a: CareAction): boolean => !forbiddenActions.has(a);
  const atOrBelowCeiling = kb.ladder.segments.domestic.filter(
    (a) => requireDomesticRung(kb.ladder, a) <= ceiling.rung && permitted(a),
  );
  const meetsNeed = atOrBelowCeiling.filter(
    (a) => requireDomesticRung(kb.ladder, a) >= need.rung,
  );

  const needMin = foldNeedMin(kb, hits, need);
  const meetsRelaxedNeed = atOrBelowCeiling.filter(
    (a) => requireDomesticRung(kb.ladder, a) >= needMin.rung,
  );

  let primary: CareAction;
  let escalated = false;

  if (meetsNeed.length > 0) {
    /* The ordinary path: the gentlest thing that actually deals with it. */
    primary = meetsNeed[0] as CareAction;
  } else if (meetsRelaxedNeed.length > 0) {
    /* The garment cannot take the usual treatment for this soil, but something
       gentler still deals with it. A sweaty silk blouse gets a cold hand wash,
       not a trip to the dry cleaner. */
    primary = meetsRelaxedNeed.at(-1) as CareAction;
    unknowns.push(
      `This garment cannot take the usual treatment for what is on it, so the ` +
        `gentlest thing that still deals with it is used instead.`,
    );
  } else {
    /* The need is above what this garment can safely take at home. Escalate
       to a professional if the fibre has a route, and otherwise do the most
       effective safe thing and say plainly that it may not be enough. Under
       no circumstances climb past the ceiling to close the gap. */
    const escalation = routeAction(professionalRoute);
    if (escalation && permitted(escalation)) {
      primary = escalation;
      escalated = true;
      unknowns.push(
        'What this garment needs is more than can safely be done to it at home, ' +
          'so it is sent to a professional rather than treated more aggressively.',
      );
    } else {
      primary = atOrBelowCeiling.at(-1) ?? gentlestDomestic(kb.ladder);
      unknowns.push(
        'What this garment needs may be more than can safely be done to it at home, ' +
          'and it has no professional route recorded. The gentler option is taken ' +
          'deliberately; repeat it rather than escalating.',
      );
    }
  }

  const pool = meetsNeed.length > 0 ? meetsNeed : meetsRelaxedNeed;
  const alternatives = [
    ...pool.filter((a) => a !== primary).slice(0, 2),
    ...(escalated ? atOrBelowCeiling.slice(-1).filter((a) => a !== primary) : []),
  ];

  assertClampHeld(kb, primary, ceiling, forbiddenActions);

  return {
    primary,
    alternatives,
    ceiling,
    need,
    /* "Spot clean, then spot clean" helps nobody. */
    do_first: do_first.filter((a) => a !== primary),
    forbidden_actions: forbiddenActions,
    forbidden_params: forbiddenParams,
    escalated,
    unknowns,
  };
}

/**
 * The invariant, checked at the source rather than only in evals.
 *
 * `damage_avoidance_recall` is the headline metric and any miss is a P0, so
 * this throws rather than returning. A crash in CI is a far better outcome
 * than a confident recommendation to hot-wash someone's cashmere.
 */
export function assertClampHeld(
  kb: KnowledgeBase,
  primary: CareAction,
  ceiling: CareCeiling,
  forbidden: ReadonlySet<CareAction>,
): void {
  if (forbidden.has(primary)) {
    throw new Error(`engine invariant violated: "${primary}" was selected but is forbidden`);
  }
  if (!isDomestic(kb.ladder, primary)) return; // professional is a separate axis
  const rung: Rung = requireDomesticRung(kb.ladder, primary);
  if (rung > ceiling.rung) {
    throw new Error(
      `engine invariant violated: selected "${primary}" (rung ${rung}) above the care ` +
        `ceiling "${ceiling.action}" (rung ${ceiling.rung})`,
    );
  }
}
