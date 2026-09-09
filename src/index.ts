/** Public API. The web app and any future integration import only from here. */
export { loadKnowledge, defaultKnowledgeDir, type KnowledgeBase } from './knowledge/load.js';
export { lintKnowledge, provenanceReport } from './knowledge/lint.js';
export { decide } from './engine/index.js';
export { explain, render, type Explanation } from './explain/template.js';
export { checkFaithfulness } from './explain/faithfulness.js';
export * from './types/index.js';
