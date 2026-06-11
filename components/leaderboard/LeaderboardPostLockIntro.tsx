import Link from "next/link";

type Props = {
  revealHref?: string | null;
};

export function LeaderboardPostLockIntro({ revealHref }: Props) {
  return (
    <section className="rounded-xl border border-emerald-500/25 bg-emerald-950/20 px-4 py-4 sm:px-5">
      <p className="text-sm leading-relaxed text-ash-text">
        Picks are locked. Standings will update as results are entered.
      </p>
      {revealHref ? (
        <p className="mt-2 text-sm">
          <Link href={revealHref} className="ash-link font-medium">
            Reveal picks
          </Link>
          <span className="text-ash-muted"> — compare everyone&apos;s brackets</span>
        </p>
      ) : null}
    </section>
  );
}
