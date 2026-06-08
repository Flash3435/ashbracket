import type { PoolActivityFeedRow } from "./poolActivityTypes";

/**
 * When the activity page is opened with an explicit `?participant=` profile filter,
 * hide pool-wide milestone and insight cards so the timeline stays focused on that
 * profile's pool without unrelated pool-wide celebration/deadline/insight cards.
 *
 * Pool-wide rows always have `participant_id` null and type `pool_milestone` or
 * `pool_insight`. Participant-specific rows (none in this pass) would be kept when they match.
 */
export function filterActivityFeedForParticipantView(
  items: PoolActivityFeedRow[],
  options: { hidePoolWideMilestones: boolean; participantId?: string | null },
): PoolActivityFeedRow[] {
  if (!options.hidePoolWideMilestones) return items;

  return items.filter((item) => {
    if (item.type !== "pool_milestone" && item.type !== "pool_insight") return true;
    const pid = options.participantId?.trim();
    if (!pid) return false;
    const metaPid = item.metadata_json.participant_id;
    return typeof metaPid === "string" && metaPid === pid;
  });
}
