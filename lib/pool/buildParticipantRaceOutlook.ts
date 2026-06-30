import type { ChampionPickInput } from "@/lib/account/buildPoolReveal";
import { isKnockoutProgressionKind } from "@/lib/predictions/knockoutProgressionKinds";
import type { LeaderboardPublicRow } from "../../types/leaderboard";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { ParticipantBracketForExposure } from "./buildKnockoutMatchExposure";

export type RaceOutlookStatus =
  | "Leading"
  | "Chasing"
  | "Dangerous"
  | "Champion dead"
  | "Low upside";

export type ParticipantRaceOutlookRow = {
  participantId: string;
  displayName: string;
  rank: number;
  totalPoints: number;
  championTeamName: string | null;
  championTeamCode: string | null;
  championAlive: boolean;
  hasChampionPick: boolean;
  liveKnockoutPicksRemaining: number;
  statusLabel: RaceOutlookStatus;
};

export type ParticipantRaceOutlook = {
  rows: ParticipantRaceOutlookRow[];
};

export const RACE_OUTLOOK_TOP_N = 10;
const LOW_UPSIDE_LIVE_PICKS_THRESHOLD = 3;
const DANGEROUS_LIVE_PICKS_THRESHOLD = 8;
const DANGEROUS_POINTS_BEHIND_LEADER = 5;

/**
 * Knockout progression slots whose picked team has not been eliminated yet.
 */
export function countLiveKnockoutPicksRemaining(
  slots: KnockoutPickSlotDraft[],
  eliminatedTeamIds: ReadonlySet<string>,
): number {
  let count = 0;
  for (const slot of slots) {
    if (!isKnockoutProgressionKind(slot.predictionKind)) continue;
    const teamId = slot.teamId.trim();
    if (!teamId) continue;
    if (eliminatedTeamIds.has(teamId)) continue;
    count += 1;
  }
  return count;
}

export function resolveRaceOutlookStatus(input: {
  rank: number;
  hasChampionPick: boolean;
  championAlive: boolean;
  liveKnockoutPicksRemaining: number;
  pointsBehindLeader: number;
}): RaceOutlookStatus {
  if (input.hasChampionPick && !input.championAlive) return "Champion dead";
  if (input.rank === 1) return "Leading";
  if (input.liveKnockoutPicksRemaining <= LOW_UPSIDE_LIVE_PICKS_THRESHOLD) {
    return "Low upside";
  }
  if (
    input.liveKnockoutPicksRemaining >= DANGEROUS_LIVE_PICKS_THRESHOLD &&
    input.pointsBehindLeader <= DANGEROUS_POINTS_BEHIND_LEADER
  ) {
    return "Dangerous";
  }
  return "Chasing";
}

function sortLeaderboardRows(rows: LeaderboardPublicRow[]): LeaderboardPublicRow[] {
  return [...rows].sort(
    (a, b) =>
      a.rank - b.rank ||
      b.totalPoints - a.totalPoints ||
      a.displayName.localeCompare(b.displayName) ||
      a.participantId.localeCompare(b.participantId),
  );
}

function selectRaceOutlookParticipantIds(input: {
  leaderboardRows: LeaderboardPublicRow[];
  completeParticipantIds: Set<string>;
  viewerParticipantId?: string | null;
  topN?: number;
}): string[] {
  const topN = input.topN ?? RACE_OUTLOOK_TOP_N;
  const sorted = sortLeaderboardRows(input.leaderboardRows);
  const selected: string[] = [];
  const seen = new Set<string>();

  for (const row of sorted) {
    if (!input.completeParticipantIds.has(row.participantId)) continue;
    if (seen.has(row.participantId)) continue;
    selected.push(row.participantId);
    seen.add(row.participantId);
    if (selected.length >= topN) break;
  }

  const viewerId = input.viewerParticipantId?.trim() || null;
  if (
    viewerId &&
    input.completeParticipantIds.has(viewerId) &&
    !seen.has(viewerId)
  ) {
    selected.push(viewerId);
  }

  return selected;
}

/**
 * Participant-centered race outlook for leaderboard-visible complete brackets only.
 */
export function buildParticipantRaceOutlook(input: {
  leaderboardRows: LeaderboardPublicRow[];
  completeParticipantBrackets: ParticipantBracketForExposure[];
  championPicks: ChampionPickInput[];
  eliminatedTeamIds: ReadonlySet<string>;
  viewerParticipantId?: string | null;
  topN?: number;
}): ParticipantRaceOutlook {
  const leaderboardByParticipantId = new Map(
    input.leaderboardRows.map((row) => [row.participantId, row]),
  );
  const bracketByParticipantId = new Map(
    input.completeParticipantBrackets.map((b) => [b.participantId, b]),
  );
  const championByParticipantId = new Map(
    input.championPicks.map((pick) => [pick.participantId, pick]),
  );
  const completeParticipantIds = new Set(input.completeParticipantBrackets.map((b) => b.participantId));

  const leaderPoints =
    sortLeaderboardRows(input.leaderboardRows).find((row) =>
      completeParticipantIds.has(row.participantId),
    )?.totalPoints ?? 0;

  const participantIds = selectRaceOutlookParticipantIds({
    leaderboardRows: input.leaderboardRows,
    completeParticipantIds,
    viewerParticipantId: input.viewerParticipantId,
    topN: input.topN,
  });

  const rows: ParticipantRaceOutlookRow[] = [];

  for (const participantId of participantIds) {
    const leaderboardRow = leaderboardByParticipantId.get(participantId);
    const bracket = bracketByParticipantId.get(participantId);
    if (!leaderboardRow || !bracket) continue;

    const champion = championByParticipantId.get(participantId);
    const hasChampionPick = Boolean(champion?.teamId);
    const championAlive =
      hasChampionPick && !input.eliminatedTeamIds.has(champion!.teamId);
    const liveKnockoutPicksRemaining = countLiveKnockoutPicksRemaining(
      bracket.slots,
      input.eliminatedTeamIds,
    );

    rows.push({
      participantId,
      displayName: leaderboardRow.displayName,
      rank: leaderboardRow.rank,
      totalPoints: leaderboardRow.totalPoints,
      championTeamName: champion?.teamName ?? null,
      championTeamCode: champion?.teamCode ?? null,
      championAlive,
      hasChampionPick,
      liveKnockoutPicksRemaining,
      statusLabel: resolveRaceOutlookStatus({
        rank: leaderboardRow.rank,
        hasChampionPick,
        championAlive,
        liveKnockoutPicksRemaining,
        pointsBehindLeader: leaderPoints - leaderboardRow.totalPoints,
      }),
    });
  }

  rows.sort(
    (a, b) =>
      a.rank - b.rank ||
      b.totalPoints - a.totalPoints ||
      a.displayName.localeCompare(b.displayName),
  );

  return { rows };
}
