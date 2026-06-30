import {
  CountryFlagIcon,
  CountryFlagPlaceholder,
} from "../tournament/Flag";
import type { LiveBracketSide } from "../../lib/bracket/liveBracketTracker";
import {
  liveSideNameClassName,
  liveSideNeedsMutedFlag,
  liveSideRowClassName,
} from "../../lib/bracket/liveBracketSideStyles";
import type { Team } from "../../src/types/domain";

function compactBadgeLabel(pick: LiveBracketSide["participantPick"]): string | null {
  if (pick === "your_pick" || pick === "your_pick_alive") return "Pick";
  if (pick === "your_pick_eliminated") return "Pick out";
  return null;
}

function outcomeBadgeLabel(outcome: LiveBracketSide["tournamentOutcome"]): string | null {
  if (outcome === "advanced") return "Advanced";
  if (outcome === "eliminated") return "Eliminated";
  return null;
}

type Props = {
  side: LiveBracketSide;
  teamById: Map<string, Team>;
  score?: string | null;
};

export function PosterBracketTeamRow({ side, teamById, score }: Props) {
  const team = side.teamId ? teamById.get(side.teamId) : undefined;
  const picked = Boolean(side.teamId && team);
  const muted = liveSideNeedsMutedFlag(side);
  const pickLabel = compactBadgeLabel(side.participantPick);
  const outcomeLabel = outcomeBadgeLabel(side.tournamentOutcome);

  return (
    <div
      className={`flex min-h-[28px] items-center gap-1.5 rounded px-1.5 py-0.5 ${liveSideRowClassName(side)}`}
    >
      {picked ? (
        <CountryFlagIcon
          countryCode={team!.countryCode}
          size="sm"
          className={muted ? "opacity-60 grayscale" : undefined}
        />
      ) : (
        <CountryFlagPlaceholder size="sm" />
      )}
      <p
        className={`min-w-0 flex-1 truncate text-[11px] font-medium leading-tight ${liveSideNameClassName(side)}`}
        title={side.displayName}
      >
        {side.displayName}
      </p>
      {score ? (
        <span className="shrink-0 text-[10px] font-semibold tabular-nums text-ash-text">{score}</span>
      ) : null}
      {pickLabel ? (
        <span
          className={`shrink-0 rounded px-1 py-px text-[8px] font-semibold uppercase tracking-wide ring-1 ${
            side.participantPick === "your_pick_eliminated"
              ? "bg-red-950/50 text-red-200 ring-red-900/40"
              : "bg-ash-accent/25 text-ash-accent ring-ash-accent/35"
          }`}
        >
          {pickLabel}
        </span>
      ) : null}
      {outcomeLabel ? (
        <span
          className={`shrink-0 rounded px-1 py-px text-[8px] font-semibold uppercase tracking-wide ring-1 ${
            side.tournamentOutcome === "advanced"
              ? "bg-emerald-950/50 text-emerald-200 ring-emerald-800/50"
              : "bg-ash-body/80 text-ash-muted ring-ash-border/60"
          }`}
        >
          {outcomeLabel}
        </span>
      ) : null}
    </div>
  );
}
