import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Load the repository's .env, if there is one.
 *
 * Walks up from this module the same way the knowledge loader does, so it works
 * under tsx, under vitest and from dist without anyone maintaining a relative
 * path that is wrong in two of the three. Uses Node's own loader rather than a
 * dependency — this reads one variable.
 */
let loaded = false;

export function loadEnvOnce(): void {
  if (loaded) return;
  loaded = true;

  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) {
      try {
        process.loadEnvFile(candidate);
      } catch {
        // A malformed .env is not a reason to fail a decision. The explainer
        // falls back to the deterministic renderer, which needs no key at all.
      }
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}
