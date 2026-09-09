import { z } from 'zod';

/**
 * Inputs.
 *
 * Fibre ids, categories, constructions and finishes are deliberately open
 * strings here and validated at runtime against the loaded knowledge base.
 * The engine never branches on them — it looks them up — so adding a sixteenth
 * fibre is a YAML change and nothing else. Soil is a closed union because it is
 * a fixed user-facing vocabulary that the interface has to render.
 */

export const SOIL_TYPES = [
  'none',
  'body_odour',
  'visible_sweat',
  'food_grease',
  'smoke',
  'outdoor_dust',
  'stain',
] as const;

export type SoilType = (typeof SOIL_TYPES)[number];

export const FibreShareSchema = z.object({
  fibre: z.string().min(1),
  pct: z.number().min(0).max(100),
});

export const GarmentSchema = z.object({
  fibres: z.array(FibreShareSchema).min(1),
  construction: z.string().min(1),
  sub_construction: z.string().min(1).optional(),
  category: z.string().min(1),
  finish: z.array(z.string().min(1)).optional(),
  colour_depth: z.enum(['white', 'light', 'mid', 'dark']).optional(),
  structured: z.boolean().optional(),
  age_wears: z.number().int().min(0).optional(),
});

export const SituationSchema = z.object({
  wears_since_wash: z.number().int().min(0),
  next_to_skin: z.boolean(),
  soil: z.array(z.enum(SOIL_TYPES)).min(1),
  stain_location: z.string().optional(),
  activity: z.enum(['sedentary', 'active', 'workout']).optional(),
  ambient: z.enum(['cold', 'temperate', 'hot_humid']).optional(),
});

export type FibreShare = z.infer<typeof FibreShareSchema>;
export type Garment = z.infer<typeof GarmentSchema>;
export type Situation = z.infer<typeof SituationSchema>;
