import {
  CountryFlagIcon,
  CountryFlagPlaceholder,
} from "../tournament/Flag";
import type { LiveBracketSide } from "../../lib/bracket/liveBracketTracker";
import {
  NOT_YOUR_PICK_BADGE_LABEL,
  WRONG_PATH_PICK_BADGE_LABEL,
} from "../../lib/bracket/knockoutBracketDisplayCopy";
import {
  liveSideNameClassName,
  liveSideNeedsMutedFlag,
  liveSideRowClassName,
  liveSideShowsFlag,
} from "../../lib/bracket/liveBracketSideStyles";
import type { Team } from "../../src/types/domain";

function compactBadgeLabel(pick: LiveBracketSide["participantPick"]): string | null {
  if (pick === "your_pick" || pick === "your_pick_alive") return "Pick";
  if (pick === "your_pick_eliminated") return "Pick out";
  if (pick === "your_pick_wrong_path") return WRONG_PATH_PICK_BADGE_LABEL;
  if (pick === "not_your_pick") return NOT_YOUR_PICK_BADGE_LABEL;
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
  const showFlag = liveSideShowsFlag(side);
  const muted = liveSideNeedsMutedFlag(side);
  const pickLabel = compactBadgeLabel(side.participantPick);
  const outcomeLabel = outcomeBadgeLabel(side.tournamentOutcome);
  const isPlaceholder = side.fillState !== "team";

  return (
    <div
      className={`flex min-h-[28px] items-center gap-1.5 rounded px-1.5 py-0.5 ${liveSideRowClassName(side)}`}
      title={side.helperTooltip ?? undefined}
    >
      {showFlag ? (
        <CountryFlagIcon
          countryCode={team!.countryCode}
          size="sm"
          className={muted ? "opacity-60 grayscale" : undefined}
        />
      ) : isPlaceholder ? null : (
        <CountryFlagPlaceholder size="sm" />
      )}
      <p
        className={`min-w-0 flex-1 truncate leading-tight ${liveSideNameClassName(side)}`}
        title={side.helperTooltip ?? side.displayName}
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
              : side.participantPick === "your_pick_wrong_path"
                ? "bg-amber-950/50 text-amber-200 ring-amber-900/40"
                : side.participantPick === "not_your_pick"
                  ? "bg-ash-body/70 text-ash-muted ring-ash-border/50"
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
              ? side.participantPick === "not_your_pick"
                ? "bg-emerald-950/35 text-emerald-200/90 ring-emerald-800/40"
                : "bg-emerald-950/50 text-emerald-200 ring-emerald-800/50"
              : "bg-ash-body/80 text-ash-muted ring-ash-border/60"
          }`}
        >
          {outcomeLabel}
        </span>
      ) : null}
    </div>
  );
}
