'use client';

import { useRef, useState } from 'react';
import { rephrase, runDecision, type DecideResult } from './actions';

type Option = { id: string; label: string };
type Vocab = {
  fibres: Option[];
  constructions: Option[];
  subConstructions: Option[];
  categories: Option[];
  soils: Option[];
};

type FormState = {
  fibre1: string;
  pct1: number;
  fibre2: string | null;
  pct2: number;
  category: string;
  construction: string;
  sub: string;
  colour: string;
  structured: boolean;
  wears: number;
  nextToSkin: boolean;
  activity: string;
  soils: string[];
};

const INITIAL: FormState = {
  fibre1: 'merino',
  pct1: 100,
  fibre2: null,
  pct2: 0,
  category: 'knitwear',
  construction: 'knit',
  sub: '',
  colour: 'mid',
  structured: false,
  wears: 3,
  nextToSkin: false,
  activity: 'sedentary',
  soils: ['none'],
};

/** One click to a real answer. Nobody should have to fill a form to see if this works. */
const EXAMPLES: { label: string; state: FormState }[] = [
  { label: 'Merino jumper, worn 3 times', state: INITIAL },
  {
    label: 'Gym leggings after a workout',
    state: {
      ...INITIAL,
      fibre1: 'polyester', pct1: 88, fibre2: 'elastane', pct2: 12,
      category: 'activewear', construction: 'knit', sub: 'jersey', colour: 'dark',
      wears: 1, nextToSkin: true, activity: 'workout',
      soils: ['body_odour', 'visible_sweat'],
    },
  },
  {
    label: 'Silk blouse with sweat marks',
    state: {
      ...INITIAL,
      fibre1: 'silk', pct1: 100, category: 'shirt', construction: 'woven', sub: 'satin',
      wears: 2, nextToSkin: true, activity: 'sedentary', soils: ['visible_sweat'],
    },
  },
  {
    label: 'Jeans, 10 wears',
    state: {
      ...INITIAL,
      fibre1: 'cotton', pct1: 100, category: 'jeans', construction: 'woven', sub: 'denim',
      colour: 'dark', wears: 10, nextToSkin: false, activity: 'active', soils: ['none'],
    },
  },
];

function toFormData(s: FormState): FormData {
  const fd = new FormData();
  fd.set('fibre1', s.fibre1);
  fd.set('pct1', String(s.pct1));
  if (s.fibre2) {
    fd.set('fibre2', s.fibre2);
    fd.set('pct2', String(s.pct2));
  }
  fd.set('category', s.category);
  fd.set('construction', s.construction);
  fd.set('sub_construction', s.sub);
  fd.set('colour_depth', s.colour);
  if (s.structured) fd.set('structured', 'on');
  fd.set('wears', String(s.wears));
  if (s.nextToSkin) fd.set('next_to_skin', 'on');
  fd.set('activity', s.activity);
  for (const soil of s.soils) fd.append('soil', soil);
  return fd;
}

export function DecisionForm({ vocab }: { vocab: Vocab }) {
  const [form, setForm] = useState<FormState>(INITIAL);
  const [result, setResult] = useState<DecideResult | null>(null);
  const [deciding, setDeciding] = useState(false);
  const [prose, setProse] = useState<{ prose: string; model: string } | null>(null);
  const [rephrasing, setRephrasing] = useState(false);
  const answerRef = useRef<HTMLDivElement>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const total = form.pct1 + (form.fibre2 ? form.pct2 : 0);

  /** "Nothing in particular" cannot coexist with an actual soil. */
  function toggleSoil(id: string) {
    setForm((f) => {
      if (id === 'none') return { ...f, soils: ['none'] };
      const without = f.soils.filter((s) => s !== 'none');
      const next = without.includes(id) ? without.filter((s) => s !== id) : [...without, id];
      return { ...f, soils: next.length === 0 ? ['none'] : next };
    });
  }

  async function decide(state: FormState) {
    setDeciding(true);
    setResult(null);
    setProse(null);
    answerRef.current?.scrollIntoView({ behavior: 'auto', block: 'start' });

    const fd = toFormData(state);
    // The rules answer in well under a millisecond; without a floor the waiting
    // state would flash past unreadably, which is the same as having none.
    const [decided] = await Promise.all([
      runDecision(fd),
      new Promise((r) => setTimeout(r, 400)),
    ]);
    setResult(decided);
    setDeciding(false);

    if (decided.ok) {
      setRephrasing(true);
      void rephrase(fd)
        .then(setProse)
        .catch(() => setProse(null))
        .finally(() => setRephrasing(false));
    }
  }

  function runExample(state: FormState) {
    setForm(state);
    void decide(state);
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[13px] text-[var(--color-muted)]">Try one:</span>
        {EXAMPLES.map((e) => (
          <button key={e.label} type="button" className="chip" onClick={() => runExample(e.state)}>
            {e.label}
          </button>
        ))}
      </div>

      <form
        className="card"
        onSubmit={(event) => {
          event.preventDefault();
          void decide(form);
        }}
      >
        <div className="grid gap-x-8 gap-y-7 md:grid-cols-2">
          <Field
            className="md:col-span-2"
            label="What is it made of?"
            hint="Straight off the care label. This is the single biggest input — it sets the most this garment can safely take, and no recommendation ever goes above that."
          >
            <div className="flex flex-wrap gap-2">
              <select
                className="control is-grow basis-full sm:basis-0 sm:min-w-[9rem]"
                value={form.fibre1}
                onChange={(e) => set('fibre1', e.target.value)}
              >
                {vocab.fibres.map((f) => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
              <Percent value={form.pct1} onChange={(n) => set('pct1', n)} />
              {form.fibre2 ? (
                <>
                  <select
                    className="control is-grow basis-full sm:basis-0 sm:min-w-[9rem]"
                    value={form.fibre2}
                    onChange={(e) => set('fibre2', e.target.value)}
                  >
                    {vocab.fibres.map((f) => (
                      <option key={f.id} value={f.id}>{f.label}</option>
                    ))}
                  </select>
                  <Percent value={form.pct2} onChange={(n) => set('pct2', n)} />
                  <button
                    type="button"
                    className="control is-auto flex-none px-3 text-[var(--color-muted)]"
                    aria-label="Remove second fibre"
                    onClick={() => setForm((f) => ({ ...f, fibre2: null, pct1: 100, pct2: 0 }))}
                  >
                    ×
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="control is-auto flex-none whitespace-nowrap px-3 text-[13px] text-[var(--color-accent)]"
                  onClick={() => setForm((f) => ({ ...f, fibre2: 'elastane', pct1: 95, pct2: 5 }))}
                >
                  + add a second fibre
                </button>
              )}
            </div>
            {form.fibre2 && total !== 100 && (
              <span className="mt-2 block text-xs text-[var(--color-warn)]">
                That adds up to {total}%, not 100%.
              </span>
            )}
          </Field>

          <Field
            label="What kind of garment is it?"
            hint="Sets how many wears it normally carries between washes. A blazer and a T-shirt are not on the same schedule."
          >
            <select
              className="control"
              value={form.category}
              onChange={(e) => set('category', e.target.value)}
            >
              {vocab.categories.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </Field>

          <Field
            label="How many times have you worn it since it was last washed?"
            hint="Zero if it has just come out of the wash. This is counted against what the fibre and construction can actually carry, not against a rule of thumb."
          >
            <input
              type="number"
              min={0}
              max={60}
              className="control text-left"
              value={form.wears}
              onChange={(e) => set('wears', Number(e.target.value))}
            />
          </Field>

          <Field
            label="What was it doing?"
            hint="Sweat load tracks what you were doing, not how long you wore it. A workout shortens the interval far more than a long day does."
          >
            <select
              className="control"
              value={form.activity}
              onChange={(e) => set('activity', e.target.value)}
            >
              <option value="sedentary">An ordinary day</option>
              <option value="active">Active — walking, commuting, on your feet</option>
              <option value="workout">A workout</option>
            </select>
          </Field>

          <Field
            label="Was it against your skin?"
            hint="Skin contact is what puts body oils into the cloth in the first place, so it roughly halves how long a garment goes between washes."
          >
            <div className="seg">
              <button type="button" aria-pressed={!form.nextToSkin} onClick={() => set('nextToSkin', false)}>
                Over a layer
              </button>
              <button type="button" aria-pressed={form.nextToSkin} onClick={() => set('nextToSkin', true)}>
                Next to skin
              </button>
            </div>
          </Field>

          <Field
            className="md:col-span-2"
            label="Is there anything on it?"
            hint="What actually needs removing is what decides the answer. Choose everything that applies — “Nothing in particular” clears the rest."
          >
            <div className="flex flex-wrap gap-2">
              {vocab.soils.map((soil) => (
                <button
                  key={soil.id}
                  type="button"
                  className="chip"
                  aria-pressed={form.soils.includes(soil.id)}
                  onClick={() => toggleSoil(soil.id)}
                >
                  {soil.label}
                </button>
              ))}
            </div>
          </Field>

          <Field
            label="How is the fabric made?"
            hint="Knits shed noticeably more fibre than wovens when washed, and a fleece or brushed face sheds most of all. Leave the second box on “Any” if you are not sure."
          >
            <div className="flex flex-wrap gap-2">
              <select
                className="control is-grow basis-[7rem]"
                value={form.construction}
                onChange={(e) => set('construction', e.target.value)}
              >
                {vocab.constructions.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
              <select
                className="control is-grow basis-[7rem]"
                value={form.sub}
                onChange={(e) => set('sub', e.target.value)}
              >
                <option value="">Any</option>
                {vocab.subConstructions.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>
          </Field>

          <Field
            label="How dark is the colour?"
            hint="Dark dyes fade unevenly in direct sunlight, and strong colours can transfer onto other garments for the first few washes."
          >
            <select
              className="control"
              value={form.colour}
              onChange={(e) => set('colour', e.target.value)}
            >
              <option value="">Not sure</option>
              <option value="white">White</option>
              <option value="light">Light</option>
              <option value="mid">Mid</option>
              <option value="dark">Dark</option>
            </select>
          </Field>

          <Field
            className="md:col-span-2"
            label="Is it structured?"
            hint="Interfacing, shoulder pads or a lining — tailoring, mostly. Those layers shrink at different rates, so a wash pulls the shape out permanently and pressing will not bring it back."
          >
            <div className="seg">
              <button type="button" aria-pressed={!form.structured} onClick={() => set('structured', false)}>
                No
              </button>
              <button type="button" aria-pressed={form.structured} onClick={() => set('structured', true)}>
                Yes
              </button>
            </div>
          </Field>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-4">
          <button type="submit" className="btn-primary w-auto px-8" disabled={deciding}>
            {deciding ? 'Working it out' : 'Should I wash it?'}
          </button>
          <span className="text-xs text-[var(--color-faint)]">
            Advisory only. Nothing is stored.
          </span>
        </div>
      </form>

      <div ref={answerRef} className="scroll-mt-6">
        {deciding && <Waiting />}
        {!deciding && result?.ok === false && (
          <p className="mt-10 rounded border border-[var(--color-warn)] bg-white px-4 py-3 text-sm text-[var(--color-warn)]">
            {result.error}
          </p>
        )}
        {!deciding && result?.ok && (
          <Answer result={result} prose={prose} rephrasing={rephrasing} />
        )}
      </div>
    </>
  );
}

/* ── Small pieces ────────────────────────────────────────────────────────── */

/**
 * Every field carries its question and a line on what the answer changes.
 * Nobody filling this in has a reason to know that knits shed more than wovens,
 * and saying so is the point of the product rather than a footnote to it.
 */
function Field({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <span className="q-label">{label}</span>
      <span className="q-hint">{hint}</span>
      {children}
    </div>
  );
}

function Percent({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="relative w-[76px] flex-none">
      <input
        type="number"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="control pr-6"
        aria-label="percentage"
      />
      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-[var(--color-faint)]">
        %
      </span>
    </div>
  );
}

function Waiting() {
  return (
    <div className="mt-12" aria-live="polite" aria-busy="true">
      <p className="mb-5 flex items-center gap-2 text-sm text-[var(--color-muted)]">
        Working out the least you can do
        <span aria-hidden className="inline-flex gap-1">
          <span className="dot inline-block h-1 w-1 rounded-full bg-current" />
          <span className="dot inline-block h-1 w-1 rounded-full bg-current" />
          <span className="dot inline-block h-1 w-1 rounded-full bg-current" />
        </span>
      </p>
      <div className="skeleton h-12 w-72 max-w-full" />
      <div className="skeleton mt-3 h-4 w-full max-w-lg" />
      {/* Mirrors the shape of the real answer: stacked full-width sections. */}
      <div className="mt-10 space-y-9">
        <div className="space-y-2 border-t border-[var(--color-line)] pt-5">
          <div className="skeleton h-3 w-16" />
          <div className="skeleton h-4 w-full max-w-4xl" />
          <div className="skeleton h-4 w-11/12 max-w-3xl" />
        </div>
        <div className="space-y-2 border-t border-[var(--color-line)] pt-5">
          <div className="skeleton h-3 w-16" />
          <div className="skeleton h-4 w-full max-w-4xl" />
          <div className="skeleton h-4 w-2/3 max-w-2xl" />
        </div>
      </div>
    </div>
  );
}

/* ── The answer ──────────────────────────────────────────────────────────── */

function Answer({
  result,
  prose,
  rephrasing,
}: {
  result: Extract<DecideResult, { ok: true }>;
  prose: { prose: string; model: string } | null;
  rephrasing: boolean;
}) {
  const { decision, explanation, labels } = result;
  const name = (id: string) => labels[id] ?? id;

  return (
    <article className="rise mt-12 border-t border-[var(--color-line)] pt-10">
      <p className="eyebrow mb-2">The answer</p>
      <h2 className="display text-4xl leading-tight sm:text-5xl">{explanation.headline}</h2>
      <p className="mt-3 max-w-3xl text-[17px] leading-relaxed">
        {prose ? prose.prose : explanation.summary}
      </p>
      {rephrasing && !prose && <div className="skeleton mt-3 h-4 w-full max-w-3xl" />}

      {decision.do_first.length > 0 && (
        <p className="mt-5 inline-block rounded border border-[var(--color-warn)] bg-white px-3 py-2 text-sm">
          <strong className="font-semibold text-[var(--color-warn)]">First:</strong>{' '}
          {decision.do_first.map(name).join(', ')}
        </p>
      )}

      <Answers>
        <AnswerSection title="Why">
          <ul className="space-y-3.5">
            {explanation.claims.map((claim) => (
              <li key={claim.rule_id} className="max-w-4xl text-[15px] leading-relaxed">
                {claim.text}
              </li>
            ))}
          </ul>
        </AnswerSection>

        {decision.never_do.length > 0 && (
          <AnswerSection title="Never">
            <ul className="space-y-3">
              {decision.never_do.map((c) => (
                <li key={c.rule_id} className="max-w-4xl text-[15px] leading-relaxed">
                  <strong className="font-semibold text-[var(--color-warn)]">{c.never_do}</strong>{' '}
                  <span className="text-[var(--color-muted)]">{c.because}</span>
                </li>
              ))}
            </ul>
          </AnswerSection>
        )}

        {decision.unknowns.length > 0 && (
          <AnswerSection title="Worth checking">
            <ul className="space-y-2">
              {decision.unknowns.map((u) => (
                <li key={u} className="max-w-4xl text-[15px] leading-relaxed text-[var(--color-muted)]">
                  {u}
                </li>
              ))}
            </ul>
          </AnswerSection>
        )}

        <AnswerSection title="When it's dry">
          <p className="text-[15px] leading-relaxed">{name(decision.drying)}</p>
        </AnswerSection>

        <AnswerSection title="Also fine">
          <p className="text-[15px] leading-relaxed">
            {decision.alternatives.length > 0
              ? decision.alternatives.map(name).join(', ')
              : 'Nothing gentler would do the job.'}
          </p>
        </AnswerSection>

        <AnswerSection title="If you did wash it">
          <p className="max-w-4xl text-[15px] leading-relaxed">
            Fibre shedding would be{' '}
            <strong className="font-semibold">
              {decision.impact_estimate.relative_shedding.replace('_', ' ')}
            </strong>{' '}
            for this fabric.{' '}
            {decision.impact_estimate.wears_extended_estimate
              ? `Left alone, it has roughly ${decision.impact_estimate.wears_extended_estimate} more wears in it first.`
              : ''}
          </p>
        </AnswerSection>
      </Answers>

      <p className="mt-10 max-w-3xl text-xs leading-relaxed text-[var(--color-faint)]">
        Advisory only and conservative by design — when in doubt, follow the garment's own label.
        Care symbols are described in words; the official artwork is trademarked and not reproduced.
      </p>
    </article>
  );
}

/** Sections stack full width, one after another, rather than sitting in columns. */
function Answers({ children }: { children: React.ReactNode }) {
  return <div className="mt-10 space-y-9">{children}</div>;
}

function AnswerSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-[var(--color-line)] pt-5">
      <h3 className="eyebrow mb-3">{title}</h3>
      {children}
    </section>
  );
}
