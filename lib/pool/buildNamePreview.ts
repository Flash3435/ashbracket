import type { LeaderboardPublicRow } from "../../types/leaderboard";

export function buildLeaderboardNameContext(rows: LeaderboardPublicRow[]): {
  leaderboardVisibleParticipantIds: Set<string>;
  displayNameByParticipantId: Map<string, string>;
} {
  const leaderboardVisibleParticipantIds = new Set<string>();
  const displayNameByParticipantId = new Map<string, string>();

  for (const row of rows) {
    const name = row.displayName.trim();
    if (!name) continue;
    leaderboardVisibleParticipantIds.add(row.participantId);
    displayNameByParticipantId.set(row.participantId, name);
  }

  return { leaderboardVisibleParticipantIds, displayNameByParticipantId };
}

/** Limited display-name preview for public leaderboard-safe exposure. */
export function buildParticipantNamePreview(input: {
  participantIds: string[];
  leaderboardVisibleParticipantIds: ReadonlySet<string>;
  displayNameByParticipantId: ReadonlyMap<string, string>;
  limit?: number;
}): { names: string[]; additionalCount: number } {
  const limit = input.limit ?? 5;
  const seen = new Set<string>();
  const names: string[] = [];

  for (const participantId of input.participantIds) {
    if (!input.leaderboardVisibleParticipantIds.has(participantId)) continue;
    const name = input.displayNameByParticipantId.get(participantId)?.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }

  names.sort((a, b) => a.localeCompare(b));

  return {
    names: names.slice(0, limit),
    additionalCount: Math.max(0, names.length - limit),
  };
}
