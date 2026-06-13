import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";

export type TournamentMatchKickoffSortFields = Pick<
  TournamentMatchPublicRow,
  | "kickoff_at"
  | "stage_sort_order"
  | "group_code"
  | "match_code"
  | "match_id"
  | "status"
>;

/** Milliseconds from epoch for sorting; missing/invalid kickoffs sort last. */
export function kickoffSortMs(iso: string | null | undefined): number {
  if (iso == null || iso === "") return Number.POSITIVE_INFINITY;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

function compareGroupCodes(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a.localeCompare(b);
}

/**
 * Chronological ordering for participant-facing schedule lists.
 * Primary: kickoff instant ascending. Tie-breakers: stage order, group, match code, id.
 */
export function compareMatchesByKickoffChronological(
  a: TournamentMatchKickoffSortFields,
  b: TournamentMatchKickoffSortFields,
): number {
  const kickDiff = kickoffSortMs(a.kickoff_at) - kickoffSortMs(b.kickoff_at);
  if (kickDiff !== 0) return kickDiff;

  const stageDiff = a.stage_sort_order - b.stage_sort_order;
  if (stageDiff !== 0) return stageDiff;

  const groupDiff = compareGroupCodes(a.group_code, b.group_code);
  if (groupDiff !== 0) return groupDiff;

  const codeDiff = a.match_code.localeCompare(b.match_code);
  if (codeDiff !== 0) return codeDiff;

  return a.match_id.localeCompare(b.match_id);
}

function liveStatusRank(status: string): number {
  return status === "live" ? 0 : 1;
}

/**
 * Upcoming/live lists that should surface live fixtures first, then kickoff order.
 */
export function compareUpcomingMatchesLiveFirst(
  a: TournamentMatchKickoffSortFields,
  b: TournamentMatchKickoffSortFields,
): number {
  const liveDiff = liveStatusRank(a.status) - liveStatusRank(b.status);
  if (liveDiff !== 0) return liveDiff;
  return compareMatchesByKickoffChronological(a, b);
}

export function sortMatchesByKickoffChronological<
  T extends TournamentMatchKickoffSortFields,
>(matches: T[]): T[] {
  return [...matches].sort(compareMatchesByKickoffChronological);
}

export function sortUpcomingMatchesLiveFirst<
  T extends TournamentMatchKickoffSortFields,
>(matches: T[]): T[] {
  return [...matches].sort(compareUpcomingMatchesLiveFirst);
}
