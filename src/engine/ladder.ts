import type { CareAction, DryingAction, Rung } from '../types/ladder.js';
import type { LadderFile } from '../knowledge/schema.js';

/**
 * Pure helpers over the gentleness ladder.
 *
 * Every comparison the engine makes about "gentler" or "more aggressive" goes
 * through here, and every one of them reads the order out of YAML. The engine
 * holds no opinion of its own about what is gentle.
 */

export function domesticRung(ladder: LadderFile, action: CareAction): Rung | null {
  const i = ladder.segments.domestic.indexOf(action);
  return i === -1 ? null : i;
}

export function isDomestic(ladder: LadderFile, action: CareAction): boolean {
  return ladder.segments.domestic.includes(action);
}

export function isProfessional(ladder: LadderFile, action: CareAction): boolean {
  return ladder.segments.professional.includes(action);
}

/** The rung a garment with no constraints at all would sit at. */
export function topOfDomestic(ladder: LadderFile): CareAction {
  const top = ladder.segments.domestic.at(-1);
  if (!top) throw new Error('ladder.yaml has an empty domestic segment');
  return top;
}

export function gentlestDomestic(ladder: LadderFile): CareAction {
  const first = ladder.segments.domestic[0];
  if (!first) throw new Error('ladder.yaml has an empty domestic segment');
  return first;
}

export function requireDomesticRung(ladder: LadderFile, action: CareAction): Rung {
  const r = domesticRung(ladder, action);
  if (r === null) {
    throw new Error(
      `"${action}" is not on the domestic segment, so it has no rung. ` +
        'Professional cleaning is a separate axis, not a higher rung.',
    );
  }
  return r;
}

export function actionLabel(ladder: LadderFile, action: CareAction): string {
  return ladder.actions[action]?.label ?? action;
}

export function actionSummary(ladder: LadderFile, action: CareAction): string {
  return ladder.actions[action]?.summary ?? '';
}

/** Gentlest first, per drying.order in YAML. */
export function gentlestDrying(
  ladder: LadderFile,
  permitted: readonly DryingAction[],
): DryingAction | null {
  for (const d of ladder.drying.order) {
    if (permitted.includes(d)) return d;
  }
  return null;
}

export function dryingLabel(ladder: LadderFile, action: DryingAction): string {
  return ladder.drying.actions[action]?.label ?? action;
}
