/**
 * Layering rules.
 *
 * The design rule that governs this whole codebase is "rules decide, the model
 * only reads and explains." That is a claim about the dependency graph, so the
 * build checks it rather than trusting reviewers to notice.
 */
module.exports = {
  forbidden: [
    {
      name: 'engine-never-imports-the-model',
      comment:
        'src/engine must not import src/explain/llm or any SDK. The engine selects the ' +
        'care action deterministically; a language model may read its output and phrase ' +
        'it, and may never influence it. If this rule fires, the moat has a hole in it.',
      severity: 'error',
      from: { path: '^src/engine' },
      to: { path: '^(src/explain/llm|src/cli|src/knowledge/lint)' },
    },
    {
      name: 'engine-is-io-free',
      comment:
        'src/engine must be pure. No filesystem, no network, no clock. Knowledge is ' +
        'loaded by src/knowledge and passed in as an argument, which is what makes the ' +
        'engine unit-testable and the property tests possible.',
      severity: 'error',
      from: { path: '^src/engine' },
      to: { path: 'node_modules/(fs|path|os|child_process|https?)$', dependencyTypes: ['core'] },
    },
    {
      name: 'engine-does-no-io-core',
      severity: 'error',
      from: { path: '^src/engine' },
      to: { dependencyTypes: ['core'], path: '^(fs|node:fs|path|node:path|http|https|child_process)' },
    },
    {
      name: 'types-depend-on-nothing',
      comment: 'src/types is the vocabulary. It must stay a leaf.',
      severity: 'error',
      from: { path: '^src/types' },
      to: { path: '^src/(engine|knowledge|explain|cli)' },
    },
    {
      name: 'explainer-never-decides',
      comment:
        'src/explain may read a CareDecision but must not import the engine internals ' +
        'that produce one. Phrasing is downstream of deciding, never beside it.',
      severity: 'error',
      from: { path: '^src/explain' },
      to: { path: '^src/engine/(select|need|profile)' },
    },
    { name: 'no-circular', severity: 'error', from: {}, to: { circular: true } },
    { name: 'no-orphans', severity: 'warn', from: { orphan: true, pathNot: ['\\.d\\.ts$'] }, to: {} },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
  },
};
