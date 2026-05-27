import type {
  ConferenceFinalUserSummary,
  Round1UserSummary,
  Round2UserSummary,
  StanleyCupFinalUserSummary,
} from "@/lib/nhl/nhlPicksProgression";
import Link from "next/link";

export function NhlPicksRoundSummary({
  isAuthenticated,
  round1Complete,
  round2Open,
  picksLocked,
  r1Summary,
  r2Summary,
  r2PicksLoadError,
  r1LinkageBroken,
  r2LinkageBroken,
  r1LegacyUnresolved,
  r2LegacyUnresolved,
  totalPoints,
  round2PointsFromStandings,
  round2Complete,
  cfSummary,
  scfSummary,
  cfPicksLoadError,
  scfPicksLoadError,
  conferenceFinalPointsFromStandings,
  stanleyCupFinalPointsFromStandings,
  cfLinkageBroken,
  scfLinkageBroken,
  cfLegacyUnresolved,
  scfLegacyUnresolved,
}: {
  isAuthenticated: boolean;
  round1Complete: boolean;
  round2Open: boolean;
  round2Complete?: boolean;
  picksLocked: boolean;
  r1Summary: Round1UserSummary | null;
  r2Summary: Round2UserSummary | null;
  cfSummary?: ConferenceFinalUserSummary | null;
  scfSummary?: StanleyCupFinalUserSummary | null;
  r2PicksLoadError: string | null;
  cfPicksLoadError?: string | null;
  scfPicksLoadError?: string | null;
  r1LinkageBroken?: boolean;
  r2LinkageBroken?: boolean;
  cfLinkageBroken?: boolean;
  scfLinkageBroken?: boolean;
  r1LegacyUnresolved?: boolean;
  r2LegacyUnresolved?: boolean;
  cfLegacyUnresolved?: boolean;
  scfLegacyUnresolved?: boolean;
  totalPoints: number | null;
  round2PointsFromStandings: number | null;
  conferenceFinalPointsFromStandings?: number | null;
  stanleyCupFinalPointsFromStandings?: number | null;
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
      {r1LinkageBroken || r1LegacyUnresolved ? (
        <PickLinkageNotice roundLabel="Round 1" unresolved={Boolean(r1LegacyUnresolved)} />
      ) : null}

      {r1Summary && r1Summary.totalSeries > 0 ? (
        <Round1SummaryBlock
          summary={r1Summary}
          round1Complete={round1Complete}
          round2Open={round2Open}
          picksLocked={picksLocked}
          linkageBroken={Boolean(r1LinkageBroken)}
          totalPoints={totalPoints}
        />
      ) : null}

      {round1Complete && r2Summary && r2Summary.totalSeries > 0 ? (
        <Round2SummaryBlock
          summary={r2Summary}
          linkageBroken={Boolean(r2LinkageBroken)}
          round2PointsFromStandings={round2PointsFromStandings}
          totalPoints={totalPoints}
        />
      ) : null}

      {round1Complete && (r2LinkageBroken || r2LegacyUnresolved) ? (
        <PickLinkageNotice roundLabel="Round 2" unresolved={Boolean(r2LegacyUnresolved)} />
      ) : null}

      {round2Complete && cfSummary && cfSummary.totalSeries > 0 ? (
        <ConferenceFinalSummaryBlock
          summary={cfSummary}
          linkageBroken={Boolean(cfLinkageBroken)}
          conferenceFinalPointsFromStandings={conferenceFinalPointsFromStandings ?? null}
        />
      ) : null}

      {round2Complete && scfSummary && scfSummary.totalSeries > 0 ? (
        <StanleyCupFinalSummaryBlock
          summary={scfSummary}
          linkageBroken={Boolean(scfLinkageBroken)}
          stanleyCupFinalPointsFromStandings={stanleyCupFinalPointsFromStandings ?? null}
        />
      ) : null}

      {round2Complete && (cfLinkageBroken || cfLegacyUnresolved) ? (
        <PickLinkageNotice roundLabel="Conference Finals" unresolved={Boolean(cfLegacyUnresolved)} />
      ) : null}

      {round2Complete && (scfLinkageBroken || scfLegacyUnresolved) ? (
        <PickLinkageNotice roundLabel="Stanley Cup Final" unresolved={Boolean(scfLegacyUnresolved)} />
      ) : null}

      {r2PicksLoadError ? (
        <p className="rounded-xl border border-amber-500/25 bg-amber-950/20 px-4 py-3 text-xs text-amber-200/90 sm:text-sm">
          Round 2 picks could not be loaded. Try refreshing the page after signing in.
        </p>
      ) : null}

      {cfPicksLoadError ? (
        <p className="rounded-xl border border-amber-500/25 bg-amber-950/20 px-4 py-3 text-xs text-amber-200/90 sm:text-sm">
          Conference Finals picks could not be loaded. Try refreshing the page after signing in.
        </p>
      ) : null}

      {scfPicksLoadError ? (
        <p className="rounded-xl border border-amber-500/25 bg-amber-950/20 px-4 py-3 text-xs text-amber-200/90 sm:text-sm">
          Stanley Cup Final pick could not be loaded. Try refreshing the page after signing in.
        </p>
      ) : null}
    </div>
  );
}

function PickLinkageNotice({
  roundLabel,
  unresolved,
}: {
  roundLabel: string;
  unresolved: boolean;
}) {
  return (
    <p className="rounded-xl border border-amber-500/30 bg-amber-950/25 px-4 py-3 text-sm leading-relaxed text-amber-100/95">
      {unresolved ? (
        <>
          We found older {roundLabel} picks from a previous playoff setup that could not be matched
          to the current bracket. If something looks wrong, contact support or re-save your picks
          while the window is open.
        </>
      ) : (
        <>
          Some saved {roundLabel} picks may still be syncing to the current bracket. Refresh the
          page in a moment; if cards stay empty, try saving again while picks are open.
        </>
      )}
    </p>
  );
}

function Round1SummaryBlock({
  summary,
  round1Complete,
  round2Open,
  picksLocked,
  linkageBroken,
  totalPoints,
}: {
  summary: Round1UserSummary;
  round1Complete: boolean;
  round2Open: boolean;
  picksLocked: boolean;
  linkageBroken: boolean;
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
        ) : linkageBroken ? (
          <p className="text-amber-200/90">
            Saved Round 1 picks could not be matched to the current bracket (this is not the same as
            having no picks).
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
  linkageBroken,
  round2PointsFromStandings,
  totalPoints,
}: {
  summary: Round2UserSummary;
  linkageBroken: boolean;
  round2PointsFromStandings: number | null;
  totalPoints: number | null;
}) {
  const { correctCount, resolvedSeries, totalSeries, round2PointsEarned, pickedSeries } = summary;
  const denom = resolvedSeries > 0 ? resolvedSeries : totalSeries;
  const standingsR2 =
    round2PointsFromStandings != null && round2PointsFromStandings > 0
      ? round2PointsFromStandings
      : round2PointsEarned;

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
        ) : linkageBroken ? (
          <p className="text-amber-200/90">
            Saved Round 2 picks could not be matched to the current bracket (this is not the same as
            having no picks).
          </p>
        ) : (
          <p>No Round 2 picks saved yet.</p>
        )}
        <p className="text-slate-400">
          Round 2 points on the leaderboard:{" "}
          <span className="font-medium text-emerald-200/95">{standingsR2}</span> (2 points per correct
          series).
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

function ConferenceFinalSummaryBlock({
  summary,
  linkageBroken,
  conferenceFinalPointsFromStandings,
}: {
  summary: ConferenceFinalUserSummary;
  linkageBroken: boolean;
  conferenceFinalPointsFromStandings: number | null;
}) {
  const {
    correctCount,
    resolvedSeries,
    totalSeries,
    conferenceFinalPointsEarned,
    pickedSeries,
  } = summary;
  const denom = resolvedSeries > 0 ? resolvedSeries : totalSeries;
  const standingsCf =
    conferenceFinalPointsFromStandings != null && conferenceFinalPointsFromStandings > 0
      ? conferenceFinalPointsFromStandings
      : conferenceFinalPointsEarned;

  return (
    <div className="rounded-2xl border border-amber-500/20 bg-slate-950/50 px-5 py-5 sm:px-6">
      <h2 className="text-base font-semibold text-ash-text">Your Conference Finals results</h2>
      <div className="mt-4 space-y-2 text-sm leading-relaxed text-slate-300">
        {resolvedSeries > 0 ? (
          <p>
            <span className="font-semibold text-slate-100">
              {correctCount} / {denom} correct
            </span>{" "}
            on decided Conference Finals series.
          </p>
        ) : pickedSeries > 0 ? (
          <p>You have Conference Finals picks saved; series results are still pending.</p>
        ) : linkageBroken ? (
          <p className="text-amber-200/90">
            Saved Conference Finals picks could not be matched to the current bracket.
          </p>
        ) : (
          <p>No Conference Finals picks saved yet.</p>
        )}
        <p className="text-slate-400">
          Conference Finals points on the leaderboard:{" "}
          <span className="font-medium text-emerald-200/95">{standingsCf}</span> (4 points per
          correct series).
        </p>
      </div>
    </div>
  );
}

function StanleyCupFinalSummaryBlock({
  summary,
  linkageBroken,
  stanleyCupFinalPointsFromStandings,
}: {
  summary: StanleyCupFinalUserSummary;
  linkageBroken: boolean;
  stanleyCupFinalPointsFromStandings: number | null;
}) {
  const { correctCount, resolvedSeries, stanleyCupFinalPointsEarned, pickedSeries } = summary;
  const standingsScf =
    stanleyCupFinalPointsFromStandings != null && stanleyCupFinalPointsFromStandings > 0
      ? stanleyCupFinalPointsFromStandings
      : stanleyCupFinalPointsEarned;

  return (
    <div className="rounded-2xl border border-yellow-500/20 bg-slate-950/50 px-5 py-5 sm:px-6">
      <h2 className="text-base font-semibold text-ash-text">Your Stanley Cup Final result</h2>
      <div className="mt-4 space-y-2 text-sm leading-relaxed text-slate-300">
        {resolvedSeries > 0 ? (
          <p>
            <span className="font-semibold text-slate-100">{correctCount} / 1 correct</span> on the
            Stanley Cup Final.
          </p>
        ) : pickedSeries > 0 ? (
          <p>Your Stanley Cup winner pick is saved; the series result is still pending.</p>
        ) : linkageBroken ? (
          <p className="text-amber-200/90">
            Saved Stanley Cup Final pick could not be matched to the current bracket.
          </p>
        ) : (
          <p>No Stanley Cup winner pick saved yet.</p>
        )}
        <p className="text-slate-400">
          Stanley Cup Final points on the leaderboard:{" "}
          <span className="font-medium text-emerald-200/95">{standingsScf}</span> (8 points when
          correct).
        </p>
      </div>
    </div>
  );
}
