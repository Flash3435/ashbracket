import Link from "next/link";

const howItWorksSteps = [
  {
    title: "Create your pool",
    body: "Set up a private pool for your group in minutes.",
  },
  {
    title: "Invite your group",
    body: "Share a simple link so people can join when they’re ready.",
  },
  {
    title: "Everyone makes their picks",
    body: "Participants walk through guided steps to lock in their bracket.",
  },
  {
    title: "Follow the standings during the tournament",
    body: "See how everyone stacks up as matches play out.",
  },
] as const;

const whyCards = [
  {
    title: "Private pools only",
    body: "Your competition stays with the people you invite — not the whole internet.",
  },
  {
    title: "Easy invites and reminders",
    body: "Share one link and nudge people who still need to submit picks.",
  },
  {
    title: "Clear rules and standings",
    body: "Everyone sees the same scoring rules and updated results in one place.",
  },
  {
    title: "Simple for casual fans",
    body: "No spreadsheets or side chats required — just picks and fun.",
  },
] as const;

const organizerBullets = [
  "Create and manage your pool",
  "Invite participants with a simple link",
  "Track who has joined and completed picks",
  "Control deadlines and settings",
] as const;

const playerBullets = [
  "Join a pool quickly",
  "Make picks with guided steps",
  "Follow the tournament and your progress",
  "Compete with friends, family, or coworkers",
] as const;

function StepNumber({ n }: { n: number }) {
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ash-accent text-sm font-semibold text-white"
      aria-hidden
    >
      {n}
    </span>
  );
}

export function HomeMarketingSections() {
  return (
    <div className="flex flex-col gap-14 sm:gap-16">
      <section id="how-it-works" aria-labelledby="how-heading" className="scroll-mt-24">
        <h2 id="how-heading" className="text-xl font-bold text-ash-text sm:text-2xl">
          How it works
        </h2>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-ash-muted">
          AshBracket makes it easy to run a private pool from start to finish.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {howItWorksSteps.map((step, i) => (
            <div key={step.title} className="ash-surface flex gap-4 p-4 sm:p-5">
              <StepNumber n={i + 1} />
              <div>
                <h3 className="text-base font-semibold text-ash-text">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ash-muted">{step.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="why-heading">
        <h2 id="why-heading" className="text-xl font-bold text-ash-text sm:text-2xl">
          Why AshBracket
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {whyCards.map((card) => (
            <div key={card.title} className="ash-surface p-4 sm:p-5">
              <h3 className="text-base font-semibold text-ash-text">{card.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ash-muted">{card.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="audience-heading">
        <h2 id="audience-heading" className="sr-only">
          Organizers and players
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="ash-surface p-5 sm:p-6">
            <h3 className="text-lg font-bold text-ash-text">For organizers</h3>
            <ul className="mt-4 list-inside list-disc space-y-2 text-sm leading-relaxed text-ash-muted">
              {organizerBullets.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="ash-surface p-5 sm:p-6">
            <h3 className="text-lg font-bold text-ash-text">For players</h3>
            <ul className="mt-4 list-inside list-disc space-y-2 text-sm leading-relaxed text-ash-muted">
              {playerBullets.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section
        className="ash-surface px-5 py-10 text-center sm:px-8 sm:py-12"
        aria-labelledby="final-cta-heading"
      >
        <h2 id="final-cta-heading" className="text-xl font-bold text-ash-text sm:text-2xl">
          Ready to start your pool?
        </h2>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-ash-muted sm:text-base">
          Set up your private World Cup pool and invite your group in minutes.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/admin" className="btn-primary">
            Create a Pool
          </Link>
          <Link href="/join" className="btn-ghost">
            Join a Pool
          </Link>
        </div>
      </section>
    </div>
  );
}
