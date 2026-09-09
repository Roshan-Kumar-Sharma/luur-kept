/**
 * Ordinal arithmetic.
 *
 * The scales themselves live in knowledge/blending.yaml so a reviewer can see
 * the whole vocabulary in one place; these are the operations over them.
 */

export function scaleIndex(scale: readonly string[], value: string): number {
  const i = scale.indexOf(value);
  if (i === -1) throw new Error(`"${value}" is not on the scale [${scale.join(', ')}]`);
  return i;
}

export function clampToScale(scale: readonly string[], index: number): string {
  const clamped = Math.max(0, Math.min(scale.length - 1, Math.round(index)));
  const value = scale[clamped];
  if (value === undefined) throw new Error('empty scale');
  return value;
}

/** Percentage-weighted mean position on an ordinal scale. */
export function weightedOrdinal(
  scale: readonly string[],
  entries: readonly { value: string; weight: number }[],
): string {
  const total = entries.reduce((s, e) => s + e.weight, 0);
  if (total <= 0) throw new Error('weights must sum to more than zero');
  const mean =
    entries.reduce((s, e) => s + scaleIndex(scale, e.value) * e.weight, 0) / total;
  return clampToScale(scale, mean);
}

/** The most cautious value present, per blending.yaml's worst_end. */
export function worstOrdinal(
  scale: readonly string[],
  worstEnd: 'low' | 'high',
  values: readonly string[],
): string {
  if (values.length === 0) throw new Error('no values to compare');
  const indices = values.map((v) => scaleIndex(scale, v));
  const pick = worstEnd === 'high' ? Math.max(...indices) : Math.min(...indices);
  return clampToScale(scale, pick);
}

export function shiftOrdinal(scale: readonly string[], value: string, steps: number): string {
  return clampToScale(scale, scaleIndex(scale, value) + steps);
}
