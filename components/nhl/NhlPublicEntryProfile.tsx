import {
  buildNhlPublicRoundSummaries,
  formatNhlPublicEntrySlotLabel,
  formatNhlPublicMatchup,
  formatNhlPublicTeamLabel,
  type NhlPublicEntryDetail,
  type NhlPublicEntryPickRow,
  type NhlPublicPickOutcome,
} from "@/lib/nhl/publicEntryDetail";
import { labelNhlStandingsStatus } from "@/lib/nhl/standingsLabels";
import Link from "next/link";

function outcomeBadge(outcome: NhlPublicPickOutcome) {
  if (outcome === "correct") {
    return (
      <span className="inline-flex rounded-full border border-emerald-500/40 bg-emerald-950/50 px-2.5 py-0.5 text-xs font-semibold text-emerald-200">
        Correct
      </span>
    );
  }
  if (outcome === "incorrect") {
    return (
      <span className="inline-flex rounded-full border border-red-500/35 bg-red-950/40 px-2.5 py-0.5 text-xs font-semibold text-red-200">
        Incorrect
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full border border-slate-500/40 bg-slate-900/60 px-2.5 py-0.5 text-xs font-semibold text-slate-300">
      Pending
    </span>
  );
}

function groupPicksByRound(picks: NhlPublicEntryPickRow[]) {
  const order: NhlPublicEntryPickRow["roundCode"][] = ["R1", "R2", "CF", "SCF"];
  const labels: Record<NhlPublicEntryPickRow["roundCode"], string> = {
    R1: "Round 1",
    R2: "Round 2",
    CF: "Conference Final",
    SCF: "Stanley Cup Final",
  };
  const byRound = new Map<NhlPublicEntryPickRow["roundCode"], NhlPublicEntryPickRow[]>();
  for (const p of picks) {
    const list = byRound.get(p.roundCode) ?? [];
    list.push(p);
    byRound.set(p.roundCode, list);
  }
  return order
    .filter((code) => (byRound.get(code)?.length ?? 0) > 0)
    .map((code) => ({
      roundCode: code,
      label: labels[code],
      picks: byRound.get(code) ?? [],
    }));
}

export function NhlPublicEntryProfile({ detail }: { detail: NhlPublicEntryDetail }) {
  const { standings } = detail;
  const roundSummaries =
    detail.roundSummaries.length > 0
      ? detail.roundSummaries
      : buildNhlPublicRoundSummaries(detail.picks, standings);
  const roundSections = groupPicksByRound(detail.picks);

  return (
    <div className="space-y-8">
      <Link
        href="/nhl/standings"
        className="inline-flex text-sm text-blue-300 underline-offset-2 hover:underline"
      >
        ← Back to standings
      </Link>

      <div className="rounded-2xl border border-blue-500/20 bg-slate-950/50 px-5 py-5 sm:px-6">
        <p className="text-sm text-slate-400">
          {detail.editionName}
          {detail.seasonLabel ? ` · ${detail.seasonLabel}` : ""}
        </p>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Overall rank
            </dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums text-slate-100">
              {standings.rank}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Total points
            </dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums text-slate-100">
              {standings.total_points}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Correct picks
            </dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums text-slate-100">
              {standings.correct_picks}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Status
            </dt>
            <dd className="mt-0.5 text-sm font-medium text-slate-200">
              {labelNhlStandingsStatus(standings.status)}
            </dd>
          </div>
        </dl>
      </div>

      {roundSummaries.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-ash-text">Round summaries</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {roundSummaries.map((summary) => (
              <div
                key={summary.roundCode}
                className="rounded-xl border border-blue-500/20 bg-slate-950/45 px-4 py-3"
              >
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {summary.label}
                </p>
                <p className="mt-1 text-sm text-slate-200">
                  {summary.decidedCount > 0 ? (
                    <>
                      <span className="font-semibold text-slate-100">
                        {summary.correctCount} / {summary.decidedCount}
                      </span>{" "}
                      correct
                    </>
                  ) : (
                    <span className="text-slate-400">No decided series yet</span>
                  )}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Points on leaderboard:{" "}
                  <span className="font-medium text-emerald-200/90">{summary.points}</span>
                </p>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-600">
            Overall points:{" "}
            <span className="font-medium text-slate-400">{standings.total_points}</span> (Round 1 ={" "}
            {standings.round1_points}, Round 2+ = {standings.round2_plus_points})
          </p>
        </section>
      ) : null}

      <section className="space-y-6">
        <h2 className="text-base font-semibold text-ash-text">Picks by round</h2>
        {roundSections.length === 0 ? (
          <p className="rounded-xl border border-slate-600/40 bg-slate-950/50 px-4 py-6 text-sm text-slate-400">
            No picks on file for this entry yet.
          </p>
        ) : (
          roundSections.map((section) => (
            <div key={section.roundCode} className="space-y-3">
              <h3 className="text-sm font-medium text-slate-300">{section.label}</h3>
              <div className="overflow-hidden rounded-xl border border-blue-500/25 bg-slate-950/60">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-blue-500/20 bg-slate-900/80">
                        <th className="px-3 py-2.5 font-semibold text-blue-100/90 sm:px-4">Series</th>
                        <th className="px-3 py-2.5 font-semibold text-blue-100/90 sm:px-4">
                          Matchup
                        </th>
                        <th className="px-3 py-2.5 font-semibold text-blue-100/90 sm:px-4">Pick</th>
                        <th className="px-3 py-2.5 font-semibold text-blue-100/90 sm:px-4">
                          Winner
                        </th>
                        <th className="px-3 py-2.5 font-semibold text-blue-100/90 sm:px-4">
                          Result
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {section.picks.map((pick) => (
                        <tr
                          key={pick.seriesId}
                          className="border-b border-blue-500/10 last:border-b-0"
                        >
                          <td className="px-3 py-2.5 text-slate-300 sm:px-4">
                            {formatNhlPublicEntrySlotLabel(pick)}
                          </td>
                          <td className="px-3 py-2.5 text-slate-200 sm:px-4">
                            {formatNhlPublicMatchup(pick)}
                          </td>
                          <td className="px-3 py-2.5 font-medium text-slate-100 sm:px-4">
                            {formatNhlPublicTeamLabel(pick.pickedTeamAbbr, pick.pickedTeamName)}
                          </td>
                          <td className="px-3 py-2.5 text-slate-300 sm:px-4">
                            {pick.outcome === "pending"
                              ? "—"
                              : formatNhlPublicTeamLabel(
                                  pick.scoringWinnerAbbr,
                                  pick.scoringWinnerName,
                                )}
                          </td>
                          <td className="px-3 py-2.5 sm:px-4">{outcomeBadge(pick.outcome)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
