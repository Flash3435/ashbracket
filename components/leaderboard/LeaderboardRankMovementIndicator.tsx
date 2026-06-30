import type { LeaderboardMomentumRow } from "@/lib/leaderboard/buildLeaderboardMomentum";
import {
  formatRankMovementIndicator,
  rankMovementIndicatorClass,
} from "@/lib/leaderboard/leaderboardMomentumDisplay";

type Props = {
  momentum?: LeaderboardMomentumRow | null;
  className?: string;
};

export function LeaderboardRankMovementIndicator({
  momentum = null,
  className = "",
}: Props) {
  const label = formatRankMovementIndicator(momentum);
  if (!label) return null;

  return (
    <span
      className={`text-xs font-semibold tabular-nums ${rankMovementIndicatorClass(momentum)} ${className}`.trim()}
      aria-label={
        momentum?.isNewEntry
          ? "New leaderboard entry"
          : momentum?.rankChange
            ? momentum.rankChange > 0
              ? `Moved up ${momentum.rankChange} places`
              : momentum.rankChange < 0
                ? `Moved down ${Math.abs(momentum.rankChange)} places`
                : "No rank change"
            : undefined
      }
    >
      {label}
    </span>
  );
}
