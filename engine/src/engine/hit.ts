import type { KnowledgeBase } from '../knowledge/load.js';
import type { RuleEffect, RuleHit, RuleLayer, SourceRef } from '../types/decision.js';

/**
 * Build a RuleHit, resolving source ids against the knowledge base.
 *
 * Every hit must carry at least one source. An uncited rule is a rule nobody
 * can argue with, which is the opposite of what this project is for.
 */
export function mkHit(
  kb: KnowledgeBase,
  args: {
    rule_id: string;
    layer: RuleLayer;
    effect: RuleEffect;
    because: string;
    sources: readonly string[];
    inputs: readonly string[];
  },
): RuleHit {
  const sources: SourceRef[] = [];
  for (const id of args.sources) {
    const found = kb.sources.get(id);
    if (!found) throw new Error(`rule ${args.rule_id} cites unknown source id "${id}"`);
    sources.push(found);
  }
  if (sources.length === 0) throw new Error(`rule ${args.rule_id} has no sources`);
  return {
    rule_id: args.rule_id,
    layer: args.layer,
    effect: args.effect,
    because: args.because,
    sources,
    inputs: args.inputs,
  };
}
