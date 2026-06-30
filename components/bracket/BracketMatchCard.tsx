import Link from "next/link";
import {
  CountryFlagIcon,
  CountryFlagPlaceholder,
} from "../tournament/Flag";
import {
  resolveBracketSideVisualState,
  type BracketTeamDisplayStatus,
} from "../../lib/bracket/bracketTeamDisplay";
import type { BracketMatchResolved, BracketSideResolved } from "../../lib/bracket/types";
import type { Team } from "../../src/types/domain";

function EliminatedBadge() {
  return (
    <span
      className="shrink-0 rounded bg-ash-body/80 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-ash-muted ring-1 ring-ash-border/60"
      title="This team was eliminated from the tournament"
    >
      Eliminated
    </span>
  );
}

function sideRowClassName(
  picked: boolean,
  status: BracketTeamDisplayStatus,
  emphasizePathWinner: boolean,
): string {
  if (status === "eliminated") {
    return "border-ash-border/45 bg-ash-body/15 opacity-75";
  }
  if (emphasizePathWinner) {
    return "border-ash-accent/55 bg-ash-accent/18 ring-1 ring-ash-accent/30";
  }
  if (picked) {
    return "border-ash-border/70 bg-ash-body/35";
  }
  return "border-ash-border/50 bg-ash-body/20";
}

function SideRow({
  side,
  teamById,
  winnerTeamId,
  eliminatedTeamIds,
}: {
  side: BracketSideResolved;
  teamById: Map<string, Team>;
  winnerTeamId: string | null;
  eliminatedTeamIds: Set<string>;
}) {
  const tid = side.teamId?.trim() || null;
  const team = tid ? teamById.get(tid) : undefined;
  const picked = Boolean(tid && team);
  const { status, emphasizePathWinner } = resolveBracketSideVisualState({
    teamId: tid,
    eliminatedTeamIds,
    participantPathWinnerTeamId: winnerTeamId,
  });
  const eliminated = status === "eliminated";

  return (
    <div
      className={`flex min-h-[38px] items-center gap-2 rounded-md border px-2 py-1.5 ${sideRowClassName(
        picked,
        status,
        emphasizePathWinner,
      )}`}
    >
      {picked ? (
        <CountryFlagIcon
          countryCode={team!.countryCode}
          size="md"
          className={eliminated ? "opacity-60 grayscale" : undefined}
        />
      ) : (
        <CountryFlagPlaceholder size="md" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <p
            className={`min-w-0 truncate text-xs font-medium ${
              eliminated
                ? "text-ash-muted"
                : picked || side.displayLabel
                  ? "text-ash-text"
                  : "text-ash-muted"
            }`}
          >
            {picked ? team!.name : side.displayLabel}
          </p>
          {eliminated ? <EliminatedBadge /> : null}
        </div>
        {picked ? (
          <p className={`truncate text-[10px] ${eliminated ? "text-ash-muted/80" : "text-ash-muted"}`}>
            {team!.countryCode}
          </p>
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
  eliminatedTeamIds?: Set<string>;
};

export function BracketMatchCard({
  match,
  teamById,
  matchEditHref,
  eliminatedTeamIds = new Set(),
}: Props) {
  const label = match.fifaMatchNo > 0 ? `M${match.fifaMatchNo}` : match.matchKey;
  const inner = (
    <div className="flex w-[148px] shrink-0 flex-col gap-1 rounded-lg border border-ash-border/55 bg-ash-body/25 p-2 shadow-sm sm:w-[158px]">
      <p className="text-center text-[10px] font-semibold uppercase tracking-wide text-ash-muted">
        {label}
      </p>
      <SideRow
        side={match.home}
        teamById={teamById}
        winnerTeamId={match.winnerTeamId}
        eliminatedTeamIds={eliminatedTeamIds}
      />
      <SideRow
        side={match.away}
        teamById={teamById}
        winnerTeamId={match.winnerTeamId}
        eliminatedTeamIds={eliminatedTeamIds}
      />
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
