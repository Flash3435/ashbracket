import Link from "next/link";

const STEPS = [
  {
    n: 1,
    title: "Verify live pool snapshot",
    body: "On Production pilot, save a pre-pilot standings snapshot for each live pool you care about.",
    href: "/admin/pilot",
  },
  {
    n: 2,
    title: "Create simulation pool",
    body: "Use the form below. Confirm on production before creating.",
    href: null,
  },
  {
    n: 3,
    title: "Use test accounts only",
    body: "Join and pick with dedicated test users — not real money-pool people.",
    href: null,
  },
  {
    n: 4,
    title: "Enter fake picks and results",
    body: "Test results only — never Live tournament results during the pilot.",
    href: null,
  },
  {
    n: 5,
    title: "Recompute simulation standings",
    body: "Recalculate simulation pool leaderboards from test data.",
    href: null,
  },
  {
    n: 6,
    title: "Confirm live pool unchanged",
    body: "Compare live standings to your pre-pilot snapshot on the pilot page.",
    href: "/admin/pilot",
  },
  {
    n: 7,
    title: "Do not enable simulation email unless truly needed",
    body: "Production blocks simulation-pool email by default. Skip email until isolation is verified.",
    href: "/admin/pilot",
  },
] as const;

export function PilotRunOrderPanel() {
  return (
    <section className="ash-surface p-4">
      <h2 className="text-sm font-bold text-ash-text">Recommended pilot order</h2>
      <p className="mt-1 text-sm text-ash-muted">
        Follow these steps for a safe first production simulation test.
      </p>
      <ol className="mt-4 space-y-3">
        {STEPS.map((s) => (
          <li key={s.n} className="flex gap-3 text-sm">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ash-accent/20 text-xs font-bold text-ash-accent">
              {s.n}
            </span>
            <div>
              <p className="font-medium text-ash-text">{s.title}</p>
              <p className="mt-0.5 text-ash-muted">{s.body}</p>
              {s.href ? (
                <Link href={s.href} className="ash-link mt-1 inline-block text-xs">
                  Open pilot checklist →
                </Link>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
