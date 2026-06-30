import type { ChampionPickInput } from "../account/buildPoolReveal";

export type ChampionPickExposureRow = {
  teamId: string;
  teamName: string;
  teamCode?: string;
  count: number;
  /** Share of completed champion picks (0–100, one decimal). */
  percentage: number;
};

export type ChampionPickExposure = {
  surviving: ChampionPickExposureRow[];
  eliminated: ChampionPickExposureRow[];
  totalCompletedChampionPicks: number;
  /** Complete brackets without a resolved champion pick. */
  incompleteCount: number;
};

function sortExposureRows(rows: ChampionPickExposureRow[]): ChampionPickExposureRow[] {
  return [...rows].sort(
    (a, b) =>
      b.count - a.count ||
      a.teamName.localeCompare(b.teamName) ||
      a.teamId.localeCompare(b.teamId),
  );
}

/**
 * Aggregates champion pick counts by team, split by official tournament survival.
 * Incomplete/null champion picks are excluded from row counts but reflected in
 * `incompleteCount`.
 */
export function buildChampionPickExposure(input: {
  completeParticipantIds: string[];
  championPicks: ChampionPickInput[];
  eliminatedTeamIds: ReadonlySet<string>;
}): ChampionPickExposure {
  const completeSet = new Set(input.completeParticipantIds);
  const participantsWithChampionPick = new Set<string>();
  const byTeam = new Map<
    string,
    { teamName: string; teamCode?: string; participantIds: Set<string> }
  >();

  for (const row of input.championPicks) {
    if (!completeSet.has(row.participantId)) continue;
    const teamId = row.teamId.trim();
    if (!teamId) continue;

    participantsWithChampionPick.add(row.participantId);

    let entry = byTeam.get(teamId);
    if (!entry) {
      entry = {
        teamName: row.teamName.trim() || "Unknown team",
        teamCode: row.teamCode?.trim() || undefined,
        participantIds: new Set(),
      };
      byTeam.set(teamId, entry);
    }
    entry.participantIds.add(row.participantId);
  }

  const totalCompletedChampionPicks = participantsWithChampionPick.size;
  const incompleteCount = Math.max(
    0,
    input.completeParticipantIds.length - totalCompletedChampionPicks,
  );

  const surviving: ChampionPickExposureRow[] = [];
  const eliminated: ChampionPickExposureRow[] = [];

  for (const [teamId, entry] of byTeam) {
    const count = entry.participantIds.size;
    const percentage =
      totalCompletedChampionPicks > 0
        ? Math.round((count / totalCompletedChampionPicks) * 1000) / 10
        : 0;
    const row: ChampionPickExposureRow = {
      teamId,
      teamName: entry.teamName,
      teamCode: entry.teamCode,
      count,
      percentage,
    };
    if (input.eliminatedTeamIds.has(teamId)) {
      eliminated.push(row);
    } else {
      surviving.push(row);
    }
  }

  return {
    surviving: sortExposureRows(surviving),
    eliminated: sortExposureRows(eliminated),
    totalCompletedChampionPicks,
    incompleteCount,
  };
}
