import Link from "next/link";
import { LEADERBOARD_AWARDED_POINTS_NOTE } from "@/lib/leaderboard/buildPoolStandingsFromLedger";

type Props = {
  revealHref?: string | null;
};

export function LeaderboardPostLockIntro({ revealHref }: Props) {
  return (
    <section className="rounded-xl border border-emerald-500/25 bg-emerald-950/20 px-4 py-4 sm:px-5">
      <p className="text-sm leading-relaxed text-ash-text">
        {LEADERBOARD_AWARDED_POINTS_NOTE}
      </p>
      {revealHref ? (
        <p className="mt-2 text-sm">
          <Link href={revealHref} className="ash-link font-medium">
            See everyone&apos;s picks
          </Link>
          <span className="text-ash-muted"> — compare everyone&apos;s brackets</span>
        </p>
      ) : null}
    </section>
  );
}
