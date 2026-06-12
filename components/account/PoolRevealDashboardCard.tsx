import Link from "next/link";

type Props = {
  locked: boolean;
  revealHref: string;
  picksHref: string;
  deadlineLabel: string | null;
  viewerPicksComplete: boolean;
};

export function poolRevealDashboardCopy(locked: boolean): {
  title: string;
  body: string;
  cta: string;
} {
  if (locked) {
    return {
      title: "Compare brackets",
      body: "Browse everyone's locked picks, then see champion trends and how the pool split.",
      cta: "See everyone's picks",
    };
  }
  return {
    title: "Picks reveal after lock",
    body: "Preview champion trends once the deadline passes — full reveal unlocks at lock.",
    cta: "Preview reveal",
  };
}

export function PoolRevealDashboardCard({
  locked,
  revealHref,
  picksHref,
  deadlineLabel,
  viewerPicksComplete,
}: Props) {
  const copy = poolRevealDashboardCopy(locked);

  return (
    <section className="rounded-xl border border-ash-border bg-ash-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-ash-text">{copy.title}</h2>
          <p className="mt-0.5 text-xs text-ash-muted">{copy.body}</p>
        </div>
        <Link
          href={revealHref}
          className={
            locked
              ? "btn-primary inline-flex shrink-0 text-sm"
              : "btn-ghost inline-flex shrink-0 text-sm ring-1 ring-ash-border"
          }
        >
          {copy.cta}
        </Link>
      </div>

      {!locked ? (
        <div className="mt-3 space-y-2">
          {deadlineLabel ? (
            <p className="text-sm text-ash-text">
              Pick deadline:{" "}
              <span className="font-medium">{deadlineLabel}</span>
            </p>
          ) : null}
          {!viewerPicksComplete ? (
            <p className="text-sm text-amber-100">
              Finish your bracket before the deadline.{" "}
              <Link
                href={picksHref}
                className="font-medium text-ash-accent underline"
              >
                Finish your picks
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
