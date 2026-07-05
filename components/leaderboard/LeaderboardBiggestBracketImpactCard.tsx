import type { BracketImpactSummaryMetadata } from "@/lib/poolActivity/scoreImpact/types";
import {
  formatBiggestBracketImpactLoserLine,
  formatBiggestBracketImpactWinnerLine,
} from "@/lib/leaderboard/leaderboardBracketImpactDisplay";

type Props = {
  summary: BracketImpactSummaryMetadata;
  uniformPointsDelta?: number | null;
  affectedCount?: number;
};

export function LeaderboardBiggestBracketImpactCard({
  summary,
  uniformPointsDelta = null,
  affectedCount = 0,
}: Props) {
  const winners = summary.biggest_winners.slice(0, 3);
  const losers = summary.biggest_losers.slice(0, 3);
  if (winners.length === 0 && losers.length === 0) return null;

  return (
    <div className="rounded-xl border border-ash-border/70 bg-ash-body/25 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ash-muted">
        Biggest bracket impact
      </p>
      {uniformPointsDelta != null && affectedCount > 0 ? (
        <p className="mt-2 text-sm text-ash-muted">
          Everyone gained +{uniformPointsDelta} — ranks held, but future paths shifted.
        </p>
      ) : null}
      {winners.length > 0 ? (
        <div className="mt-2">
          <p className="text-xs font-medium text-emerald-300/90">Path gain</p>
          <ul className="mt-1 space-y-1 text-sm text-ash-text">
            {winners.map((winner) => (
              <li key={`winner-${winner.display_name}`}>
                {formatBiggestBracketImpactWinnerLine(winner)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {losers.length > 0 ? (
        <div className={winners.length > 0 ? "mt-3" : "mt-2"}>
          <p className="text-xs font-medium text-amber-300/90">Most affected</p>
          <ul className="mt-1 space-y-1 text-sm text-ash-text">
            {losers.map((loser) => (
              <li key={`loser-${loser.display_name}`}>
                {formatBiggestBracketImpactLoserLine(loser)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
