'use client';

import { useId, useRef, useState } from 'react';
import { rephrase, runDecision, type DecideResult } from './actions';

type Option = { id: string; label: string };
type Vocab = {
  fibres: Option[];
  constructions: Option[];
  subConstructions: Option[];
  categories: Option[];
  soils: Option[];
};

/**
 * Why each question is being asked.
 *
 * Every hint says what the answer changes, not what the field is. Someone
 * filling this in has no reason to know that construction affects fibre
 * release — and telling them is the point of the product, so it may as well
 * start in the form.
 */
const SOIL_HINTS: Record<string, string> = {
  none: 'Just worn. Nothing on it.',
  body_odour: 'Whether this can be aired out depends entirely on the fibre.',
  visible_sweat: 'Salts and oils dried into the cloth. Needs water; rarely needs heat.',
  food_grease: 'Treated where it landed, before anything else.',
  smoke: 'Absorbed smells usually leave on their own with enough air.',
  outdoor_dust: 'Sits on the surface. Let it dry first.',
  stain: 'Never goes in a wash untreated — heat sets it permanently.',
};

export function DecisionForm({ vocab }: { vocab: Vocab }) {
  const [result, setResult] = useState<DecideResult | null>(null);
  const [deciding, setDeciding] = useState(false);
  const [prose, setProse] = useState<{ prose: string; model: string } | null>(null);
  const [rephrasing, setRephrasing] = useState(false);
  const [rephraseFailed, setRephraseFailed] = useState(false);

  const [hasSecondFibre, setHasSecondFibre] = useState(false);
  const [pct1, setPct1] = useState(100);
  const [pct2, setPct2] = useState(0);
  const [soils, setSoils] = useState<string[]>(['none']);
  const resultRef = useRef<HTMLDivElement>(null);

  const total = pct1 + (hasSecondFibre ? pct2 : 0);

  function addSecondFibre() {
    setHasSecondFibre(true);
    setPct1(95);
    setPct2(5);
  }

  function removeSecondFibre() {
    setHasSecondFibre(false);
    setPct1(100);
    setPct2(0);
  }

  /** "Nothing in particular" cannot coexist with an actual soil. */
  function toggleSoil(id: string) {
    setSoils((current) => {
      if (id === 'none') return ['none'];
      const without = current.filter((s) => s !== 'none');
      const next = without.includes(id) ? without.filter((s) => s !== id) : [...without, id];
      return next.length === 0 ? ['none'] : next;
    });
  }

  /**
   * A plain submit handler, deliberately NOT `<form action={fn}>`.
   *
   * React 19 runs a form action inside a transition, and updates made in a
   * transition are non-urgent: setting a pending flag, awaiting, then clearing
   * it renders only the final state. The waiting state never appeared on
   * screen no matter how it was written. An ordinary event handler makes these
   * updates urgent, so the intermediate state is actually rendered.
   */
  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Read before awaiting — currentTarget is nulled once the handler yields.
    const formData = new FormData(event.currentTarget);

    setDeciding(true);
    setResult(null);
    setProse(null);
    setRephraseFailed(false);

    /*
     * Without this the answer renders around a thousand pixels ABOVE the
     * button that produced it, so pressing the button appears to do nothing.
     *
     * Instant, not smooth, and deliberately so. A smooth scroll is an
     * animation, and an animation can be throttled — measured here moving 64px
     * in 1.4 seconds, leaving the answer off-screen and reintroducing the exact
     * bug this line exists to fix. Landing on the result is the requirement;
     * gliding there is not.
     */
    resultRef.current?.scrollIntoView({ behavior: 'auto', block: 'start' });

    // The rules engine answers in well under a millisecond, so on a warm
    // server the waiting state would otherwise flash past unreadably. This is
    // not padding for its own sake — a state you cannot see is the same as no
    // state, which is what it looked like before.
    const [decided] = await Promise.all([
      runDecision(formData),
      new Promise((resolve) => setTimeout(resolve, 450)),
    ]);
    setResult(decided);
    setDeciding(false);

    // Deliberately after the answer is on screen. The rules have already
    // decided; this only rewords them, and it must never delay the answer.
    if (decided.ok) {
      setRephrasing(true);
      void rephrase(formData)
        .then((p) => {
          setProse(p);
          setRephraseFailed(p === null);
        })
        .catch(() => setRephraseFailed(true))
        .finally(() => setRephrasing(false));
    }
  }

  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,23rem)_minmax(0,1fr)] lg:gap-16">
      <form onSubmit={onSubmit}>
        <Section title="The garment" step="01">
          <Field
            label="What is it made of?"
            hint="Read it off the care label. This is the single biggest input — it sets the most the garment can safely take."
          >
            <div className="flex gap-2">
              <select name="fibre1" className="control" defaultValue="merino" required>
                {vocab.fibres.map((f) => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
              <PercentInput name="pct1" value={pct1} onChange={setPct1} />
            </div>

            {hasSecondFibre ? (
              <>
                <div className="mt-2 flex gap-2">
                  <select name="fibre2" className="control" defaultValue="elastane">
                    {vocab.fibres.map((f) => (
                      <option key={f.id} value={f.id}>{f.label}</option>
                    ))}
                  </select>
                  <PercentInput name="pct2" value={pct2} onChange={setPct2} />
                </div>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className={total === 100 ? 'text-[var(--color-faint)]' : 'text-[var(--color-warn)]'}>
                    {total === 100 ? 'Adds up to 100%.' : `Adds up to ${total}%, not 100%.`}
                  </span>
                  <button type="button" className="btn-quiet" onClick={removeSecondFibre}>
                    Remove
                  </button>
                </div>
              </>
            ) : (
              <button type="button" className="btn-quiet mt-2" onClick={addSecondFibre}>
                + Add a second fibre
              </button>
            )}
          </Field>

          <Field
            label="What kind of garment is it?"
            hint="Sets how many wears it normally carries between washes. A blazer and a T-shirt are not on the same schedule."
          >
            <select name="category" className="control" defaultValue="knitwear">
              {vocab.categories.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </Field>

          <Field
            label="How is the fabric made?"
            hint="Knits shed noticeably more fibre than wovens when washed. Leave the second box on “Any” if you're not sure."
          >
            <div className="flex gap-2">
              <select name="construction" className="control" defaultValue="knit">
                {vocab.constructions.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
              <select name="sub_construction" className="control" defaultValue="">
                <option value="">Any</option>
                {vocab.subConstructions.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>
          </Field>

          <Field
            label="How dark is the colour?"
            hint="Dark dyes fade unevenly in direct sun, and strong colours can transfer to other garments in the first few washes."
          >
            <select name="colour_depth" className="control" defaultValue="mid">
              <option value="">Not sure</option>
              <option value="white">White</option>
              <option value="light">Light</option>
              <option value="mid">Mid</option>
              <option value="dark">Dark</option>
            </select>
          </Field>

          <CheckRow
            name="structured"
            label="It's structured"
            hint="Interfacing, shoulder pads or a lining — tailoring, mostly. These layers shrink at different rates, so a wash pulls the shape out permanently."
          />
        </Section>

        <Section title="What's happened to it" step="02">
          <Field
            label="How many times have you worn it since it was last washed?"
            hint="Zero if it's straight out of the wash."
          >
            <input
              name="wears"
              type="number"
              min={0}
              max={60}
              defaultValue={3}
              className="control"
              style={{ textAlign: 'left' }}
            />
          </Field>

          <CheckRow
            name="next_to_skin"
            label="Worn against skin"
            hint="Skin contact is what puts body oils into the cloth in the first place, so it roughly halves how long a garment goes between washes."
          />

          <Field
            label="What was it doing?"
            hint="Sweat load tracks what you were doing, not how long you wore it."
          >
            <select name="activity" className="control" defaultValue="sedentary">
              <option value="">Not sure</option>
              <option value="sedentary">An ordinary day</option>
              <option value="active">Active — walking, commuting, on your feet</option>
              <option value="workout">A workout</option>
            </select>
          </Field>

          <Field
            label="Is there anything on it?"
            hint="Tick everything that applies. What needs removing is what decides the answer."
          >
            <div className="space-y-1.5">
              {vocab.soils.map((s) => (
                <label key={s.id} className="check-row">
                  <input
                    type="checkbox"
                    name="soil"
                    value={s.id}
                    checked={soils.includes(s.id)}
                    onChange={() => toggleSoil(s.id)}
                  />
                  <span>
                    <span className="block text-sm font-medium leading-tight">{s.label}</span>
                    <span className="mt-0.5 block text-xs leading-snug text-[var(--color-muted)]">
                      {SOIL_HINTS[s.id]}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </Field>
        </Section>

        <div className="mt-8">
          <button type="submit" className="btn-primary" disabled={deciding}>
            {deciding ? 'Working it out' : 'Should I wash it?'}
          </button>
          <p className="mt-3 text-center text-xs text-[var(--color-faint)]">
            Advisory only, and conservative by design. Nothing is stored.
          </p>
        </div>
      </form>

      <div ref={resultRef} className="min-w-0 scroll-mt-8">
        {deciding && <Waiting />}
        {!deciding && result === null && <EmptyState />}
        {!deciding && result?.ok === false && (
          <p className="rounded border border-[var(--color-warn)] bg-white px-4 py-3 text-sm text-[var(--color-warn)]">
            {result.error}
          </p>
        )}
        {!deciding && result?.ok && (
          <Result
            result={result}
            prose={prose}
            rephrasing={rephrasing}
            rephraseFailed={rephraseFailed}
          />
        )}
      </div>
    </div>
  );
}

/* ── Form primitives ─────────────────────────────────────────────────────── */

function Section({
  title,
  step,
  children,
}: {
  title: string;
  step: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="mb-9">
      <legend className="mb-5 flex w-full items-baseline gap-3 border-b border-[var(--color-line)] pb-2">
        <span className="eyebrow">{step}</span>
        <span className="display text-lg">{title}</span>
      </legend>
      <div className="space-y-6">{children}</div>
    </fieldset>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <span className="q-label">{label}</span>
      <span className="q-hint">{hint}</span>
      {children}
    </div>
  );
}

function PercentInput({
  name,
  value,
  onChange,
}: {
  name: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="relative w-[86px] flex-none">
      <input
        name={name}
        type="number"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="control pr-6"
        aria-label="percentage"
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[var(--color-faint)]">
        %
      </span>
    </div>
  );
}

function CheckRow({ name, label, hint }: { name: string; label: string; hint: string }) {
  const id = useId();
  return (
    <label className="check-row" htmlFor={id}>
      <input id={id} type="checkbox" name={name} />
      <span>
        <span className="block text-sm font-medium leading-tight">{label}</span>
        <span className="mt-0.5 block text-xs leading-snug text-[var(--color-muted)]">{hint}</span>
      </span>
    </label>
  );
}

/* ── Result pane states ──────────────────────────────────────────────────── */

function EmptyState() {
  return (
    <div className="max-w-md rounded-lg border border-dashed border-[var(--color-line-strong)] px-6 py-8">
      <p className="display text-xl leading-snug">Describe a garment and what has happened to it.</p>
      <p className="mt-3 text-sm leading-relaxed text-[var(--color-muted)]">
        You'll get back the least you can do about it — which is often nothing — along with every
        rule that produced that answer, an explicit list of what would damage the garment, and how
        much fibre it would shed if you did wash it.
      </p>
      <p className="mt-4 text-sm leading-relaxed text-[var(--color-muted)]">
        The form is already filled in with a merino jumper worn three times. Press the button.
      </p>
    </div>
  );
}

function Waiting() {
  return (
    <div aria-live="polite" aria-busy="true">
      <p className="mb-6 flex items-center gap-2 text-sm text-[var(--color-muted)]">
        Working out the least you can do
        <span aria-hidden className="inline-flex gap-1">
          <span className="dot inline-block h-1 w-1 rounded-full bg-current" />
          <span className="dot inline-block h-1 w-1 rounded-full bg-current" />
          <span className="dot inline-block h-1 w-1 rounded-full bg-current" />
        </span>
      </p>
      <div className="skeleton h-11 w-2/3" />
      <div className="skeleton mt-3 h-4 w-full max-w-md" />
      <div className="mt-10 space-y-2">
        <div className="skeleton h-3 w-14" />
        <div className="skeleton h-4 w-full max-w-xl" />
        <div className="skeleton h-4 w-full max-w-lg" />
        <div className="skeleton h-4 w-2/3 max-w-md" />
      </div>
      <div className="mt-8 space-y-2">
        <div className="skeleton h-3 w-14" />
        <div className="skeleton h-4 w-full max-w-lg" />
        <div className="skeleton h-4 w-3/4 max-w-md" />
      </div>
    </div>
  );
}

function Result({
  result,
  prose,
  rephrasing,
  rephraseFailed,
}: {
  result: Extract<DecideResult, { ok: true }>;
  prose: { prose: string; model: string } | null;
  rephrasing: boolean;
  rephraseFailed: boolean;
}) {
  const { decision, explanation, labels } = result;
  const name = (id: string) => labels[id] ?? id;

  return (
    <article className="rise space-y-9">
      <header>
        <p className="eyebrow mb-2">The answer</p>
        <h2 className="display text-4xl leading-tight sm:text-5xl">{explanation.headline}</h2>
        <p className="mt-3 max-w-prose text-[15px] leading-relaxed text-[var(--color-muted)]">
          {explanation.summary}
        </p>

        {(rephrasing || prose || rephraseFailed) && (
          <div className="mt-5 max-w-prose border-l-2 border-[var(--color-line-strong)] pl-4">
            {rephrasing && !prose ? (
              <>
                <p className="flex items-center gap-2 text-xs text-[var(--color-faint)]">
                  Putting that in plain words
                  <span aria-hidden className="inline-flex gap-1">
                    <span className="dot inline-block h-1 w-1 rounded-full bg-current" />
                    <span className="dot inline-block h-1 w-1 rounded-full bg-current" />
                    <span className="dot inline-block h-1 w-1 rounded-full bg-current" />
                  </span>
                </p>
                <div className="skeleton mt-2 h-3.5 w-full" />
                <div className="skeleton mt-1.5 h-3.5 w-4/5" />
              </>
            ) : prose ? (
              <div className="rise">
                <p className="text-sm leading-relaxed">{prose.prose}</p>
                <p className="mt-2 text-[11px] leading-snug text-[var(--color-faint)]">
                  Reworded by {prose.model}, then checked against the rules that fired. The rules
                  decided; the model only rephrased them.
                </p>
              </div>
            ) : (
              /* Saying so beats the block appearing and then vanishing — and
                 the point it makes is one worth making: nothing was lost. */
              <p className="rise text-[11px] leading-snug text-[var(--color-faint)]">
                No plain-language rewording this time — the free model either didn't answer or
                said something the rules don't support, so it was discarded. The reasoning below
                is the engine's own and is unaffected.
              </p>
            )}
          </div>
        )}
      </header>

      {decision.do_first.length > 0 && (
        <Block title="Do this first">
          <ul className="space-y-1">
            {decision.do_first.map((a) => (
              <li key={a} className="text-sm font-medium">
                {name(a)}
              </li>
            ))}
          </ul>
        </Block>
      )}

      <Block title="Why">
        <ol className="space-y-4">
          {explanation.claims.map((claim, i) => (
            <li key={claim.rule_id} className="flex gap-3">
              <span className="mt-0.5 flex-none font-mono text-[11px] text-[var(--color-faint)]">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="max-w-prose text-sm leading-relaxed">
                {claim.text}
                <span className="mt-1 block font-mono text-[11px] text-[var(--color-faint)]">
                  {claim.rule_id}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </Block>

      {decision.never_do.length > 0 && (
        <Block title="Never">
          <ul className="space-y-4">
            {decision.never_do.map((c) => (
              <li key={c.rule_id} className="max-w-prose text-sm leading-relaxed">
                <strong className="font-semibold text-[var(--color-warn)]">{c.never_do}</strong>{' '}
                {c.because}
                <span className="mt-1 block font-mono text-[11px] text-[var(--color-faint)]">
                  {c.sources.map((s) => s.id).join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        </Block>
      )}

      <div className="grid gap-8 sm:grid-cols-2">
        <Block title="When it's dry">
          <p className="text-sm">{name(decision.drying)}</p>
        </Block>
        <Block title="Also fine">
          <p className="text-sm">
            {decision.alternatives.length > 0
              ? decision.alternatives.map(name).join(', ')
              : 'Nothing gentler would do the job.'}
          </p>
        </Block>
      </div>

      <Block title="Impact — estimates, not measurements">
        <p className="max-w-prose text-sm leading-relaxed">
          Relative shedding if washed:{' '}
          <strong className="font-semibold">
            {decision.impact_estimate.relative_shedding.replace('_', ' ')}
          </strong>
          . {decision.impact_estimate.energy_note}
          {decision.impact_estimate.wears_extended_estimate
            ? ` Roughly ${decision.impact_estimate.wears_extended_estimate} more wears before a wash is indicated.`
            : ''}
        </p>
        <p className="mt-2 max-w-prose text-xs leading-relaxed text-[var(--color-faint)]">
          {decision.impact_estimate.method}
        </p>
      </Block>

      {decision.unknowns.length > 0 && (
        <Block title="Worth checking">
          <ul className="space-y-2">
            {decision.unknowns.map((u) => (
              <li key={u} className="max-w-prose text-sm leading-relaxed text-[var(--color-muted)]">
                {u}
              </li>
            ))}
          </ul>
        </Block>
      )}

      <footer className="space-y-2 border-t border-[var(--color-line)] pt-5 text-xs leading-relaxed text-[var(--color-faint)]">
        <p>
          Confidence {decision.confidence}. The most this garment can safely take at home is{' '}
          <strong className="font-semibold">{name(decision.ceiling.action)}</strong>, and nothing
          above that is ever recommended.
        </p>
        <p>
          Advisory only and conservative by design. When in doubt, follow the garment's own label.
          Care symbols are described in words here — the official symbol artwork is trademarked and
          is not reproduced.
        </p>
      </footer>
    </article>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="eyebrow mb-3">{title}</h3>
      {children}
    </section>
  );
}
