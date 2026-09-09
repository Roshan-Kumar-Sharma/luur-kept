import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import type { ZodType } from 'zod';
import type { SourceKind, SourceRef } from '../types/decision.js';
import {
  BlendingFileSchema,
  CategoriesFileSchema,
  ConstraintsFileSchema,
  ConstructionsFileSchema,
  FibreFileSchema,
  LadderFileSchema,
  SoilsFileSchema,
  SourcesFileSchema,
  type BlendingFile,
  type CategoriesFile,
  type ConstraintsFile,
  type ConstructionsFile,
  type FibreFile,
  type LadderFile,
  type SoilsFile,
} from './schema.js';

export type KnowledgeBase = {
  readonly dir: string;
  readonly sources: ReadonlyMap<string, SourceRef>;
  readonly ladder: LadderFile;
  readonly fibres: ReadonlyMap<string, FibreFile>;
  readonly constructions: ConstructionsFile;
  readonly categories: CategoriesFile['categories'];
  readonly soils: SoilsFile;
  readonly blending: BlendingFile;
  readonly constraints: ConstraintsFile['constraints'];
};

function searchUpward(from: string): string | null {
  let dir = from;
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, 'knowledge');
    if (existsSync(join(candidate, 'ladder.yaml'))) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * Find the knowledge directory.
 *
 * Three roots, in order, because one is not enough:
 *
 *   KEPT_KNOWLEDGE_DIR   an explicit override, for anyone whose layout is none
 *                        of the below.
 *   this module          right under tsx, vitest and dist.
 *   the process cwd      right in a bundled serverless function, where the
 *                        module path resolves inside the bundle rather than
 *                        the repository. Searching only from the module is
 *                        what broke the first Vercel deployment: the YAML was
 *                        present and traced correctly, and the loader still
 *                        could not see it.
 */
export function defaultKnowledgeDir(): string {
  const override = process.env['KEPT_KNOWLEDGE_DIR'];
  if (override) {
    if (existsSync(join(override, 'ladder.yaml'))) return override;
    throw new Error(`KEPT_KNOWLEDGE_DIR is set to "${override}" but has no ladder.yaml`);
  }

  const roots: string[] = [];
  try {
    roots.push(dirname(fileURLToPath(import.meta.url)));
  } catch {
    // import.meta.url is not always meaningful once bundled.
  }
  roots.push(process.cwd());

  for (const root of roots) {
    const found = searchUpward(root);
    if (found) return found;
  }

  throw new Error(
    `could not locate the knowledge/ directory. Searched upward from ` +
      `${roots.map((r) => `"${r}"`).join(' and ')}. Set KEPT_KNOWLEDGE_DIR to point at it.`,
  );
}

function readFile<T>(path: string, schema: ZodType<T>): T {
  const raw = parseYaml(readFileSync(path, 'utf8'));
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`${path} failed validation:\n${detail}`);
  }
  return parsed.data;
}

export function loadKnowledge(dir: string = defaultKnowledgeDir()): KnowledgeBase {
  const root = resolve(dir);

  const sourcesFile = readFile(join(root, 'sources.yaml'), SourcesFileSchema);
  const sources = new Map<string, SourceRef>(
    sourcesFile.sources.map((s) => [
      s.id,
      { id: s.id, title: s.title, url: s.url, kind: s.kind as SourceKind },
    ]),
  );

  const fibreDir = join(root, 'fibres');
  const fibres = new Map<string, FibreFile>();
  for (const file of readdirSync(fibreDir).filter((f) => f.endsWith('.yaml')).sort()) {
    const fibre = readFile(join(fibreDir, file), FibreFileSchema);
    if (fibres.has(fibre.id)) throw new Error(`duplicate fibre id: ${fibre.id}`);
    fibres.set(fibre.id, fibre);
  }

  return {
    dir: root,
    sources,
    ladder: readFile(join(root, 'ladder.yaml'), LadderFileSchema),
    fibres,
    constructions: readFile(join(root, 'constructions.yaml'), ConstructionsFileSchema),
    categories: readFile(join(root, 'categories.yaml'), CategoriesFileSchema).categories,
    soils: readFile(join(root, 'soils.yaml'), SoilsFileSchema),
    blending: readFile(join(root, 'blending.yaml'), BlendingFileSchema),
    constraints: readFile(join(root, 'constraints.yaml'), ConstraintsFileSchema).constraints,
  };
}

/** Resolve source ids to full references. Unknown ids are a load-time error. */
export function resolveSources(kb: KnowledgeBase, ids: readonly string[]): readonly SourceRef[] {
  return ids.map((id) => {
    const found = kb.sources.get(id);
    if (!found) throw new Error(`unknown source id: ${id}`);
    return found;
  });
}
