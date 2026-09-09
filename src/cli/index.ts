#!/usr/bin/env node
import { Command } from 'commander';
import { loadKnowledge } from '../knowledge/load.js';
import { lintKnowledge, provenanceReport } from '../knowledge/lint.js';
import { decide } from '../engine/index.js';
import { render } from '../explain/template.js';
import { GarmentSchema, SituationSchema, SOIL_TYPES } from '../types/garment.js';

function parseFibres(input: string): { fibre: string; pct: number }[] {
  return input.split(',').map((part) => {
    const [fibre, pct] = part.split(':');
    if (!fibre || !pct) {
      throw new Error(`could not read "${part}". Expected e.g. cotton:95,elastane:5`);
    }
    const value = Number(pct);
    if (!Number.isFinite(value)) throw new Error(`"${pct}" is not a percentage`);
    return { fibre: fibre.trim(), pct: value };
  });
}

function list(input: string | undefined): string[] | undefined {
  if (!input) return undefined;
  return input.split(',').map((s) => s.trim()).filter(Boolean);
}

const program = new Command();
program
  .name('kept')
  .description('A care decision engine for clothes. Advisory only, conservative by design.')
  .version('0.1.0');

program
  .command('decide')
  .description('Should you wash it, or is there a better answer?')
  .requiredOption('-f, --fibres <list>', 'composition, e.g. "merino:100" or "cotton:95,elastane:5"')
  .requiredOption('-c, --category <id>', 'tee | shirt | jeans | knitwear | outerwear | activewear | underwear | tailoring | dress')
  .option('-k, --construction <id>', 'knit | woven | nonwoven | leather | coated', 'knit')
  .option('-s, --sub-construction <id>', 'jersey | fleece | rib | plain | twill | satin | denim')
  .option('-w, --wears <n>', 'wears since the last wash', '1')
  .option('--soil <list>', `comma-separated: ${SOIL_TYPES.join(' | ')}`, 'none')
  .option('--next-to-skin', 'the garment was worn against skin')
  .option('--activity <id>', 'sedentary | active | workout')
  .option('--ambient <id>', 'cold | temperate | hot_humid')
  .option('--finish <list>', 'brushed | napped | water_repellent | printed | sequinned')
  .option('--colour <id>', 'white | light | mid | dark')
  .option('--structured', 'has interfacing, shoulder pads or a lining')
  .option('--json', 'emit the full CareDecision as JSON')
  .action((opts) => {
    const kb = loadKnowledge();

    const garment = GarmentSchema.parse({
      fibres: parseFibres(opts.fibres),
      construction: opts.construction,
      ...(opts.subConstruction ? { sub_construction: opts.subConstruction } : {}),
      category: opts.category,
      ...(opts.finish ? { finish: list(opts.finish) } : {}),
      ...(opts.colour ? { colour_depth: opts.colour } : {}),
      ...(opts.structured ? { structured: true } : {}),
    });

    const situation = SituationSchema.parse({
      wears_since_wash: Number(opts.wears),
      next_to_skin: Boolean(opts.nextToSkin),
      soil: list(opts.soil) ?? ['none'],
      ...(opts.activity ? { activity: opts.activity } : {}),
      ...(opts.ambient ? { ambient: opts.ambient } : {}),
    });

    const decision = decide(kb, garment, situation);

    if (opts.json) {
      console.log(JSON.stringify(decision, null, 2));
      return;
    }
    console.log(render(kb, decision));
  });

program
  .command('lint')
  .description('Validate the knowledge base: citations, vocabulary, and out-of-scope claims.')
  .action(() => {
    const kb = loadKnowledge();
    const findings = lintKnowledge(kb);
    const errors = findings.filter((f) => f.severity === 'error');

    for (const f of findings) {
      console.log(`${f.severity === 'error' ? '✗' : '!'} ${f.where}: ${f.message}`);
    }

    const report = provenanceReport(kb);
    console.log('');
    console.log(`${report.fibres_total} fibres, ${report.fibres_expert_reviewed} expert-reviewed.`);
    console.log(
      `${report.claims_engineer_inference_only} of ${report.claims_total} claims rest on engineer ` +
        'inference alone and are the ones worth a specialist’s attention first.',
    );

    if (errors.length > 0) {
      console.error(`\n${errors.length} error(s).`);
      process.exitCode = 1;
    } else {
      console.log('\nKnowledge base is valid.');
    }
  });

program
  .command('fibres')
  .description('List the fibres the engine knows about, and how confident it is about each.')
  .action(() => {
    const kb = loadKnowledge();
    const rows = [...kb.fibres.values()].sort((a, b) => a.id.localeCompare(b.id));
    const width = Math.max(...rows.map((r) => r.display_name.length));
    console.log(
      `${'FIBRE'.padEnd(width)}  ${'ODOUR'.padEnd(9)}  ${'SHED'.padEnd(9)}  ${'CEILING'.padEnd(26)}  REVIEWED`,
    );
    for (const f of rows) {
      console.log(
        `${f.display_name.padEnd(width)}  ${f.properties.odour_retention.padEnd(9)}  ` +
          `${f.properties.shed_class.padEnd(9)}  ${f.ceiling.padEnd(26)}  ` +
          `${f.provenance.authored_by === 'expert_reviewed' ? 'yes' : 'no'}`,
      );
    }
  });

program.parse();
