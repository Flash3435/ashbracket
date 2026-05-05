import type { Round1UserSummary } from "@/lib/nhl/nhlPicksProgression";
import Link from "next/link";

export function NhlPicksRoundSummary({
  isAuthenticated,
  round1Complete,
  round2Open,
  picksLocked,
  summary,
  r2PicksLoadError,
  totalPoolPoints,
}: {
  isAuthenticated: boolean;
  round1Complete: boolean;
  round2Open: boolean;
  picksLocked: boolean;
  summary: Round1UserSummary | null;
  r2PicksLoadError: string | null;
  /** Optional: user’s total points across rounds from standings RPC (includes R2+ when scored). */
  totalPoolPoints: number | null;
}) {
  if (!isAuthenticated) {
    return (
      <div className="rounded-2xl border border-blue-500/20 bg-slate-950/50 px-5 py-5 sm:px-6">
        <h2 className="text-base font-semibold text-ash-text">Your Round 1 results</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          Sign in to see your Round 1 record, points from correct picks, and Round 2 entry once the
          bracket opens.
        </p>
      </div>
    );
  }

  if (!summary) {
    return null;
  }

  if (summary.totalSeries === 0) {
    return (
      <div className="rounded-2xl border border-blue-500/20 bg-slate-950/50 px-5 py-5 sm:px-6">
        <h2 className="text-base font-semibold text-ash-text">Your Round 1 results</h2>
        <p className="mt-2 text-sm text-slate-400">
          Round 1 series are not configured for this edition yet, so there is nothing to score.
        </p>
      </div>
    );
  }

  const { correctCount, incorrectCount, resolvedSeries, totalSeries, round1PointsEarned, pickedSeries, pendingPickCount, noPickResolvedCount } =
    summary;

  const denom = resolvedSeries > 0 ? resolvedSeries : totalSeries;

  return (
    <div className="rounded-2xl border border-blue-500/20 bg-slate-950/50 px-5 py-5 sm:px-6">
      <h2 className="text-base font-semibold text-ash-text">Your Round 1 results</h2>

      <div className="mt-3 flex flex-wrap gap-2">
        <span className="inline-flex items-center rounded-full border border-slate-500/35 bg-slate-900/50 px-3 py-1 text-xs font-medium text-slate-200/95">
          {round1Complete ? "Round 1 complete" : "Round 1 in progress"}
        </span>
        {round2Open && !picksLocked ? (
          <span className="inline-flex items-center rounded-full border border-violet-500/35 bg-violet-950/35 px-3 py-1 text-xs font-medium text-violet-100/95">
            Round 2 picks are open
          </span>
        ) : round1Complete && picksLocked ? (
          <span className="inline-flex items-center rounded-full border border-amber-500/35 bg-amber-950/25 px-3 py-1 text-xs font-medium text-amber-100/95">
            Pool locked — review only
          </span>
        ) : round1Complete ? (
          <span className="inline-flex items-center rounded-full border border-slate-500/30 bg-slate-900/40 px-3 py-1 text-xs font-medium text-slate-300/95">
            Round 2 unlocks below when matchups are ready
          </span>
        ) : null}
      </div>

      <div className="mt-4 space-y-2 text-sm leading-relaxed text-slate-300">
        {resolvedSeries > 0 ? (
          <p>
            <span className="font-semibold text-slate-100">
              {correctCount} / {denom} correct
            </span>{" "}
            on decided Round 1 series
            {incorrectCount > 0 ? (
              <span className="text-slate-500">
                {" "}
                ({incorrectCount} incorrect{noPickResolvedCount > 0 ? `; ${noPickResolvedCount} missed` : ""})
              </span>
            ) : noPickResolvedCount > 0 ? (
              <span className="text-slate-500"> ({noPickResolvedCount} series with no pick)</span>
            ) : null}
            .
          </p>
        ) : pickedSeries > 0 ? (
          <p>
            You have picks on {pickedSeries} series{pendingPickCount > 0 ? "; results are still pending." : "."}
          </p>
        ) : (
          <p>You have not saved any Round 1 picks yet. Choose a winner on each card below.</p>
        )}

        {resolvedSeries > 0 ? (
          <p className="text-slate-400">
            Round 1 points earned:{" "}
            <span className="font-medium text-emerald-200/95">{round1PointsEarned}</span> (1 point per
            correct Round 1 series, same weight as the standings leaderboard).
          </p>
        ) : null}

        {totalPoolPoints !== null ? (
          <p className="text-slate-500">
            Points on the leaderboard (all rounds scored so far):{" "}
            <span className="font-medium text-slate-300">{totalPoolPoints}</span> — see{" "}
            <Link href="/nhl/standings" className="text-blue-300 underline-offset-2 hover:underline">
              standings
            </Link>{" "}
            for the full breakdown.
          </p>
        ) : null}

        {resolvedSeries > 0 &&
        round1PointsEarned > 0 &&
        totalPoolPoints !== null &&
        totalPoolPoints === 0 ? (
          <p className="rounded-lg border border-amber-500/25 bg-amber-950/20 px-3 py-2 text-xs leading-relaxed text-amber-100/90 sm:text-sm">
            Your Round 1 summary uses the <span className="font-medium">latest public playoff results</span>{" "}
            so you can see how you did as soon as games end.{" "}
            <span className="font-medium">Leaderboard points</span> use results saved to this pool and
            usually catch up within a refresh. If the leaderboard still looks behind, the site may not
            have finished saving official finals yet—try again shortly, or ask an organizer to run{" "}
            <span className="font-medium">Sync official Round 1 results</span> under{" "}
            <Link href="/nhl/admin/series" className="text-blue-300 underline-offset-2 hover:underline">
              NHL admin → Series
            </Link>
            .
          </p>
        ) : null}
      </div>

      {r2PicksLoadError ? (
        <p className="mt-3 text-xs text-amber-200/90">
          Round 2 pick storage is unavailable ({r2PicksLoadError}). Apply the latest NHL migration that
          adds <code className="rounded bg-slate-900/80 px-1">nhl_r2_series_picks</code>, then refresh.
        </p>
      ) : null}
    </div>
  );
}
