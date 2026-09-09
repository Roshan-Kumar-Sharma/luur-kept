import type { KnowledgeBase } from '../knowledge/load.js';
import type { CareDecision, RuleHit } from '../types/decision.js';
import { actionLabel, actionSummary, dryingLabel } from '../engine/ladder.js';

/**
 * The deterministic explainer.
 *
 * It emits the `because` strings authored in YAML verbatim, each tagged with
 * the rule it came from. So the explanation is faithful by construction rather
 * than by inspection: there is no step at which a claim could enter the prose
 * without a rule behind it.
 *
 * This is the default and the path CI runs on. src/explain/llm.ts can rephrase
 * the same claims more fluently, and is checked against this one.
 */

export type Claim = {
  readonly text: string;
  readonly rule_id: string;
};

export type Explanation = {
  readonly headline: string;
  readonly summary: string;
  readonly claims: readonly Claim[];
  readonly prose: string;
};

/** Rules that actually shaped the answer, most decisive first. */
export function decisiveHits(decision: CareDecision): RuleHit[] {
  const shaped = new Set<string>([
    ...decision.need.set_by.map((h) => h.rule_id),
    ...decision.ceiling.set_by.map((h) => h.rule_id),
  ]);

  /* Order matters more than it looks. The reader's first question is "do I have
     to do anything?", and only then "how far can I go?". Leading with the
     ceiling answers the second question first and buries the point. */
  const rank = (h: RuleHit): number => {
    if (h.layer === 'need') return 0;
    if (h.layer === 'soil') return 1;
    if (h.layer === 'blend') return 2;
    if (h.layer === 'category') return 3;
    return 4; // fibre, construction, finish, constraint — the limits
  };

  const relevant = decision.reasoning.filter(
    (h) =>
      shaped.has(h.rule_id) ||
      h.layer === 'need' ||
      h.rule_id === 'blend.dominant_odour_override',
  );

  const seen = new Set<string>();
  return relevant
    .filter((h) => {
      if (seen.has(h.rule_id) || h.effect.kind === 'need_min') return false;
      seen.add(h.rule_id);
      return true;
    })
    .sort((a, b) => rank(a) - rank(b));
}

export function explain(kb: KnowledgeBase, decision: CareDecision): Explanation {
  const headline = actionLabel(kb.ladder, decision.primary);
  const summary = actionSummary(kb.ladder, decision.primary);

  const claims: Claim[] = decisiveHits(decision).map((h) => ({
    text: h.because,
    rule_id: h.rule_id,
  }));

  if (decision.escalated) {
    claims.push({
      text:
        'What this garment needs is more than can safely be done to it at home, ' +
        'so it goes to a professional rather than being treated harder.',
      rule_id: 'engine.escalation',
    });
  }

  const prose = [`${headline}.`, summary, ...claims.map((c) => c.text)].join(' ');

  return { headline, summary, claims, prose };
}

/** A plain-text rendering for the CLI. */
export function render(kb: KnowledgeBase, decision: CareDecision): string {
  const e = explain(kb, decision);
  const lines: string[] = [];

  lines.push(e.headline.toUpperCase());
  lines.push('');
  lines.push(e.summary);
  lines.push('');

  lines.push('WHY');
  for (const claim of e.claims) lines.push(`  · ${claim.text}`);

  if (decision.do_first.length > 0) {
    lines.push('');
    lines.push('FIRST');
    for (const a of decision.do_first) {
      lines.push(`  · ${actionLabel(kb.ladder, a)} — ${actionSummary(kb.ladder, a)}`);
    }
  }

  if (decision.never_do.length > 0) {
    lines.push('');
    lines.push('NEVER');
    for (const c of decision.never_do) lines.push(`  ✗ ${c.never_do} ${c.because}`);
  }

  lines.push('');
  lines.push('DRYING');
  lines.push(`  ${dryingLabel(kb.ladder, decision.drying)}`);

  lines.push('');
  lines.push('IMPACT (estimates)');
  lines.push(`  Relative shedding if washed: ${decision.impact_estimate.relative_shedding}`);
  lines.push(`  ${decision.impact_estimate.energy_note}`);
  if (decision.impact_estimate.wears_extended_estimate) {
    lines.push(
      `  Roughly ${decision.impact_estimate.wears_extended_estimate} more wears before a wash is indicated.`,
    );
  }
  lines.push(`  Method: ${decision.impact_estimate.method}`);

  if (decision.alternatives.length > 0) {
    lines.push('');
    lines.push('ALSO FINE');
    lines.push(`  ${decision.alternatives.map((a) => actionLabel(kb.ladder, a)).join(', ')}`);
  }

  if (decision.unknowns.length > 0) {
    lines.push('');
    lines.push('WORTH CHECKING');
    for (const u of decision.unknowns) lines.push(`  ? ${u}`);
  }

  lines.push('');
  lines.push(`Confidence ${decision.confidence}. Ceiling for this garment: ${actionLabel(kb.ladder, decision.ceiling.action)}.`);
  lines.push('');
  lines.push(
    'Advisory only, and conservative by design. When in doubt, follow the garment’s own label.',
  );

  return lines.join('\n');
}
