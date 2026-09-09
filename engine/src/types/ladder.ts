/**
 * Engine vocabulary.
 *
 * The SET of actions is code, because the engine branches on it. The ORDER of
 * actions is data, and lives in knowledge/ladder.yaml, because the order is a
 * textiles judgement and should be correctable without touching TypeScript.
 * The loader asserts that the two agree.
 */

export const CARE_ACTIONS = [
  'wear_again',
  'air_out',
  'brush',
  'steam',
  'spot_clean',
  'refresh_spray',
  'hand_wash_cold',
  'machine_wash_cold_delicate',
  'machine_wash_cold',
  'machine_wash_warm',
  'professional_wet_clean',
  'dry_clean',
] as const;

export type CareAction = (typeof CARE_ACTIONS)[number];

export const DRYING_ACTIONS = [
  'air_only',
  'flat_dry_shade',
  'flat_dry',
  'line_dry_shade',
  'line_dry',
  'tumble_low',
  'tumble_normal',
] as const;

export type DryingAction = (typeof DRYING_ACTIONS)[number];

/**
 * Things a constraint can forbid that are not themselves rungs on the ladder.
 * "Never tumble dry this" is not an alternative to washing, it is a limit on
 * how you may do anything.
 */
export const CARE_PARAMS = [
  'tumble_dry',
  'bleach',
  'wring',
  'direct_sun',
  'hot_water',
  'hang_wet',
  'fabric_softener',
] as const;

export type CareParam = (typeof CARE_PARAMS)[number];

export type LadderSegment = 'domestic' | 'professional';

export type ProfessionalRoute = 'none' | 'wet_clean' | 'dry_clean';

/** Position on the gentleness ladder. Lower is gentler. */
export type Rung = number;
