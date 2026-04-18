import Link from "next/link";
import { flagEmojiForFifaCountryCode } from "../../lib/teams/fifaToIso2ForFlag";
import type { BracketMatchResolved, BracketSideResolved } from "../../lib/bracket/types";
import type { Team } from "../../src/types/domain";

function SideRow({
  side,
  teamById,
  winnerTeamId,
}: {
  side: BracketSideResolved;
  teamById: Map<string, Team>;
  winnerTeamId: string | null;
}) {
  const tid = side.teamId?.trim() || null;
  const team = tid ? teamById.get(tid) : undefined;
  const picked = Boolean(tid && team);
  const flag = team ? flagEmojiForFifaCountryCode(team.countryCode) : "";
  const isWinner = Boolean(winnerTeamId && tid && winnerTeamId === tid);

  return (
    <div
      className={`flex min-h-[38px] items-center gap-2 rounded-md border px-2 py-1.5 ${
        isWinner
          ? "border-ash-accent/55 bg-ash-accent/18 ring-1 ring-ash-accent/30"
          : picked
            ? "border-ash-border/70 bg-ash-body/35"
            : "border-ash-border/50 bg-ash-body/20"
      }`}
    >
      <span className="text-lg leading-none" aria-hidden>
        {picked ? flag : "🌍"}
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-xs font-medium ${
            picked || side.displayLabel ? "text-ash-text" : "text-ash-muted"
          }`}
        >
          {picked ? team!.name : side.displayLabel}
        </p>
        {picked ? (
          <p className="truncate text-[10px] text-ash-muted">{team!.countryCode}</p>
        ) : side.placeholderSubtext ? (
          <p className="text-[10px] leading-snug text-ash-muted/90">{side.placeholderSubtext}</p>
        ) : null}
      </div>
    </div>
  );
}

type Props = {
  match: BracketMatchResolved;
  teamById: Map<string, Team>;
  /** When set, the whole card links to the pick editor (no per-slot deep links). */
  matchEditHref?: string | null;
};

export function BracketMatchCard({ match, teamById, matchEditHref }: Props) {
  const label = match.fifaMatchNo > 0 ? `M${match.fifaMatchNo}` : match.matchKey;
  const inner = (
    <div className="flex w-[148px] shrink-0 flex-col gap-1 rounded-lg border border-ash-border/55 bg-ash-body/25 p-2 shadow-sm sm:w-[158px]">
      <p className="text-center text-[10px] font-semibold uppercase tracking-wide text-ash-muted">
        {label}
      </p>
      <SideRow side={match.home} teamById={teamById} winnerTeamId={match.winnerTeamId} />
      <SideRow side={match.away} teamById={teamById} winnerTeamId={match.winnerTeamId} />
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
