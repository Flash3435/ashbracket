import Link from "next/link";

export function HomeHero() {
  return (
    <section
      className="w-full border-b border-ash-border bg-ash-body px-4 py-14 sm:py-16"
      aria-label="Welcome"
    >
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="text-4xl font-bold tracking-tight text-ash-text sm:text-5xl">
          AshBracket
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-ash-muted sm:text-lg">
          Run your own World Cup pool. Track standings. Crown a winner.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/join" className="btn-primary">
            Join the Pool
          </Link>
          <Link href="/rules" className="btn-ghost">
            View Rules
          </Link>
        </div>
      </div>
    </section>
  );
}
