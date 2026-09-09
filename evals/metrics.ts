import type { KnowledgeBase } from '../src/knowledge/load.js';
import type { CareAction } from '../src/types/ladder.js';
import type { CareDecision } from '../src/types/decision.js';
import { domesticRung, isDomestic } from '../src/engine/ladder.js';

export type LabelledCase = {
  readonly case_id: string;
  readonly situation_id: string;
  readonly provenance: string;
  readonly expected_primary: CareAction;
  readonly max_safe_action: CareAction;
  readonly wash_required: boolean;
};

export type CaseResult = {
  readonly labelled: LabelledCase;
  readonly decision: CareDecision;
  readonly latency_ms: number;
  readonly faithfulness_violations: number;
  readonly exceeded_safe_ceiling: boolean;
  readonly exact: boolean;
  readonly within_one: boolean;
  readonly over_washed: boolean;
};

export type Metrics = {
  /** THE ONE THAT MATTERS. Any drop is a P0 and fails the build. */
  readonly damage_avoidance_recall: number;
  readonly decision_accuracy: number;
  readonly within_one_step: number;
  /** luur's brand metric: "wash less", made measurable. */
  readonly over_wash_rate: number;
  readonly explanation_faithfulness: number;
  readonly cases: number;
  readonly latency_p50_ms: number;
  readonly latency_p95_ms: number;
  readonly cost_usd: number;
};

/** Is this action a wash, as opposed to an intervention short of one? */
export function isWash(kb: KnowledgeBase, action: CareAction): boolean {
  if (!isDomestic(kb.ladder, action)) return true;
  const rung = domesticRung(kb.ladder, action);
  const washFloor = domesticRung(kb.ladder, 'hand_wash_cold');
  return rung !== null && washFloor !== null && rung >= washFloor;
}

/**
 * Did the engine recommend something that would damage this garment?
 *
 * Compared against the LABELLED ceiling, not the engine's own. The engine
 * satisfying its own ceiling is proved for all inputs in
 * test/invariants.test.ts; measuring it again here would only restate that.
 * What this measures is whether the engine's idea of safe matches a human's.
 */
export function exceededSafeCeiling(
  kb: KnowledgeBase,
  primary: CareAction,
  maxSafe: CareAction,
): boolean {
  if (!isDomestic(kb.ladder, primary)) return false; // professional is off this axis
  const a = domesticRung(kb.ladder, primary);
  const b = domesticRung(kb.ladder, maxSafe);
  if (a === null || b === null) return false;
  return a > b;
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[i] ?? 0;
}

export function summarise(results: readonly CaseResult[], costUsd: number): Metrics {
  const n = results.length || 1;
  const notNeedingWash = results.filter((r) => !r.labelled.wash_required);
  const latencies = [...results.map((r) => r.latency_ms)].sort((a, b) => a - b);

  return {
    damage_avoidance_recall: results.filter((r) => !r.exceeded_safe_ceiling).length / n,
    decision_accuracy: results.filter((r) => r.exact).length / n,
    within_one_step: results.filter((r) => r.within_one).length / n,
    over_wash_rate:
      notNeedingWash.length === 0
        ? 0
        : notNeedingWash.filter((r) => r.over_washed).length / notNeedingWash.length,
    explanation_faithfulness:
      results.filter((r) => r.faithfulness_violations === 0).length / n,
    cases: results.length,
    latency_p50_ms: percentile(latencies, 50),
    latency_p95_ms: percentile(latencies, 95),
    cost_usd: costUsd,
  };
}
