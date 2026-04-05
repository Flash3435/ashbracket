import type { PublicParticipantPick } from "../../types/publicParticipant";

export type PicksStageSection = {
  stageCode: string | null;
  stageLabel: string;
  stageSortOrder: number;
  picks: PublicParticipantPick[];
};

/**
 * Groups picks by tournament stage for display (stable order by sort_order, then label).
 */
export function groupPicksByStage(
  picks: PublicParticipantPick[],
): PicksStageSection[] {
  const map = new Map<
    string,
    { stageSortOrder: number; stageLabel: string; picks: PublicParticipantPick[] }
  >();

  for (const pick of picks) {
    const key = pick.stageCode ?? "__none__";
    const existing = map.get(key);
    if (existing) {
      existing.picks.push(pick);
      existing.stageSortOrder = Math.min(
        existing.stageSortOrder,
        pick.stageSortOrder,
      );
    } else {
      map.set(key, {
        stageSortOrder: pick.stageSortOrder,
        stageLabel: pick.stageLabel,
        picks: [pick],
      });
    }
  }

  return Array.from(map.entries())
    .map(([code, v]) => ({
      stageCode: code === "__none__" ? null : code,
      stageLabel: v.stageLabel,
      stageSortOrder: v.stageSortOrder,
      picks: v.picks.sort((a, b) =>
        a.predictionKind.localeCompare(b.predictionKind),
      ),
    }))
    .sort((a, b) => {
      if (a.stageSortOrder !== b.stageSortOrder) {
        return a.stageSortOrder - b.stageSortOrder;
      }
      return a.stageLabel.localeCompare(b.stageLabel);
    });
}
