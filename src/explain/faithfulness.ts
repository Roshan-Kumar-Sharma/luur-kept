import type { KnowledgeBase } from '../knowledge/load.js';
import type { CareAction } from '../types/ladder.js';
import type { CareDecision } from '../types/decision.js';
import { CARE_ACTIONS } from '../types/ladder.js';

/**
 * Does the prose only say things the rules actually support?
 *
 * The template explainer is faithful by construction — it emits authored
 * `because` strings verbatim. This exists for the LLM explainer, which is the
 * one place in the system where text is generated rather than assembled, and
 * therefore the one place a claim could appear that no rule stands behind.
 *
 * It is also the `explanation_faithfulness` eval metric.
 */

export type Violation = {
  readonly kind: 'unsupported_action' | 'missing_primary' | 'invented_number' | 'banned_claim';
  readonly detail: string;
};

const BANNED = /\b(antibacterial|antimicrobial|kills?|sanitis|sanitiz|disinfect|hygien|allergen|steriliz|sterilis)/i;

/**
 * The authored rule text behind this decision — and nothing else.
 *
 * Deliberately excludes the ladder's action labels. Including them made the
 * mention check below vacuous: every action label is trivially "supported" if
 * the corpus contains every action label.
 */
function ruleText(decision: CareDecision): string {
  return [
    ...decision.reasoning.map((h) => h.because),
    ...decision.never_do.map((c) => `${c.never_do} ${c.because}`),
    ...decision.unknowns,
    decision.impact_estimate.energy_note,
    decision.impact_estimate.method,
  ].join(' ');
}

/** Rule text plus the wording of the actions this decision actually offers. */
function numberSupport(kb: KnowledgeBase, decision: CareDecision): string {
  const offered = [decision.primary, ...decision.alternatives, ...decision.do_first];
  return [
    ruleText(decision),
    ...offered.map((a) => {
      const entry = kb.ladder.actions[a];
      return `${entry?.label ?? ''} ${entry?.summary ?? ''}`;
    }),
    kb.ladder.drying.actions[decision.drying]?.summary ?? '',
  ].join(' ');
}

export function checkFaithfulness(
  kb: KnowledgeBase,
  decision: CareDecision,
  prose: string,
): Violation[] {
  const violations: Violation[] = [];
  const haystack = prose.toLowerCase();

  const allowed = new Set<CareAction>([
    decision.primary,
    ...decision.alternatives,
    ...decision.do_first,
  ]);

  /* Longest label first, so "machine wash cold" inside "machine wash cold,
     delicate cycle" is attributed to the longer one and not reported twice. */
  const labelled = CARE_ACTIONS.map((a) => ({
    action: a,
    label: (kb.ladder.actions[a]?.label ?? a).toLowerCase(),
  })).sort((x, y) => y.label.length - x.label.length);

  const support = ruleText(decision).toLowerCase();

  let remaining = haystack;
  for (const { action, label } of labelled) {
    if (!remaining.includes(label)) continue;
    remaining = remaining.split(label).join(' ');
    if (allowed.has(action)) continue;
    /* An action named inside an authored rule — "don't spot clean leather with
       water" — is being warned against, not recommended. This check is for
       claims that appear from nowhere, so a label already present in the rules
       behind this decision passes. That the prose recommends the right thing is
       covered separately, by missing_primary below. */
    if (support.includes(label)) continue;
    violations.push({
      kind: 'unsupported_action',
      detail: `mentions "${label}", which appears in no rule behind this decision`,
    });
  }

  const primaryLabel = (kb.ladder.actions[decision.primary]?.label ?? decision.primary).toLowerCase();
  if (!haystack.includes(primaryLabel)) {
    violations.push({
      kind: 'missing_primary',
      detail: `never says the recommended action ("${primaryLabel}")`,
    });
  }

  /* No figure may appear that is not in an authored rule string. This is what
     stops a model helpfully inventing "wash it at 30°C". */
  const numbers = numberSupport(kb, decision);
  for (const match of prose.matchAll(/\b\d+(?:\.\d+)?\b/g)) {
    const number = match[0];
    if (!numbers.includes(number)) {
      violations.push({
        kind: 'invented_number',
        detail: `states "${number}", which appears in no rule behind this decision`,
      });
    }
  }

  const banned = BANNED.exec(prose);
  if (banned) {
    violations.push({
      kind: 'banned_claim',
      detail: `contains "${banned[0]}" — health and chemical claims are out of scope`,
    });
  }

  return violations;
}
