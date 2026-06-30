import Link from "next/link";
import type { LiveBracketMatch } from "../../lib/bracket/liveBracketTracker";
import type { Team } from "../../src/types/domain";
import { PosterBracketTeamRow } from "./PosterBracketTeamRow";

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

export function PosterBracketMatchCard({
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
      className={`flex w-[132px] shrink-0 flex-col rounded-md border border-ash-border/55 bg-ash-body/25 shadow-sm ${
        compact ? "gap-0.5 p-1" : "gap-1 p-1.5"
      }`}
    >
      <div className="flex items-center justify-between gap-1 border-b border-ash-border/35 pb-0.5">
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
      {showScore && match.statusLabel ? (
        <p className="-mt-0.5 text-center text-[8px] font-medium text-ash-muted">{match.statusLabel}</p>
      ) : null}
      <PosterBracketTeamRow side={match.home} teamById={teamById} score={homeScore} />
      <PosterBracketTeamRow side={match.away} teamById={teamById} score={awayScore} />
    </div>
  );

  if (matchEditHref) {
    return (
      <Link
        href={matchEditHref}
        className="block rounded-md outline-none ring-ash-accent/30 focus-visible:ring-2"
      >
        {inner}
      </Link>
    );
  }
  return inner;
}
