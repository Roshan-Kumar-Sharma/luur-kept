# How these labels were produced

Read this before quoting any number from `pnpm evals`.

## What is in here

`cases.yaml` holds **15 garments × 3 situations = 45 labelled decisions.**

Every case is tagged `provenance: synthetic_engineer`. That means:

- The garment is a plausible composite, not a specific garment that exists.
- The fibre composition and construction were written by **Roshan, a software
  engineer with no textiles background**, not read off a label.
- The expected action and the safe ceiling were labelled from the same general
  public care guidance that seeded `knowledge/`.

Sprint A's target is 40 garments tagged `field_observed` — photographed from
real wardrobes with composition and construction recorded from the actual
labels. **None of those exist yet.** These 15 are scaffolding so that CI has a
gate from the first commit, and they should be replaced, not added to.

## The circularity, stated plainly

The same person wrote the rules and the labels. So:

- **`decision_accuracy` is close to meaningless right now.** It measures
  whether the engine agrees with its own author. Treat it as a regression
  detector — a change in it means behaviour moved — and not as evidence the
  engine is right.
- **`damage_avoidance_recall` is worth more, but not because of the labels.**
  Each situation carries a `max_safe_action` labelled independently of what the
  engine computes, and the metric compares the recommendation against *that*,
  not against the engine's own ceiling. Comparing against the engine's own
  ceiling would be circular — the property tests in `test/invariants.test.ts`
  already prove that relationship holds for every possible input, so measuring
  it again would prove nothing.
- **`over_wash_rate` is the metric least contaminated by shared authorship,**
  because `wash_required` is a judgement about the garment rather than about
  the engine.

## What would make these numbers mean something

A specialist labelling the situations without seeing the rules. That is the
review this project is built around, and until it happens these figures show
that the engine is *consistent*, not that it is *correct*.

## Deliberate disagreements

Some labels contradict what a brand built on "wash less" would prefer to hear —
a merino jumper that genuinely smells after eight wears next to skin is labelled
as needing a wash, not a refresh. Those cases are in here on purpose. An eval
set that only contains cases the thesis wins is not an eval set.
