import type { Round1UserSummary, Round2UserSummary } from "@/lib/nhl/nhlPicksProgression";
import Link from "next/link";

export function NhlPicksRoundSummary({
  isAuthenticated,
  round1Complete,
  round2Open,
  picksLocked,
  r1Summary,
  r2Summary,
  r2PicksLoadError,
  totalPoints,
  round2PointsFromStandings,
}: {
  isAuthenticated: boolean;
  round1Complete: boolean;
  round2Open: boolean;
  picksLocked: boolean;
  r1Summary: Round1UserSummary | null;
  r2Summary: Round2UserSummary | null;
  r2PicksLoadError: string | null;
  totalPoints: number | null;
  round2PointsFromStandings: number | null;
}) {
  if (!isAuthenticated) {
    return (
      <div className="rounded-2xl border border-blue-500/20 bg-slate-950/50 px-5 py-5 sm:px-6">
        <h2 className="text-base font-semibold text-ash-text">Your results</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          Sign in and join the competition from your account page to see your round-by-round record
          and leaderboard points.
        </p>
        <Link href="/nhl/account" className="btn-ghost mt-3 inline-flex text-sm no-underline">
          NHL account
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {r1Summary && r1Summary.totalSeries > 0 ? (
        <Round1SummaryBlock
          summary={r1Summary}
          round1Complete={round1Complete}
          round2Open={round2Open}
          picksLocked={picksLocked}
          totalPoints={totalPoints}
        />
      ) : null}

      {round1Complete && r2Summary && r2Summary.totalSeries > 0 ? (
        <Round2SummaryBlock
          summary={r2Summary}
          round2PointsFromStandings={round2PointsFromStandings}
          totalPoints={totalPoints}
        />
      ) : null}

      {r2PicksLoadError ? (
        <p className="rounded-xl border border-amber-500/25 bg-amber-950/20 px-4 py-3 text-xs text-amber-200/90 sm:text-sm">
          Round 2 pick storage is unavailable ({r2PicksLoadError}). Apply the latest NHL migration,
          then refresh.
        </p>
      ) : null}
    </div>
  );
}

function Round1SummaryBlock({
  summary,
  round1Complete,
  round2Open,
  picksLocked,
  totalPoints,
}: {
  summary: Round1UserSummary;
  round1Complete: boolean;
  round2Open: boolean;
  picksLocked: boolean;
  totalPoints: number | null;
}) {
  const {
    correctCount,
    incorrectCount,
    resolvedSeries,
    totalSeries,
    round1PointsEarned,
    pickedSeries,
    pendingPickCount,
    noPickResolvedCount,
  } = summary;
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
            Round 2 picks open
          </span>
        ) : null}
      </div>
      <div className="mt-4 space-y-2 text-sm leading-relaxed text-slate-300">
        {resolvedSeries > 0 ? (
          <p>
            <span className="font-semibold text-slate-100">
              {correctCount} / {denom} correct
            </span>{" "}
            on decided Round 1 series.
          </p>
        ) : pickedSeries > 0 ? (
          <p>
            You have picks on {pickedSeries} series
            {pendingPickCount > 0 ? "; results are still pending." : "."}
          </p>
        ) : (
          <p>No Round 1 picks saved yet.</p>
        )}
        {resolvedSeries > 0 ? (
          <p className="text-slate-400">
            Round 1 points:{" "}
            <span className="font-medium text-emerald-200/95">{round1PointsEarned}</span>
            {incorrectCount > 0 || noPickResolvedCount > 0 ? (
              <span className="text-slate-500">
                {" "}
                ({incorrectCount} wrong
                {noPickResolvedCount > 0 ? `, ${noPickResolvedCount} missed` : ""})
              </span>
            ) : null}
          </p>
        ) : null}
        {totalPoints !== null ? (
          <p className="text-slate-500">
            Leaderboard total: <span className="font-medium text-slate-300">{totalPoints}</span> —{" "}
            <Link href="/nhl/standings" className="text-blue-300 underline-offset-2 hover:underline">
              standings
            </Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Round2SummaryBlock({
  summary,
  round2PointsFromStandings,
  totalPoints,
}: {
  summary: Round2UserSummary;
  round2PointsFromStandings: number | null;
  totalPoints: number | null;
}) {
  const { correctCount, resolvedSeries, totalSeries, round2PointsEarned, pickedSeries } = summary;
  const denom = resolvedSeries > 0 ? resolvedSeries : totalSeries;
  const standingsR2 = round2PointsFromStandings ?? round2PointsEarned;

  return (
    <div className="rounded-2xl border border-violet-500/20 bg-slate-950/50 px-5 py-5 sm:px-6">
      <h2 className="text-base font-semibold text-ash-text">Your Round 2 results</h2>
      <div className="mt-4 space-y-2 text-sm leading-relaxed text-slate-300">
        {resolvedSeries > 0 ? (
          <p>
            <span className="font-semibold text-slate-100">
              {correctCount} / {denom} correct
            </span>{" "}
            on decided Round 2 series.
          </p>
        ) : pickedSeries > 0 ? (
          <p>You have Round 2 picks saved; series results are still pending.</p>
        ) : (
          <p>No Round 2 picks saved yet.</p>
        )}
        <p className="text-slate-400">
          Round 2 points (standings):{" "}
          <span className="font-medium text-emerald-200/95">{standingsR2}</span> (2 points per correct
          series, from saved edition results).
        </p>
        {totalPoints !== null ? (
          <p className="text-slate-500">
            Overall leaderboard total:{" "}
            <span className="font-medium text-slate-300">{totalPoints}</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
