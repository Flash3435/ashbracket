import type { PoolActivityFeedRow } from "./poolActivityTypes";

/**
 * When the activity page is opened with an explicit `?participant=` profile filter,
 * hide pool-wide milestone cards so the timeline stays focused on that profile's pool
 * without unrelated pool-wide celebration/deadline cards.
 *
 * Pool-wide milestones always have `participant_id` null and type `pool_milestone`.
 * Participant-specific milestones (none in this pass) would be kept when they match.
 */
export function filterActivityFeedForParticipantView(
  items: PoolActivityFeedRow[],
  options: { hidePoolWideMilestones: boolean; participantId?: string | null },
): PoolActivityFeedRow[] {
  if (!options.hidePoolWideMilestones) return items;

  return items.filter((item) => {
    if (item.type !== "pool_milestone") return true;
    const pid = options.participantId?.trim();
    if (!pid) return false;
    const metaPid = item.metadata_json.participant_id;
    return typeof metaPid === "string" && metaPid === pid;
  });
}
