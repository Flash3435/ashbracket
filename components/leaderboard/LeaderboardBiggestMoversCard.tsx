import type { LeaderboardMomentumRow } from "@/lib/leaderboard/buildLeaderboardMomentum";
import {
  formatBiggestMoverLine,
  rankMovementIndicatorClass,
} from "@/lib/leaderboard/leaderboardMomentumDisplay";

type Props = {
  movers: LeaderboardMomentumRow[];
  displayNameByParticipantId: ReadonlyMap<string, string>;
};

export function LeaderboardBiggestMoversCard({
  movers,
  displayNameByParticipantId,
}: Props) {
  if (movers.length === 0) return null;

  return (
    <div className="rounded-xl border border-ash-border/70 bg-ash-body/25 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ash-muted">
        Biggest movers
      </p>
      <ul className="mt-2 space-y-1 text-sm text-ash-text">
        {movers.map((mover) => {
          const name =
            displayNameByParticipantId.get(mover.participantId) ?? "Participant";
          return (
            <li
              key={mover.participantId}
              className={rankMovementIndicatorClass(mover)}
            >
              {formatBiggestMoverLine(mover, name)}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
