'use client';

import { useState } from 'react';
import { rephrase, runDecision, type DecideResult } from './actions';

type Option = { id: string; label: string };
type Vocab = {
  fibres: Option[];
  constructions: Option[];
  subConstructions: Option[];
  categories: Option[];
  soils: Option[];
};

const field = 'w-full rounded border border-[var(--color-line)] bg-white px-3 py-2 text-sm';
const legend = 'text-xs uppercase tracking-[0.14em] text-[var(--color-muted)] mb-3';

export function DecisionForm({ vocab }: { vocab: Vocab }) {
  const [result, setResult] = useState<DecideResult | null>(null);
  const [pending, setPending] = useState(false);
  const [prose, setProse] = useState<{ prose: string; model: string } | null>(null);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setProse(null);
    const decided = await runDecision(formData);
    setResult(decided);
    setPending(false);

    // Deliberately after the decision is on screen. The rules have already
    // answered; this only rewords them, and it must never delay the answer.
    if (decided.ok) {
      void rephrase(formData).then(setProse).catch(() => setProse(null));
    }
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <form action={onSubmit} className="space-y-7">
        <fieldset>
          <div className={legend}>The garment</div>
          <div className="space-y-3">
            <div className="flex gap-2">
              <select name="fibre1" className={field} defaultValue="merino" required>
                {vocab.fibres.map((f) => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
              <input
                name="pct1" type="number" min={1} max={100} defaultValue={100}
                className="w-20 rounded border border-[var(--color-line)] bg-white px-2 py-2 text-sm"
                aria-label="percentage"
              />
            </div>
            <div className="flex gap-2">
              <select name="fibre2" className={field} defaultValue="">
                <option value="">— second fibre (optional) —</option>
                {vocab.fibres.map((f) => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
              <input
                name="pct2" type="number" min={0} max={100} defaultValue={0}
                className="w-20 rounded border border-[var(--color-line)] bg-white px-2 py-2 text-sm"
                aria-label="percentage"
              />
            </div>
            <select name="category" className={field} defaultValue="knitwear">
              {vocab.categories.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <select name="construction" className={field} defaultValue="knit">
                {vocab.constructions.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
              <select name="sub_construction" className={field} defaultValue="">
                <option value="">— any —</option>
                {vocab.subConstructions.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>
            <select name="colour_depth" className={field} defaultValue="mid">
              <option value="">— colour not given —</option>
              <option value="white">White</option>
              <option value="light">Light</option>
              <option value="mid">Mid</option>
              <option value="dark">Dark</option>
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="structured" />
              Structured — interfacing, shoulder pads or a lining
            </label>
          </div>
        </fieldset>

        <fieldset>
          <div className={legend}>What happened to it</div>
          <div className="space-y-3">
            <label className="block text-sm">
              Wears since the last wash
              <input
                name="wears" type="number" min={0} max={60} defaultValue={3}
                className={`${field} mt-1`}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="next_to_skin" />
              Worn against skin
            </label>
            <select name="activity" className={field} defaultValue="sedentary">
              <option value="">— activity not given —</option>
              <option value="sedentary">An ordinary day</option>
              <option value="active">Active</option>
              <option value="workout">A workout</option>
            </select>
            <div className="space-y-1.5 pt-1">
              {vocab.soils.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="soil" value={s.id} defaultChecked={s.id === 'none'} />
                  {s.label}
                </label>
              ))}
            </div>
          </div>
        </fieldset>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded bg-[var(--color-ink)] px-4 py-3 text-sm uppercase tracking-[0.14em] text-[var(--color-paper)] disabled:opacity-50"
        >
          {pending ? 'Deciding…' : 'Should I wash it?'}
        </button>
      </form>

      <div className="min-w-0">
        {result === null && (
          <p className="text-sm text-[var(--color-muted)]">
            Describe a garment and what has happened to it. Kept will tell you the least you can
            do about it, and show every rule behind that answer.
          </p>
        )}
        {result?.ok === false && (
          <p className="text-sm text-[var(--color-warn)]">{result.error}</p>
        )}
        {result?.ok && <Result result={result} prose={prose} />}
      </div>
    </div>
  );
}

function Result({
  result,
  prose,
}: {
  result: Extract<DecideResult, { ok: true }>;
  prose: { prose: string; model: string } | null;
}) {
  const { decision, explanation, labels } = result;
  const name = (id: string) => labels[id] ?? id;

  return (
    <article className="space-y-8">
      <header>
        <h2 className="text-4xl font-semibold tracking-tight">{explanation.headline}</h2>
        <p className="mt-2 max-w-prose text-[var(--color-muted)]">{explanation.summary}</p>
        {prose && (
          <p className="mt-4 max-w-prose border-l-2 border-[var(--color-line)] pl-4 text-sm leading-relaxed">
            {prose.prose}
            <span className="mt-1 block text-[11px] text-[var(--color-muted)]">
              Reworded by {prose.model}, and checked against the rules that fired. The rules
              decided; the model only rephrased them.
            </span>
          </p>
        )}
      </header>

      {decision.do_first.length > 0 && (
        <Section title="First">
          <ul className="space-y-1 text-sm">
            {decision.do_first.map((a) => (
              <li key={a}>{name(a)}</li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Why">
        <ul className="space-y-3">
          {explanation.claims.map((claim) => (
            <li key={claim.rule_id} className="max-w-prose text-sm leading-relaxed">
              {claim.text}
              <span className="ml-2 font-mono text-[11px] text-[var(--color-muted)]">
                {claim.rule_id}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      {decision.never_do.length > 0 && (
        <Section title="Never">
          <ul className="space-y-3">
            {decision.never_do.map((c) => (
              <li key={c.rule_id} className="max-w-prose text-sm leading-relaxed">
                <strong className="text-[var(--color-warn)]">{c.never_do}</strong> {c.because}
                <span className="ml-2 font-mono text-[11px] text-[var(--color-muted)]">
                  {c.sources.map((s) => s.id).join(', ')}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <div className="grid gap-8 sm:grid-cols-2">
        <Section title="Drying">
          <p className="text-sm">{name(decision.drying)}</p>
        </Section>
        <Section title="Also fine">
          <p className="text-sm">
            {decision.alternatives.length > 0
              ? decision.alternatives.map(name).join(', ')
              : 'Nothing gentler will do the job.'}
          </p>
        </Section>
      </div>

      <Section title="Impact — estimates, not measurements">
        <p className="max-w-prose text-sm leading-relaxed">
          Relative shedding if washed: <strong>{decision.impact_estimate.relative_shedding}</strong>.{' '}
          {decision.impact_estimate.energy_note}
          {decision.impact_estimate.wears_extended_estimate
            ? ` Roughly ${decision.impact_estimate.wears_extended_estimate} more wears before a wash is indicated.`
            : ''}
        </p>
        <p className="mt-2 max-w-prose text-xs text-[var(--color-muted)]">
          {decision.impact_estimate.method}
        </p>
      </Section>

      {decision.unknowns.length > 0 && (
        <Section title="Worth checking">
          <ul className="space-y-2">
            {decision.unknowns.map((u) => (
              <li key={u} className="max-w-prose text-sm text-[var(--color-muted)]">{u}</li>
            ))}
          </ul>
        </Section>
      )}

      <footer className="border-t border-[var(--color-line)] pt-4 text-xs text-[var(--color-muted)]">
        <p>
          Confidence {decision.confidence}. The most this garment can safely take at home is{' '}
          <strong>{name(decision.ceiling.action)}</strong>, and nothing above that is ever
          recommended.
        </p>
        <p className="mt-2">
          Advisory only and conservative by design. When in doubt, follow the garment’s own label.
          Care symbols are described in words here — the official symbol artwork is trademarked and
          is not reproduced.
        </p>
      </footer>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className={legend}>{title}</h3>
      {children}
    </section>
  );
}
