'use server';

import { decide, explain, loadKnowledge } from 'kept';
import type { CareDecision, Explanation } from 'kept';
import { GarmentSchema, SituationSchema, type SoilType } from 'kept';

/**
 * The knowledge base is read once per server process. It is a few dozen small
 * YAML files and the engine is pure, so a decision is a function call — there
 * is no database here and Sprint A does not need one.
 */
const kb = loadKnowledge();

export type DecideResult =
  | { ok: true; decision: CareDecision; explanation: Explanation; labels: Record<string, string> }
  | { ok: false; error: string };

export async function runDecision(formData: FormData): Promise<DecideResult> {
  try {
    const fibres = [
      { fibre: String(formData.get('fibre1')), pct: Number(formData.get('pct1')) },
      ...(formData.get('fibre2') && String(formData.get('fibre2')) !== ''
        ? [{ fibre: String(formData.get('fibre2')), pct: Number(formData.get('pct2') ?? 0) }]
        : []),
    ];

    const colour = String(formData.get('colour_depth') ?? '');
    const sub = String(formData.get('sub_construction') ?? '');

    const garment = GarmentSchema.parse({
      fibres,
      construction: String(formData.get('construction')),
      ...(sub ? { sub_construction: sub } : {}),
      category: String(formData.get('category')),
      ...(colour ? { colour_depth: colour } : {}),
      ...(formData.get('structured') ? { structured: true } : {}),
    });

    const soil = formData.getAll('soil').map(String) as SoilType[];
    const activity = String(formData.get('activity') ?? '');

    const situation = SituationSchema.parse({
      wears_since_wash: Number(formData.get('wears') ?? 0),
      next_to_skin: Boolean(formData.get('next_to_skin')),
      soil: soil.length > 0 ? soil : ['none'],
      ...(activity ? { activity } : {}),
    });

    const decision = decide(kb, garment, situation);

    const labels: Record<string, string> = {};
    for (const [id, action] of Object.entries(kb.ladder.actions)) {
      if (action) labels[id] = action.label;
    }
    for (const [id, action] of Object.entries(kb.ladder.drying.actions)) {
      if (action) labels[id] = action.label;
    }

    return { ok: true, decision, explanation: explain(kb, decision), labels };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function vocabulary() {
  return {
    fibres: [...kb.fibres.values()]
      .map((f) => ({ id: f.id, label: f.display_name }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    constructions: Object.entries(kb.constructions.constructions).map(([id, m]) => ({
      id,
      label: m.label,
    })),
    subConstructions: Object.entries(kb.constructions.sub_constructions).map(([id, m]) => ({
      id,
      label: m.label,
    })),
    categories: Object.entries(kb.categories).map(([id, c]) => ({ id, label: c.label })),
    soils: Object.entries(kb.soils.soils)
      .filter(([, s]) => s !== undefined)
      .map(([id, s]) => ({ id, label: s?.label ?? id })),
  };
}
