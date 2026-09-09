import { DecisionForm } from './decision-form';
import { vocabulary } from './actions';

export default async function Page() {
  const vocab = await vocabulary();

  return (
    <main className="mx-auto max-w-6xl px-6 py-14">
      <header className="mb-12 max-w-prose">
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--color-muted)]">Kept</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          Should you wash it — or is there a better answer?
        </h1>
        <p className="mt-4 leading-relaxed text-[var(--color-muted)]">
          Every care app answers <em>what do these symbols mean</em>. A care label is the
          manufacturer’s liability floor, not care advice. This answers the question you actually
          have: you’ve worn this three times and it doesn’t smell — do you wash it?
        </p>
      </header>

      <DecisionForm vocab={vocab} />
    </main>
  );
}
