import Link from "next/link";
import type { LiveBracketMatch } from "../../../lib/bracket/liveBracketTracker";
import type { Team } from "../../../src/types/domain";
import { AdminBracketTeamRow } from "./AdminBracketTeamRow";
import { MatchOutcomeSummary } from "./MatchOutcomeSummary";

function parseSideScore(
  scoreLine: string | null,
  side: "home" | "away",
): string | null {
  if (!scoreLine || scoreLine === "—") return null;
  const parts = scoreLine.split(/[–\-:]/).map((p) => p.trim());
  if (parts.length < 2) return null;
  return side === "home" ? parts[0]! : parts[1]!;
}

type Props = {
  match: LiveBracketMatch;
  teamById: Map<string, Team>;
  matchEditHref?: string | null;
  compact?: boolean;
};

export function AdminBracketMatchCard({
  match,
  teamById,
  matchEditHref,
  compact = false,
}: Props) {
  const label = match.fifaMatchNo > 0 ? `M${match.fifaMatchNo}` : match.matchKey;
  const showScore =
    match.scoreLine &&
    match.scoreLine !== "—" &&
    (match.status === "finished" || match.status === "live");
  const homeScore = showScore ? parseSideScore(match.scoreLine, "home") : null;
  const awayScore = showScore ? parseSideScore(match.scoreLine, "away") : null;

  const inner = (
    <div
      className={`flex w-[min(100%,192px)] min-w-[168px] shrink-0 flex-col overflow-hidden rounded-lg border border-ash-border/55 bg-ash-body/25 shadow-sm ${
        compact ? "gap-0.5" : "gap-1"
      }`}
    >
      <div
        className={`flex items-center justify-between gap-1 border-b border-ash-border/35 ${
          compact ? "px-1.5 py-0.5" : "px-2 py-1"
        }`}
      >
        <p className="truncate text-[9px] font-semibold uppercase tracking-wide text-ash-muted">
          {label}
        </p>
        {showScore ? (
          <p className="truncate text-[9px] font-semibold tabular-nums text-ash-text">
            {match.scoreLine}
          </p>
        ) : match.statusLabel ? (
          <p className="truncate text-[9px] font-medium text-ash-muted">{match.statusLabel}</p>
        ) : null}
      </div>
      <div className={`flex flex-col ${compact ? "gap-0.5 px-1 pb-1" : "gap-1 px-1.5 pb-1.5"}`}>
        <AdminBracketTeamRow side={match.home} teamById={teamById} score={homeScore} />
        <AdminBracketTeamRow side={match.away} teamById={teamById} score={awayScore} />
      </div>
      <MatchOutcomeSummary match={match} teamById={teamById} />
    </div>
  );

  if (matchEditHref) {
    return (
      <Link
        href={matchEditHref}
        className="block rounded-lg outline-none ring-ash-accent/30 focus-visible:ring-2"
      >
        {inner}
      </Link>
    );
  }
  return inner;
}
