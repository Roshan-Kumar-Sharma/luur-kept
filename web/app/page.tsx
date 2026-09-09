import { DecisionForm } from './decision-form';
import { vocabulary } from './actions';

export default async function Page() {
  const vocab = await vocabulary();

  return (
    <main className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
      <header className="mb-12 border-b border-[var(--color-line)] pb-10 sm:mb-14">
        <p className="eyebrow">Kept</p>
        <h1 className="display mt-3 max-w-3xl text-3xl leading-[1.15] sm:text-[2.75rem]">
          Should you wash it — or is there a better answer?
        </h1>
        <div className="mt-5 grid max-w-4xl gap-x-12 gap-y-3 text-[15px] leading-relaxed text-[var(--color-muted)] md:grid-cols-2">
          <p>
            Every other care app answers <em>what do these symbols mean</em>. But a care label is
            the manufacturer's liability floor, not care advice — “dry clean only” is routinely
            defensive over-caution.
          </p>
          <p>
            This answers the question you actually have: you've worn it three times and it doesn't
            smell, so do you wash it? That depends on the fibre, how the cloth is made, and what is
            actually on it.
          </p>
        </div>
      </header>

      <DecisionForm vocab={vocab} />
    </main>
  );
}
