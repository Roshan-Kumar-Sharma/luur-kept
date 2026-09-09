import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { loadKnowledge } from '../src/knowledge/load.js';
import { provenanceReport } from '../src/knowledge/lint.js';
import { decide } from '../src/engine/index.js';
import { explain } from '../src/explain/template.js';
import { checkFaithfulness } from '../src/explain/faithfulness.js';
import { domesticRung, isDomestic } from '../src/engine/ladder.js';
import { GarmentSchema, SituationSchema } from '../src/types/garment.js';
import { CARE_ACTIONS } from '../src/types/ladder.js';
import { exceededSafeCeiling, isWash, summarise, type CaseResult } from './metrics.js';

const here = dirname(fileURLToPath(import.meta.url));
const careAction = z.enum(CARE_ACTIONS);

const CasesSchema = z.object({
  cases: z.array(
    z.object({
      id: z.string(),
      provenance: z.enum(['synthetic_engineer', 'field_observed']),
      label: z.string(),
      garment: GarmentSchema,
      situations: z.array(
        z.object({
          id: z.string(),
          situation: SituationSchema,
          expected_primary: careAction,
          max_safe_action: careAction,
          wash_required: z.boolean(),
          note: z.string().optional(),
        }),
      ),
    }),
  ),
});

const BaselineSchema = z.object({
  damage_avoidance_recall: z.number(),
  decision_accuracy: z.number(),
  within_one_step: z.number(),
  over_wash_rate: z.number(),
  explanation_faithfulness: z.number(),
});

const kb = loadKnowledge();
const cases = CasesSchema.parse(parseYaml(readFileSync(join(here, 'golden/cases.yaml'), 'utf8')));

const results: CaseResult[] = [];
const failures: string[] = [];

for (const c of cases.cases) {
  for (const s of c.situations) {
    const started = performance.now();
    const decision = decide(kb, c.garment, s.situation);
    const latency_ms = performance.now() - started;

    const prose = explain(kb, decision).prose;
    const violations = checkFaithfulness(kb, decision, prose);

    const exceeded = exceededSafeCeiling(kb, decision.primary, s.max_safe_action);
    const exact = decision.primary === s.expected_primary;

    const a = domesticRung(kb.ladder, decision.primary);
    const b = domesticRung(kb.ladder, s.expected_primary);
    const within_one =
      exact ||
      (isDomestic(kb.ladder, decision.primary) &&
        isDomestic(kb.ladder, s.expected_primary) &&
        a !== null &&
        b !== null &&
        Math.abs(a - b) <= 1);

    const over_washed = !s.wash_required && isWash(kb, decision.primary);

    results.push({
      labelled: {
        case_id: c.id,
        situation_id: s.id,
        provenance: c.provenance,
        expected_primary: s.expected_primary,
        max_safe_action: s.max_safe_action,
        wash_required: s.wash_required,
      },
      decision,
      latency_ms,
      faithfulness_violations: violations.length,
      exceeded_safe_ceiling: exceeded,
      exact,
      within_one,
      over_washed,
    });

    if (exceeded) {
      failures.push(
        `  P0  ${c.id}/${s.id}: recommended "${decision.primary}" above the labelled ` +
          `safe ceiling "${s.max_safe_action}"`,
      );
    }
    if (violations.length > 0) {
      failures.push(
        `  ??  ${c.id}/${s.id}: explanation unfaithful — ${violations.map((v) => v.detail).join('; ')}`,
      );
    }
  }
}

const metrics = summarise(results, 0);
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

console.log('\nKEPT — eval report');
console.log('─'.repeat(72));
console.log(`  damage_avoidance_recall  ${pct(metrics.damage_avoidance_recall).padStart(7)}   ← the one that matters`);
console.log(`  over_wash_rate           ${pct(metrics.over_wash_rate).padStart(7)}   ← luur's brand metric, lower is better`);
console.log(`  decision_accuracy        ${pct(metrics.decision_accuracy).padStart(7)}`);
console.log(`  within_one_step          ${pct(metrics.within_one_step).padStart(7)}`);
console.log(`  explanation_faithfulness ${pct(metrics.explanation_faithfulness).padStart(7)}`);
console.log('─'.repeat(72));
console.log(
  `  ${metrics.cases} labelled decisions across ${cases.cases.length} garments · ` +
    `p50 ${metrics.latency_p50_ms.toFixed(2)}ms · p95 ${metrics.latency_p95_ms.toFixed(2)}ms · ` +
    `$${metrics.cost_usd.toFixed(4)}`,
);

const fieldObserved = cases.cases.filter((c) => c.provenance === 'field_observed').length;
const prov = provenanceReport(kb);
console.log('');
console.log(
  `  ${fieldObserved} of ${cases.cases.length} garments are field-observed; the rest are ` +
    'engineer-authored fixtures.',
);
console.log(
  `  ${prov.fibres_expert_reviewed} of ${prov.fibres_total} fibres are expert-reviewed. ` +
    `${prov.claims_engineer_inference_only} of ${prov.claims_total} claims rest on inference alone.`,
);
console.log('  See evals/golden/PROVENANCE.md before quoting any of these numbers.');

if (failures.length > 0) {
  console.log('');
  for (const f of failures) console.log(f);
}

/* Where the engine and the labels disagree — the interesting list, and the
   first thing to put in front of someone who actually knows textiles. */
const disagreements = results.filter((r) => !r.exact);
if (disagreements.length > 0) {
  console.log('\n  Disagreements with the labels:');
  for (const r of disagreements) {
    console.log(
      `    ${r.labelled.case_id}/${r.labelled.situation_id}: ` +
        `expected ${r.labelled.expected_primary}, got ${r.decision.primary}` +
        `${r.within_one ? ' (one step)' : ''}`,
    );
  }
}

/* ── the CI gate ─────────────────────────────────────────────────────────── */

const baselinePath = join(here, 'baseline.json');
let exitCode = 0;

if (metrics.damage_avoidance_recall < 1) {
  console.error(
    `\nFAIL: damage_avoidance_recall is ${pct(metrics.damage_avoidance_recall)}. ` +
      'It must be 100%. Recommending above the safe ceiling destroys garments, and ' +
      'that is not a metric to trade against anything else.',
  );
  exitCode = 1;
}

if (existsSync(baselinePath)) {
  const baseline = BaselineSchema.parse(JSON.parse(readFileSync(baselinePath, 'utf8')));
  if (metrics.damage_avoidance_recall < baseline.damage_avoidance_recall) {
    console.error(
      `\nFAIL: damage_avoidance_recall dropped from ` +
        `${pct(baseline.damage_avoidance_recall)} to ${pct(metrics.damage_avoidance_recall)}.`,
    );
    exitCode = 1;
  }
  if (metrics.over_wash_rate > baseline.over_wash_rate + 0.001) {
    console.error(
      `\nFAIL: over_wash_rate rose from ${pct(baseline.over_wash_rate)} to ` +
        `${pct(metrics.over_wash_rate)}. The engine started recommending washes it did not need to.`,
    );
    exitCode = 1;
  }
} else {
  console.log('\nNo baseline yet — writing one.');
}

if (process.argv.includes('--write-baseline') || !existsSync(baselinePath)) {
  writeFileSync(
    baselinePath,
    `${JSON.stringify(
      {
        damage_avoidance_recall: metrics.damage_avoidance_recall,
        decision_accuracy: metrics.decision_accuracy,
        within_one_step: metrics.within_one_step,
        over_wash_rate: metrics.over_wash_rate,
        explanation_faithfulness: metrics.explanation_faithfulness,
      },
      null,
      2,
    )}\n`,
  );
  console.log('Baseline written to evals/baseline.json');
}

const reportDir = join(here, 'reports');
if (!existsSync(reportDir)) mkdirSync(reportDir, { recursive: true });
writeFileSync(join(reportDir, 'latest.json'), `${JSON.stringify({ metrics, results }, null, 2)}\n`);

console.log('');
process.exit(exitCode);
