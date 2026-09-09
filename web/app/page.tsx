import { DecisionForm } from './decision-form';
import { vocabulary } from './actions';

export default async function Page() {
  const vocab = await vocabulary();

  return (
    <main className="mx-auto max-w-7xl px-6 py-12 sm:py-16">
      <header className="mb-9">
        <p className="eyebrow">Kept</p>
        <h1 className="display mt-3 text-3xl leading-[1.15] sm:text-[2.6rem]">
          Should you wash it — or is there a better answer?
        </h1>
        <p className="mt-4 text-[17px] leading-relaxed text-[var(--color-muted)]">
          A care label tells you what won't get the brand sued. It doesn't tell you whether the
          jumper you've worn three times needs washing today. That depends on the fibre, how the
          cloth is made, and what's actually on it.
        </p>
      </header>

      <DecisionForm vocab={vocab} />
    </main>
  );
}
