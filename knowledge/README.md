# The knowledge base

**This directory is the product.** The TypeScript in `src/` is a machine for
reading these files consistently; the judgement lives here. If you disagree with
something Kept recommends, the fix is almost always a line in this directory,
not a line of code.

It is written to be edited by someone who knows textiles and does not write
software. You need a text editor and nothing else.

---

## The honest starting position

Every fibre file currently says:

```yaml
provenance:
  authored_by: engineer
  reviewed_by: null
  confidence: low          # or medium
```

That is accurate. These numbers were assembled by a software engineer from
publicly available care guidance. **88 of 109 claims cite nothing stronger than
that.** Where a value comes from published research — most of the shedding
figures — the file cites the paper. Where it doesn't, it says `engineer-inference`,
which means: a reasonable guess that has never been checked by anyone who would
know.

Running `pnpm evals` prints that ratio every time, so it cannot quietly stop
being true.

When you correct an entry, change its provenance block:

```yaml
provenance:
  authored_by: expert_reviewed
  reviewed_by: "Karen Martin"
  confidence: high
```

---

## What is in here

| File | What it decides |
|---|---|
| `fibres/*.yaml` | One file per fibre. The properties every decision is built from. |
| `ladder.yaml` | The order of care actions, gentlest to most aggressive. |
| `constructions.yaml` | How knit vs woven, fleece vs plain, and finishes change things. |
| `categories.yaml` | How many wears a kind of garment carries between washes. |
| `soils.yaml` | What each kind of soil actually needs doing about it. |
| `constraints.yaml` | The never-do list. Absolute. |
| `blending.yaml` | How a multi-fibre garment resolves to one set of properties. |
| `sources.yaml` | Every citation. A rule citing something not listed here fails the build. |

---

## The three fields that matter most

**`odour_retention`** — how tightly the fibre holds body odour. This is the
field that decides whether "wash less" is honest advice for a garment or not.
Merino is `very_low` and polyester is `very_high`, and that single difference is
why the engine tells you to air one and wash the other in identical situations.
If you change nothing else in this directory, check these fifteen values.

**`ceiling`** — the most aggressive thing that can be done to this fibre at home
without risking the garment. **No rule anywhere can recommend above it.** Setting
this too high is the only kind of mistake in this repository that destroys
someone's clothes, so it is set pessimistically on purpose. Wool is
`hand_wash_cold` even though plenty of wool survives a cold machine cycle,
because the cost of being wrong in the other direction is a felted jumper.

**`wears_per_wash_baseline`** — how many wears this fibre carries before a wash
is indicated, for a garment worn in the ordinary way for its category. The
engine adjusts it for skin contact, activity and climate.

---

## How to change something

### Correct a fibre property

Open the fibre's file, change the value, and update the matching `rationale`
line so the engine can explain itself:

```yaml
properties:
  odour_retention: low        # was very_low
rationale:
  odour_retention: "The sentence a customer will read as the reason."
sources:
  odour_retention: [engineer-inference]
```

Every `rationale` line is shown to the user verbatim. The engine never
paraphrases it and never writes its own.

### Add a never-do rule

In `constraints.yaml`:

```yaml
- id: a_short_identifier
  when:
    any_fibre_class: [protein]     # conditions are ANDed; lists are ORed
  effects:
    - { kind: forbid_param, param: tumble_dry }
  never_do: "Don't tumble dry it."
  because: "Why, in one or two sentences, addressed to the garment's owner."
  sources: [engineer-inference]
```

The conditions available are listed at the top of `constraints.yaml`.

### Reorder the ladder

`ladder.yaml` holds the order. If steaming belongs above brushing rather than
below it, move the line. Nothing in the code needs to change — the engine asks
this file what "gentler" means.

### Add a fibre

Copy an existing file in `fibres/`, change every value, and add its id wherever
it belongs in `constraints.yaml`. No code change is needed for that either.

---

## Checking your work

```bash
pnpm lint:knowledge
```

Validates every file, checks that every citation resolves, and rejects health or
chemical claims (no "antibacterial", no "kills", no allergen advice — those are
out of scope for this project and the check enforces it).

```bash
pnpm test && pnpm evals
```

Runs the engine against the labelled cases. **If `damage_avoidance_recall` drops
below 100%, something you changed lets the engine recommend a treatment that
would damage a garment.** That fails the build, deliberately.

---

## What the engine will never do

- Recommend anything above a garment's ceiling. Not under uncertainty, not to
  deal with a stubborn stain, not ever. When what a garment needs is more than
  it can safely take, it says so and suggests a professional.
- Make a claim that no rule in this directory stands behind.
- Let a language model choose the care action. A model is used in exactly two
  places — rephrasing the reasoning in these files, and (later) reading a
  composition off a label photograph. It never decides.
