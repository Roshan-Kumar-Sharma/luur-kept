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

  const hasSoil = !form.soils.includes('none');
  const total = form.pct1 + (form.fibre2 ? form.pct2 : 0);

  function toggleSoil(id: string) {
    setForm((f) => {
      const next = f.soils.includes(id) ? f.soils.filter((s) => s !== id) : [...f.soils, id];
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
        <div className="grid gap-x-5 gap-y-5 md:grid-cols-3">
          <div className="md:col-span-2">
            <Label>What is it made of?</Label>
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
                  + blend
                </button>
              )}
            </div>
            <Hint tone={form.fibre2 && total !== 100 ? 'warn' : 'normal'}>
              {form.fibre2 && total !== 100
                ? `That adds up to ${total}%, not 100%.`
                : 'Straight off the care label. It sets the most this garment can safely take.'}
            </Hint>
          </div>

          <div>
            <Label>What is it?</Label>
            <select
              className="control"
              value={form.category}
              onChange={(e) => set('category', e.target.value)}
            >
              {vocab.categories.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
            <Hint>Sets how long it normally goes between washes.</Hint>
          </div>

          <div>
            <Label>Worn how many times since washing?</Label>
            <input
              type="number"
              min={0}
              max={60}
              className="control text-left"
              value={form.wears}
              onChange={(e) => set('wears', Number(e.target.value))}
            />
          </div>

          <div>
            <Label>Doing what?</Label>
            <select
              className="control"
              value={form.activity}
              onChange={(e) => set('activity', e.target.value)}
            >
              <option value="sedentary">An ordinary day</option>
              <option value="active">Active — on your feet</option>
              <option value="workout">A workout</option>
            </select>
          </div>

          <div>
            <Label>Against your skin?</Label>
            <div className="seg">
              <button
                type="button"
                aria-pressed={!form.nextToSkin}
                onClick={() => set('nextToSkin', false)}
              >
                Over a layer
              </button>
              <button
                type="button"
                aria-pressed={form.nextToSkin}
                onClick={() => set('nextToSkin', true)}
              >
                Next to skin
              </button>
            </div>
          </div>

          <div className="md:col-span-3">
            <Label>Anything on it?</Label>
            <div className="flex flex-wrap items-center gap-2">
              <div className="seg">
                <button
                  type="button"
                  aria-pressed={!hasSoil}
                  onClick={() => set('soils', ['none'])}
                >
                  Nothing in particular
                </button>
                <button
                  type="button"
                  aria-pressed={hasSoil}
                  onClick={() => hasSoil || set('soils', ['body_odour'])}
                >
                  Something is
                </button>
              </div>

              {/* Only shown once there is something to describe. Seven options
                  a user has already said don't apply is seven options of noise. */}
              {hasSoil &&
                vocab.soils
                  .filter((s) => s.id !== 'none')
                  .map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className="chip"
                      aria-pressed={form.soils.includes(s.id)}
                      onClick={() => toggleSoil(s.id)}
                    >
                      {s.label}
                    </button>
                  ))}
            </div>
          </div>
        </div>

        <details className="more mt-5">
          <summary>More about the fabric</summary>
          <div className="mt-4 grid gap-x-5 gap-y-5 md:grid-cols-3">
            <div>
              <Label>How is it made?</Label>
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
              <Hint>Knits shed more fibre than wovens.</Hint>
            </div>
            <div>
              <Label>How dark is it?</Label>
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
              <Hint>Dark dyes fade unevenly in sun.</Hint>
            </div>
            <div>
              <Label>Structured?</Label>
              <div className="seg">
                <button type="button" aria-pressed={!form.structured} onClick={() => set('structured', false)}>
                  No
                </button>
                <button type="button" aria-pressed={form.structured} onClick={() => set('structured', true)}>
                  Yes
                </button>
              </div>
              <Hint>Interfacing, shoulder pads or a lining.</Hint>
            </div>
          </div>
        </details>

        <div className="mt-6 flex flex-wrap items-center gap-4">
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

function Label({ children }: { children: React.ReactNode }) {
  return <span className="q-label mb-1.5 block">{children}</span>;
}

function Hint({ children, tone = 'normal' }: { children: React.ReactNode; tone?: 'normal' | 'warn' }) {
  return (
    <span
      className="mt-1.5 block text-xs leading-snug"
      style={{ color: tone === 'warn' ? 'var(--color-warn)' : 'var(--color-faint)' }}
    >
      {children}
    </span>
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
      <div className="mt-10 grid gap-10 lg:grid-cols-[1.15fr_1fr]">
        <div className="space-y-2">
          <div className="skeleton h-3 w-16" />
          <div className="skeleton h-4 w-full" />
          <div className="skeleton h-4 w-11/12" />
          <div className="skeleton h-4 w-2/3" />
        </div>
        <div className="space-y-2">
          <div className="skeleton h-3 w-16" />
          <div className="skeleton h-4 w-full" />
          <div className="skeleton h-4 w-3/4" />
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
  const [showRules, setShowRules] = useState(false);
  const name = (id: string) => labels[id] ?? id;

  return (
    <article className="rise mt-12 border-t border-[var(--color-line)] pt-10">
      <p className="eyebrow mb-2">The answer</p>
      <h2 className="display text-4xl leading-tight sm:text-5xl">{explanation.headline}</h2>
      <p className="mt-3 max-w-2xl text-[17px] leading-relaxed">
        {prose ? prose.prose : explanation.summary}
      </p>
      {rephrasing && !prose && <div className="skeleton mt-3 h-4 w-full max-w-2xl" />}

      {decision.do_first.length > 0 && (
        <p className="mt-5 inline-block rounded border border-[var(--color-warn)] bg-white px-3 py-2 text-sm">
          <strong className="font-semibold text-[var(--color-warn)]">First:</strong>{' '}
          {decision.do_first.map(name).join(', ')}
        </p>
      )}

      <div className="mt-10 grid gap-10 lg:grid-cols-[1.15fr_1fr] lg:gap-14">
        <section>
          <h3 className="eyebrow mb-4">Why</h3>
          <ul className="space-y-3.5">
            {explanation.claims.map((claim) => (
              <li key={claim.rule_id} className="text-[15px] leading-relaxed">
                {claim.text}
              </li>
            ))}
          </ul>
        </section>

        <div className="space-y-8">
          {decision.never_do.length > 0 && (
            <section>
              <h3 className="eyebrow mb-4">Never</h3>
              <ul className="space-y-3">
                {decision.never_do.map((c) => (
                  <li key={c.rule_id} className="text-[15px] leading-relaxed">
                    <strong className="font-semibold text-[var(--color-warn)]">{c.never_do}</strong>{' '}
                    <span className="text-[var(--color-muted)]">{c.because}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="grid grid-cols-2 gap-6">
            <div>
              <h3 className="eyebrow mb-2">When it's dry</h3>
              <p className="text-[15px]">{name(decision.drying)}</p>
            </div>
            <div>
              <h3 className="eyebrow mb-2">Also fine</h3>
              <p className="text-[15px]">
                {decision.alternatives.length > 0
                  ? decision.alternatives.map(name).join(', ')
                  : 'Nothing gentler would do it.'}
              </p>
            </div>
          </section>

          <section>
            <h3 className="eyebrow mb-2">If you did wash it</h3>
            <p className="text-[15px] leading-relaxed">
              Fibre shedding would be{' '}
              <strong className="font-semibold">
                {decision.impact_estimate.relative_shedding.replace('_', ' ')}
              </strong>{' '}
              for this fabric.{' '}
              {decision.impact_estimate.wears_extended_estimate
                ? `Left alone, it has roughly ${decision.impact_estimate.wears_extended_estimate} more wears in it first.`
                : ''}
            </p>
          </section>
        </div>
      </div>

      {decision.unknowns.length > 0 && (
        <section className="mt-10">
          <h3 className="eyebrow mb-3">Worth checking</h3>
          <ul className="space-y-2">
            {decision.unknowns.map((u) => (
              <li key={u} className="max-w-2xl text-[15px] leading-relaxed text-[var(--color-muted)]">
                {u}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-10 max-w-2xl text-xs leading-relaxed text-[var(--color-faint)]">
        Advisory only and conservative by design — when in doubt, follow the garment's own label.
        Care symbols are described in words; the official artwork is trademarked and not reproduced.
      </p>

      {/*
        Everything a consumer does not need and a reviewer does: rule ids,
        citations, the computed ceiling, the model that did the wording. This
        used to sit in the middle of the page, which is why it had to move.
      */}
      <div className="mt-8">
        <button type="button" className="btn-quiet" onClick={() => setShowRules((v) => !v)}>
          {showRules ? 'Hide the rules behind this' : 'Show the rules behind this'}
        </button>

        {showRules && (
          <div className="audit mt-4 space-y-4">
            <p>
              Every recommendation is produced by deterministic rules, each citing a source. A
              language model never chooses the action — at most it rewords the reasoning, and its
              wording is discarded if it says anything the rules do not support.
            </p>
            <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
              <Row k="Care ceiling for this garment" v={name(decision.ceiling.action)} />
              <Row k="Confidence" v={String(decision.confidence)} />
              <Row
                k="Wording"
                v={prose ? prose.model : 'deterministic (no model response used)'}
              />
              <Row k="Rules fired" v={String(decision.reasoning.length)} />
            </dl>
            <div>
              <p className="mb-2 font-medium text-[var(--color-ink)]">Rules behind the answer</p>
              <ul className="space-y-2.5">
                {explanation.claims.map((c) => {
                  const hit = decision.reasoning.find((h) => h.rule_id === c.rule_id);
                  return (
                    <li key={c.rule_id}>
                      <code>{c.rule_id}</code>
                      {hit?.sources?.length ? (
                        <> — <code>{hit.sources.map((x) => x.id).join(', ')}</code></>
                      ) : null}
                      {hit?.rationale && (
                        <span className="mt-1 block max-w-2xl leading-relaxed">
                          {hit.rationale}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
            {decision.never_do.length > 0 && (
              <div>
                <p className="mb-2 font-medium text-[var(--color-ink)]">Constraints and citations</p>
                <ul className="space-y-1">
                  {decision.never_do.map((c) => (
                    <li key={c.rule_id}>
                      <code>{c.rule_id}</code> — <code>{c.sources.map((s) => s.id).join(', ')}</code>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-[var(--color-faint)]">
              {decision.impact_estimate.method}
            </p>
          </div>
        )}
      </div>
    </article>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-[var(--color-line)] pb-1">
      <dt>{k}</dt>
      <dd className="text-right font-medium text-[var(--color-ink)]">{v}</dd>
    </div>
  );
}
