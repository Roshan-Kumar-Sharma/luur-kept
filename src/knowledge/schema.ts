import { z } from 'zod';
import { CARE_ACTIONS, CARE_PARAMS, DRYING_ACTIONS } from '../types/ladder.js';
import { SOIL_TYPES } from '../types/garment.js';

const careAction = z.enum(CARE_ACTIONS);
const dryingAction = z.enum(DRYING_ACTIONS);
const careParam = z.enum(CARE_PARAMS);
const sourceIds = z.array(z.string().min(1)).min(1);

export const odourRetention = z.enum(['very_low', 'low', 'moderate', 'high', 'very_high']);
export const shedClass = z.enum(['low', 'moderate', 'high', 'very_high']);
export const agitationTolerance = z.enum(['very_low', 'low', 'moderate', 'high']);
export const riskScale = z.enum(['none', 'low', 'moderate', 'high']);
export const affinityScale = z.enum(['low', 'moderate', 'high']);
export const wetStrength = z.enum(['very_low', 'low', 'moderate', 'high']);
export const sunSensitivity = z.enum(['low', 'moderate', 'high']);

/* ── sources.yaml ─────────────────────────────────────────────────────── */

export const SourcesFileSchema = z.object({
  sources: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1),
        url: z.string().url().nullable(),
        kind: z.enum(['peer_reviewed', 'standards_body', 'industry', 'engineer_inference']),
        accessed: z.string().min(1),
        note: z.string().optional(),
      }),
    )
    .min(1),
});

/* ── ladder.yaml ──────────────────────────────────────────────────────── */

export const LadderFileSchema = z.object({
  segments: z.object({
    domestic: z.array(careAction).min(1),
    professional: z.array(careAction).min(1),
  }),
  actions: z.record(
    careAction,
    z.object({
      label: z.string().min(1),
      summary: z.string().min(1),
      wet_process: z.boolean(),
      agitation: z.enum(['none', 'low', 'moderate', 'high']),
      heat: z.enum(['none', 'moderate', 'high']),
    }),
  ),
  drying: z.object({
    actions: z.record(
      dryingAction,
      z.object({ label: z.string().min(1), summary: z.string().min(1) }),
    ),
    order: z.array(dryingAction).min(1),
  }),
});

/* ── knowledge/fibres/*.yaml ──────────────────────────────────────────── */

export const FibreFileSchema = z.object({
  id: z.string().min(1),
  display_name: z.string().min(1),
  class: z.enum(['protein', 'cellulosic', 'regenerated', 'synthetic', 'other']),
  properties: z.object({
    max_safe_temp_c: z.number().min(0).max(95),
    agitation_tolerance: agitationTolerance,
    shrink_risk: riskScale,
    dye_bleed_risk: riskScale,
    odour_retention: odourRetention,
    pilling_risk: riskScale,
    permitted_drying: z.array(dryingAction).min(1),
    shed_class: shedClass,
    biological_soil_affinity: affinityScale,
    wet_strength: wetStrength,
    sun_sensitivity: sunSensitivity,
  }),
  ceiling: careAction,
  professional_route: z.enum(['none', 'wet_clean', 'dry_clean']),
  wears_per_wash_baseline: z.number().positive(),
  minor_component_still_governs: z.boolean().optional(),
  unknowns: z
    .array(z.object({ id: z.string(), ask: z.string(), note: z.string().optional() }))
    .optional(),
  rationale: z.record(z.string(), z.string().min(1)),
  sources: z.record(z.string(), sourceIds),
  provenance: z.object({
    authored_by: z.enum(['engineer', 'expert_reviewed']),
    reviewed_by: z.string().nullable(),
    confidence: z.enum(['low', 'medium', 'high']),
  }),
});

/* ── constructions.yaml ───────────────────────────────────────────────── */

const modifier = z.object({
  label: z.string().min(1),
  shed_shift: z.number().int().optional(),
  pilling_shift: z.number().int().optional(),
  wears_multiplier: z.number().positive().optional(),
  ceiling: careAction.optional(),
  professional_route: z.enum(['wet_clean', 'dry_clean']).optional(),
  forbid_params: z.array(careParam).optional(),
  rationale: z.string().min(1),
  sources: sourceIds,
});

export const ConstructionsFileSchema = z.object({
  constructions: z.record(z.string(), modifier),
  sub_constructions: z.record(z.string(), modifier),
  finishes: z.record(z.string(), modifier),
});

/* ── categories.yaml ──────────────────────────────────────────────────── */

export const CategoriesFileSchema = z.object({
  categories: z.record(
    z.string(),
    z.object({
      label: z.string().min(1),
      wears_multiplier: z.number().positive(),
      typically_next_to_skin: z.boolean(),
      typically_structured: z.boolean().optional(),
      min_need_after_wears: z
        .object({ wears: z.number().int().min(0), floor: careAction })
        .optional(),
      rationale: z.string().min(1),
      sources: sourceIds,
    }),
  ),
});

/* ── soils.yaml ───────────────────────────────────────────────────────── */

export const SoilsFileSchema = z.object({
  soils: z.record(
    z.enum(SOIL_TYPES),
    z
      .object({
        label: z.string().min(1),
        need_floor: careAction.optional(),
        need_floor_when_unworn: careAction.optional(),
        rationale_when_unworn: z.string().min(1).optional(),
        need_floor_min: careAction.optional(),
        rationale_min: z.string().min(1).optional(),
        need_floor_by_odour_retention: z.record(odourRetention, careAction).optional(),
        require_first: careAction.optional(),
        forbid_params: z.array(careParam).optional(),
        rationale: z.string().min(1),
        sources: sourceIds,
      })
      .refine((s) => s.need_floor !== undefined || s.need_floor_by_odour_retention !== undefined, {
        message: 'a soil must define need_floor or need_floor_by_odour_retention',
      }),
  ),
  wear_budget_modifiers: z.object({
    next_to_skin: z.object({
      multiplier: z.number().positive(),
      rationale: z.string(),
      sources: sourceIds,
    }),
    activity: z
      .object({
        sedentary: z.object({ multiplier: z.number().positive() }),
        active: z.object({ multiplier: z.number().positive() }),
        workout: z.object({ multiplier: z.number().positive() }),
        rationale: z.string(),
        sources: sourceIds,
      }),
    ambient: z.object({
      cold: z.object({ multiplier: z.number().positive() }),
      temperate: z.object({ multiplier: z.number().positive() }),
      hot_humid: z.object({ multiplier: z.number().positive() }),
      rationale: z.string(),
      sources: sourceIds,
    }),
    odour_phrases: z.record(odourRetention, z.string().min(1)),
    within: z.object({ rationale: z.string().min(1), sources: sourceIds }),
    exceeded: z.object({ rationale: z.string().min(1), sources: sourceIds }),
  }),
});

/* ── blending.yaml ────────────────────────────────────────────────────── */

export const BlendingFileSchema = z.object({
  safety: z.object({
    aggregation: z.literal('worst_case'),
    min_pct_threshold: z.number().min(0),
    fields: z.array(z.string()).min(1),
    rationale: z.string(),
    sources: sourceIds,
  }),
  behaviour: z.object({
    aggregation: z.literal('percentage_weighted'),
    fields: z.array(z.string()).min(1),
    dominant_override: z.object({
      min_pct: z.number().min(0).max(100),
      applies_to: z.array(z.string()).min(1),
      direction: z.literal('worst_case'),
      rationale: z.string(),
      sources: sourceIds,
    }),
    rationale: z.string(),
    sources: sourceIds,
  }),
  scales: z.record(z.string(), z.array(z.string()).min(2)),
  worst_end: z.record(z.string(), z.enum(['low', 'high'])),
});

/* ── constraints.yaml ─────────────────────────────────────────────────── */

export const ConstraintEffectSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ceiling'), max: careAction }),
  z.object({ kind: z.literal('need'), floor: careAction }),
  z.object({ kind: z.literal('forbid'), action: careAction }),
  z.object({ kind: z.literal('forbid_param'), param: careParam }),
  z.object({ kind: z.literal('require_first'), action: careAction }),
  z.object({ kind: z.literal('professional'), route: z.enum(['wet_clean', 'dry_clean']) }),
  z.object({ kind: z.literal('unknown'), note: z.string().min(1) }),
]);

export const ConstraintsFileSchema = z.object({
  constraints: z
    .array(
      z.object({
        id: z.string().min(1),
        when: z.object({
          any_fibre: z.array(z.string()).optional(),
          any_fibre_class: z
            .array(z.enum(['protein', 'cellulosic', 'regenerated', 'synthetic', 'other']))
            .optional(),
          any_fibre_min_pct: z.object({ fibre: z.string(), pct: z.number() }).optional(),
          category: z.array(z.string()).optional(),
          construction: z.array(z.string()).optional(),
          finish_any: z.array(z.string()).optional(),
          colour_depth: z.array(z.enum(['white', 'light', 'mid', 'dark'])).optional(),
          soil_any: z.array(z.enum(SOIL_TYPES)).optional(),
          structured: z.boolean().optional(),
          wet_strength_at_most: z.array(wetStrength).optional(),
        }),
        effects: z.array(ConstraintEffectSchema).min(1),
        never_do: z.string().min(1),
        because: z.string().min(1),
        sources: sourceIds,
      }),
    )
    .min(1),
});

export type SourcesFile = z.infer<typeof SourcesFileSchema>;
export type LadderFile = z.infer<typeof LadderFileSchema>;
export type FibreFile = z.infer<typeof FibreFileSchema>;
export type ConstructionsFile = z.infer<typeof ConstructionsFileSchema>;
export type CategoriesFile = z.infer<typeof CategoriesFileSchema>;
export type SoilsFile = z.infer<typeof SoilsFileSchema>;
export type BlendingFile = z.infer<typeof BlendingFileSchema>;
export type ConstraintsFile = z.infer<typeof ConstraintsFileSchema>;
export type ConstraintDef = ConstraintsFile['constraints'][number];
export type Modifier = z.infer<typeof modifier>;
