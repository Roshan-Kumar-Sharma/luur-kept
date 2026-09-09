import type { CareAction, CareParam, DryingAction, ProfessionalRoute, Rung } from './ladder.js';

/**
 * The rule vocabulary.
 *
 * Read the variants and notice what is missing: there is no `raise_ceiling`,
 * no `permit`, no `allow`, no `override`. Every operation available to a rule
 * tightens the decision. That is the first half of the guarantee that no rule
 * can recommend above the care ceiling — not a convention the engine follows,
 * but a sentence the rule language cannot say.
 *
 * The second half is in src/engine/select.ts, where the ceiling is folded with
 * min() through a single function with a single branch.
 */
export type RuleEffect =
  /** Lowers the care ceiling. Folded with min(); never raises it. */
  | { readonly kind: 'ceiling'; readonly max: CareAction }
  /** Raises the need floor — the minimum intervention that deals with the soil. */
  | { readonly kind: 'need'; readonly floor: CareAction }
  /**
   * The lowest intervention that still genuinely deals with the soil, used only
   * when the preferred floor sits above what the garment can safely take. A
   * sweaty silk blouse cannot go in the machine, and the answer to that is a
   * cold hand wash, not the dry cleaner.
   */
  | { readonly kind: 'need_min'; readonly floor: CareAction }
  /** Removes one action from the candidate set. Nothing puts it back. */
  | { readonly kind: 'forbid'; readonly action: CareAction }
  /** Forbids a way of doing things, rather than a rung. */
  | { readonly kind: 'forbid_param'; readonly param: CareParam }
  /** Something that must happen before the primary action. */
  | { readonly kind: 'require_first'; readonly action: CareAction }
  /** Opens the professional escalation route. Does not by itself select it. */
  | { readonly kind: 'professional'; readonly route: Exclude<ProfessionalRoute, 'none'> }
  /** Adjusts the shedding estimate. Advisory output only; touches no decision. */
  | { readonly kind: 'shed_shift'; readonly steps: number }
  /** Something the engine could not determine. Always widens `unknowns`. */
  | { readonly kind: 'unknown'; readonly note: string };

export type RuleLayer =
  | 'fibre'
  | 'blend'
  | 'construction'
  | 'finish'
  | 'category'
  | 'soil'
  | 'need'
  | 'constraint';

export type SourceKind =
  | 'peer_reviewed'
  | 'standards_body'
  | 'industry'
  | 'engineer_inference';

export type SourceRef = {
  readonly id: string;
  readonly title: string;
  readonly url: string | null;
  readonly kind: SourceKind;
};

/**
 * One rule firing. This is the unit of explanation, and the reason a domain
 * expert can correct the engine rather than merely disagree with it.
 */
export type RuleHit = {
  readonly rule_id: string;
  readonly layer: RuleLayer;
  readonly effect: RuleEffect;
  /** Authored prose from YAML. Never generated. */
  readonly because: string;
  readonly sources: readonly SourceRef[];
  /** Which input fields the rule read. Used to check explanation faithfulness. */
  readonly inputs: readonly string[];
};

/** An entry on the never-do list. */
export type Constraint = {
  readonly rule_id: string;
  /** Short imperative, e.g. "Don't tumble dry it." */
  readonly never_do: string;
  readonly because: string;
  readonly sources: readonly SourceRef[];
};

export type ShedClass = 'low' | 'moderate' | 'high' | 'very_high';

export type ImpactEstimate = {
  readonly relative_shedding: ShedClass;
  readonly energy_note: string;
  readonly wears_extended_estimate?: number;
  /** How the shedding figure was arrived at. Shown, not hidden. */
  readonly method: string;
};

export type ProductRecommendation = {
  readonly sku: string;
  readonly name: string;
  readonly line: string;
  readonly why: string;
};

/**
 * The care ceiling for one garment: the highest DOMESTIC rung it tolerates.
 *
 * Professional cleaning is not "above" this — it is off this axis entirely.
 * A structured wool blazer has a ceiling of spot_clean and dry cleaning is
 * still the correct answer when it genuinely needs cleaning. Conflating the
 * two would make the headline metric punish the right answer.
 */
export type CareCeiling = {
  readonly action: CareAction;
  readonly rung: Rung;
  /** Every rule that lowered it, in the order they applied. */
  readonly set_by: readonly RuleHit[];
};

export type NeedFloor = {
  readonly action: CareAction;
  readonly rung: Rung;
  readonly set_by: readonly RuleHit[];
};

export type CareDecision = {
  readonly primary: CareAction;
  readonly alternatives: readonly CareAction[];
  readonly confidence: number;
  readonly reasoning: readonly RuleHit[];
  readonly never_do: readonly Constraint[];
  readonly drying: DryingAction;
  readonly impact_estimate: ImpactEstimate;
  readonly product?: ProductRecommendation;
  readonly unknowns: readonly string[];
  /** Must happen before `primary` — spot-treating a stain, typically. */
  readonly do_first: readonly CareAction[];
  /** Exposed so the eval harness can check the clamp held. */
  readonly ceiling: CareCeiling;
  readonly need: NeedFloor;
  /** True when the need exceeded what domestic care can safely deliver. */
  readonly escalated: boolean;
};
