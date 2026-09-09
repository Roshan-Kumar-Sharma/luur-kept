import { CARE_ACTIONS, DRYING_ACTIONS } from '../types/ladder.js';
import type { KnowledgeBase } from './load.js';

export type Finding = {
  readonly severity: 'error' | 'warn';
  readonly where: string;
  readonly message: string;
};

/**
 * Guardrail §10 says: no health, safety or chemical claims. That is a promise
 * about every string a user will ever see, so it is checked rather than
 * remembered. The prose lives in YAML, so this can lint all of it.
 */
const BANNED_CLAIMS: readonly { pattern: RegExp; why: string }[] = [
  { pattern: /\bantibacterial\b/i, why: 'health claim' },
  { pattern: /\bantimicrobial\b/i, why: 'health claim' },
  { pattern: /\bkill(s|ed|ing)?\b/i, why: 'reads as a biocidal claim' },
  { pattern: /\bsanitis|sanitiz/i, why: 'health claim' },
  { pattern: /\bdisinfect/i, why: 'health claim' },
  { pattern: /\bsterilis|steriliz/i, why: 'health claim' },
  { pattern: /\bhygien/i, why: 'health claim' },
  { pattern: /\ballergen|hypoallergen/i, why: 'allergen advice is out of scope' },
  { pattern: /\bmedical|dermatolog/i, why: 'health claim' },
  { pattern: /\bnon-?toxic\b/i, why: 'chemical safety claim' },
];

type Prose = { where: string; text: string };

function collectProse(kb: KnowledgeBase): Prose[] {
  const out: Prose[] = [];
  const push = (where: string, text: string | undefined) => {
    if (text) out.push({ where, text });
  };

  for (const [id, f] of kb.fibres) {
    for (const [field, text] of Object.entries(f.rationale)) {
      push(`fibres/${id}.yaml rationale.${field}`, text);
    }
    for (const u of f.unknowns ?? []) {
      push(`fibres/${id}.yaml unknowns.${u.id}.ask`, u.ask);
      push(`fibres/${id}.yaml unknowns.${u.id}.note`, u.note);
    }
  }
  for (const group of ['constructions', 'sub_constructions', 'finishes'] as const) {
    for (const [id, m] of Object.entries(kb.constructions[group])) {
      push(`constructions.yaml ${group}.${id}`, m.rationale);
    }
  }
  for (const [id, c] of Object.entries(kb.categories)) {
    push(`categories.yaml ${id}`, c.rationale);
  }
  for (const [id, s] of Object.entries(kb.soils.soils)) {
    push(`soils.yaml ${id}`, s?.rationale);
  }
  for (const c of kb.constraints) {
    push(`constraints.yaml ${c.id}.never_do`, c.never_do);
    push(`constraints.yaml ${c.id}.because`, c.because);
  }
  for (const [id, a] of Object.entries(kb.ladder.actions)) {
    push(`ladder.yaml ${id}.summary`, a?.summary);
  }
  return out;
}

/** Every source id used anywhere, with where it was used. */
function collectSourceRefs(kb: KnowledgeBase): { where: string; ids: readonly string[] }[] {
  const out: { where: string; ids: readonly string[] }[] = [];
  for (const [id, f] of kb.fibres) {
    for (const [field, ids] of Object.entries(f.sources)) {
      out.push({ where: `fibres/${id}.yaml sources.${field}`, ids });
    }
  }
  for (const group of ['constructions', 'sub_constructions', 'finishes'] as const) {
    for (const [id, m] of Object.entries(kb.constructions[group])) {
      out.push({ where: `constructions.yaml ${group}.${id}`, ids: m.sources });
    }
  }
  for (const [id, c] of Object.entries(kb.categories)) {
    out.push({ where: `categories.yaml ${id}`, ids: c.sources });
  }
  for (const [id, s] of Object.entries(kb.soils.soils)) {
    if (s) out.push({ where: `soils.yaml ${id}`, ids: s.sources });
  }
  for (const c of kb.constraints) {
    out.push({ where: `constraints.yaml ${c.id}`, ids: c.sources });
  }
  return out;
}

export function lintKnowledge(kb: KnowledgeBase): Finding[] {
  const findings: Finding[] = [];
  const err = (where: string, message: string) =>
    findings.push({ severity: 'error', where, message });
  const warn = (where: string, message: string) =>
    findings.push({ severity: 'warn', where, message });

  /* 1. Every cited source resolves. */
  for (const { where, ids } of collectSourceRefs(kb)) {
    for (const id of ids) {
      if (!kb.sources.has(id)) err(where, `cites unknown source id "${id}"`);
    }
  }

  /* 2. The ladder covers the engine vocabulary exactly, once each. */
  const laddered = [...kb.ladder.segments.domestic, ...kb.ladder.segments.professional];
  const seen = new Set<string>();
  for (const a of laddered) {
    if (seen.has(a)) err('ladder.yaml', `action "${a}" appears in more than one segment`);
    seen.add(a);
  }
  for (const a of CARE_ACTIONS) {
    if (!seen.has(a)) err('ladder.yaml', `action "${a}" is missing from both segments`);
    if (!kb.ladder.actions[a]) err('ladder.yaml', `action "${a}" has no entry under actions:`);
  }
  for (const d of DRYING_ACTIONS) {
    if (!kb.ladder.drying.order.includes(d)) {
      err('ladder.yaml', `drying action "${d}" is missing from drying.order`);
    }
    if (!kb.ladder.drying.actions[d]) {
      err('ladder.yaml', `drying action "${d}" has no entry under drying.actions:`);
    }
  }

  /* 3. Fibre ceilings are domestic. Professional is a separate axis, and a
        fibre that put its ceiling there would silently disable the clamp. */
  const domestic = new Set<string>(kb.ladder.segments.domestic);
  for (const [id, f] of kb.fibres) {
    if (!domestic.has(f.ceiling)) {
      err(`fibres/${id}.yaml`, `ceiling "${f.ceiling}" is not in the domestic segment`);
    }
    for (const field of Object.keys(f.rationale)) {
      if (!(field in f.sources)) {
        warn(`fibres/${id}.yaml`, `rationale.${field} has no matching sources.${field}`);
      }
    }
    for (const field of Object.keys(f.sources)) {
      if (!(field in f.rationale)) {
        warn(`fibres/${id}.yaml`, `sources.${field} has no matching rationale.${field}`);
      }
    }
  }

  /* 4. Constraint conditions only reference things that exist. */
  const constructionIds = new Set(Object.keys(kb.constructions.constructions));
  const finishIds = new Set(Object.keys(kb.constructions.finishes));
  const categoryIds = new Set(Object.keys(kb.categories));
  for (const c of kb.constraints) {
    for (const id of c.when.any_fibre ?? []) {
      if (!kb.fibres.has(id)) err(`constraints.yaml ${c.id}`, `unknown fibre "${id}"`);
    }
    if (c.when.any_fibre_min_pct && !kb.fibres.has(c.when.any_fibre_min_pct.fibre)) {
      err(`constraints.yaml ${c.id}`, `unknown fibre "${c.when.any_fibre_min_pct.fibre}"`);
    }
    for (const id of c.when.construction ?? []) {
      if (!constructionIds.has(id)) err(`constraints.yaml ${c.id}`, `unknown construction "${id}"`);
    }
    for (const id of c.when.finish_any ?? []) {
      if (!finishIds.has(id)) err(`constraints.yaml ${c.id}`, `unknown finish "${id}"`);
    }
    for (const id of c.when.category ?? []) {
      if (!categoryIds.has(id)) err(`constraints.yaml ${c.id}`, `unknown category "${id}"`);
    }
    if (Object.keys(c.when).length === 0) {
      err(`constraints.yaml ${c.id}`, 'has an empty `when` and would fire on every garment');
    }
  }

  /* 5. No health, safety or chemical claims anywhere a user can see. */
  for (const { where, text } of collectProse(kb)) {
    for (const { pattern, why } of BANNED_CLAIMS) {
      const m = pattern.exec(text);
      if (m) err(where, `contains "${m[0]}" — ${why}. See guardrails in README.`);
    }
  }

  /* 6. The scales in blending.yaml must match the ones the code validates. */
  const expectedScales: Record<string, readonly string[]> = {
    odour_retention: ['very_low', 'low', 'moderate', 'high', 'very_high'],
    shed_class: ['low', 'moderate', 'high', 'very_high'],
    agitation_tolerance: ['very_low', 'low', 'moderate', 'high'],
    wet_strength: ['very_low', 'low', 'moderate', 'high'],
  };
  for (const [name, expected] of Object.entries(expectedScales)) {
    const actual = kb.blending.scales[name];
    if (!actual || actual.join(',') !== expected.join(',')) {
      err('blending.yaml', `scale "${name}" disagrees with the schema in src/knowledge/schema.ts`);
    }
  }

  return findings;
}

export type ProvenanceReport = {
  readonly fibres_total: number;
  readonly fibres_expert_reviewed: number;
  readonly claims_total: number;
  readonly claims_engineer_inference_only: number;
};

/**
 * How much of the knowledge base rests on a non-specialist's reading of public
 * guidance. Printed by `pnpm evals`, and stated in the README, because the
 * honest number is the thing that makes the review ask concrete.
 */
export function provenanceReport(kb: KnowledgeBase): ProvenanceReport {
  let expert = 0;
  for (const f of kb.fibres.values()) {
    if (f.provenance.authored_by === 'expert_reviewed') expert++;
  }
  const refs = collectSourceRefs(kb);
  let inferenceOnly = 0;
  for (const { ids } of refs) {
    const kinds = ids.map((id) => kb.sources.get(id)?.kind);
    if (kinds.every((k) => k === 'engineer_inference')) inferenceOnly++;
  }
  return {
    fibres_total: kb.fibres.size,
    fibres_expert_reviewed: expert,
    claims_total: refs.length,
    claims_engineer_inference_only: inferenceOnly,
  };
}
