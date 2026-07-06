import {
  CountryFlagIcon,
  CountryFlagPlaceholder,
} from "../../tournament/Flag";
import {
  liveSideNameClassName,
  liveSideNeedsMutedFlag,
  liveSideRowClassName,
  liveSideShowsFlag,
} from "../../../lib/bracket/liveBracketSideStyles";
import type { LiveBracketSide } from "../../../lib/bracket/liveBracketTracker";
import type { Team } from "../../../src/types/domain";
import { PickStatusBadgeForSide } from "./PickStatusBadge";

type Props = {
  side: LiveBracketSide;
  teamById: Map<string, Team>;
  score?: string | null;
};

export function AdminBracketTeamRow({ side, teamById, score }: Props) {
  const team = side.teamId ? teamById.get(side.teamId) : undefined;
  const showFlag = liveSideShowsFlag(side);
  const muted = liveSideNeedsMutedFlag(side);
  const isPlaceholder = side.fillState !== "team";

  return (
    <div
      className={`flex min-h-[34px] flex-wrap items-center gap-x-1.5 gap-y-1 rounded px-2 py-1 ${liveSideRowClassName(side)}`}
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
        className={`min-w-0 flex-1 text-xs leading-snug ${liveSideNameClassName(side)}`}
        title={side.helperTooltip ?? side.displayName}
      >
        {side.displayName}
      </p>
      {score ? (
        <span className="shrink-0 text-[10px] font-semibold tabular-nums text-ash-text">
          {score}
        </span>
      ) : null}
      <PickStatusBadgeForSide side={side} />
    </div>
  );
}
