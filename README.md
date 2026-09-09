# Kept

**A care decision engine for clothes.** Should you wash it — or is there a better answer?

```
$ kept decide --fibres merino:100 --category knitwear --wears 3 --soil none

AIR IT OUT

Hang it somewhere with moving air for a few hours. Not in a pile, not in the wardrobe.

WHY
  · Worn 3 times since the last wash, against about 11 for this garment in this
    situation — it barely holds odour at all. No wash is indicated yet.
  · Ambient dust and a day's wear. Moving air deals with it.
  · Treated as untreated wool by default. Fine merino felts as readily as coarser
    wool, and the treatment status is not visible in the garment.

NEVER
  ✗ Don't tumble dry it. Heat and tumbling together are exactly the conditions
    that felt wool, and felting cannot be reversed.
  ✗ Never use bleach on it. Chlorine bleach dissolves protein fibre.
  ✗ Don't wring it out, and don't hang it up wet.

Confidence 0.83. Ceiling for this garment: Hand wash, cold.
```

---

## The headline metric is not accuracy

**It is `damage_avoidance_recall`: the proportion of decisions that never
recommended a treatment more aggressive than the garment can safely take.**

Getting care advice wrong is not symmetric.

| Error | Cost |
|---|---|
| Too aggressive — hot-wash the cashmere | **Irreversible. The garment is destroyed.** |
| Too gentle — air it when a wash was needed | One extra cycle. Trivial. |

So the target is 100%, any miss is a P0, and **CI fails on any drop.** No other
metric is allowed to trade against it. Current figures, over 45 labelled
decisions:

```
damage_avoidance_recall   100.0%   ← the one that matters
over_wash_rate              3.7%   ← "wash less", made measurable
decision_accuracy          86.7%
within_one_step           100.0%
explanation_faithfulness  100.0%
```

**Read [`evals/golden/PROVENANCE.md`](evals/golden/PROVENANCE.md) before quoting
any of those.** The same person wrote the rules and the labels, which makes
`decision_accuracy` a regression detector rather than evidence of correctness.

---

## Why this and not a label scanner

A care label is the manufacturer's **liability floor**, not care advice. "Dry
clean only" is routinely defensive over-caution — it says what won't get the
brand sued, not what to do with the garment in front of you today.

Six or more apps already read care symbols at 96%+ accuracy, free. All of them
stop at *symbol → meaning*. None answer the question people actually have:

> *I've worn this merino jumper three times. It doesn't smell. Do I wash it?*

That's a **decision** — dependent on fibre, construction, what kind of soil is
actually present, wear count and skin contact. Kept is the decision engine. The
label is an input, not the output.

---

## The rule that governs the whole codebase

**Rules decide. The model only reads and explains.**

A language model has exactly two jobs here: rephrasing reasoning that already
exists, and (in Sprint B) reading a composition off a label photograph. It never
selects a care action. That makes the engine testable, auditable, cheap and
safe.

That is a claim about the dependency graph, so **the build checks it** rather
than trusting reviewers to notice:

```
$ pnpm lint:layers
  error engine-never-imports-the-model: src/engine/select.ts → src/explain/llm.ts
```

---

## How the ceiling holds

```
Garment + Situation
   → Profile     fibre matrix + construction → the care CEILING for this garment
   → Need        soil + wears + odour_retention → is a wash even required?
   → Decision    deterministic rules, clamped to the ceiling
   → Explainer   phrases the rules that fired; it does not decide
   → CareDecision
```

Two things make "no rule can recommend above the ceiling" true by construction
rather than by convention:

1. **The rule vocabulary cannot say it.** `RuleEffect` in
   [`src/types/decision.ts`](src/types/decision.ts) has no `raise_ceiling`, no
   `permit`, no `override`. Every operation available to a rule tightens.
2. **The ceiling is folded in one function with one branch, taking `min()`.** It
   starts at the top of the domestic segment and only descends. The need floor
   folds the other way with `max()`. Neither fold can see the other.

Selection is then *the gentlest candidate that still meets the need*, which is
also what keeps `over_wash_rate` down: airing sorts before washing, so the
engine cannot recommend a wash when airing would do.

[`test/invariants.test.ts`](test/invariants.test.ts) proves this over thousands
of generated garments, not just the golden set — including that adding a fibre
can only ever lower the ceiling, which is the "five per cent elastane governs
the whole garment" case stated as a law.

### Domestic and professional are different axes

The ladder has two segments. The ceiling hard-clamps the ten **domestic** rungs.
`professional_wet_clean` and `dry_clean` are not "more aggressive than a warm
machine wash" — they are reached only by explicit escalation, when what a garment
needs is more than can safely be done to it at home. A structured wool blazer has
a ceiling of `spot_clean` and dry cleaning is still the right answer for it.
Collapsing the two would make the headline metric punish the correct answer.

---

## The knowledge base is the product

Four authored layers in [`knowledge/`](knowledge/), all YAML, all cited, all
editable by someone who has never opened a terminal. See
[`knowledge/README.md`](knowledge/README.md) — it is written for the reviewer,
not the developer.

| | Layer | The interesting part |
|---|---|---|
| 1 | **Fibre matrix**, 15 fibres | `odour_retention` — merino is `very_low`, polyester `very_high`, and that single field is why the engine airs one and washes the other in identical situations |
| 2 | **Construction modifiers** | Grounded in published microfibre research: knits shed more than wovens, satin most and plain least, mechanically-treated polyester ~6× woven filament nylon |
| 3 | **Soil model** | What needs removing determines the intervention. Body odour in wool lifts with a refresh; in polyester it does not, and no amount of airing changes that |
| 4 | **Hard constraints** | The never-do list. Each one cited, each one absolute |

### The honest position on the rules

**0 of 15 fibres are expert-reviewed. 88 of 109 claims cite nothing stronger
than a non-specialist's reading of public care guidance.** Those numbers are
printed by `pnpm evals` on every run, so they cannot quietly stop being true.

This is the weakest part of the project and it is deliberately the most visible.
The engine is built so that someone who has actually spent a career on materials
can correct it directly — every recommendation names the rules that produced it,
and every rule is a line of YAML with a `provenance` block waiting for a name.

---

## Quickstart

```bash
pnpm install
pnpm kept decide --fibres merino:100 --category knitwear --wears 3 --soil none
```

```bash
pnpm check
```

Runs types, layering, the knowledge lint, the tests and the eval gate.

| Command | What it does |
|---|---|
| `pnpm kept decide …` | One decision, rendered |
| `pnpm kept decide … --json` | The full `CareDecision` |
| `pnpm kept fibres` | The matrix, and which entries are reviewed |
| `pnpm lint:knowledge` | Citations, vocabulary, out-of-scope claims |
| `pnpm evals` | The golden set and the metrics above |
| `pnpm --filter kept-web dev` | The one-screen web app |

No API key is needed for any of it. The explainer is deterministic by default;
the model path in [`src/explain/llm.ts`](src/explain/llm.ts) is opt-in, and its
output is checked against the rules that fired before it is shown — an
unsupported claim, an invented number or an out-of-scope assertion sends the
whole thing back to the deterministic renderer.

---

## Honest limitations

- **The fibre matrix is unreviewed.** See above. This is the headline caveat.
- **The golden set is 15 synthetic garments, not 40 real ones.** Sprint A's
  target is 40 photographed from real wardrobes with compositions read off
  actual labels. None of those exist yet.
- **`decision_accuracy` measures self-consistency**, because the rules and the
  labels share an author.
- **Shedding figures are relative rankings, not measurements**, and they count
  fibre released rather than microplastic released — cotton and wool shed
  heavily too, and those fibres are not persistent the way synthetics are.
- **The model explainer has never run against the live API** in this repository.
  It is covered by tests with a stubbed client, including its fallback paths.
- **No label scanning.** Deliberately deferred to Sprint B; the decision engine
  is the differentiator and the vision half is the commodity.

---

## Guardrails

- **Care symbols are described in words.** GINETEX symbol artwork is
  trademark-protected and is not reproduced anywhere in this repository. Only
  the semantics are encoded.
- **ISO 3758:2023 is a paid standard.** None of its text appears here. The
  public GINETEX guide is the working source where symbol semantics are needed.
- **No health, safety or chemical claims.** No "antibacterial", no "kills", no
  allergen advice. `pnpm lint:knowledge` scans every user-visible string and
  fails the build on one.
- **Advisory only, conservative by design.** When in doubt, follow the garment's
  own label. This is stated in the CLI output and in the app.
- **No image retention.** When label photographs arrive in Sprint B, they will be
  extracted and deleted, and the interface will say so.

---

## Status

Sprint A is complete: the knowledge base, the engine, the explainer, the CLI,
the web app, the golden set and the CI gate.

Sprint B: vision extraction of composition and care symbols from a label
photograph, brand config YAML with SKU mapping, a shareable result page, and the
golden set expanded with real garments.

## Licence

Apache-2.0.
