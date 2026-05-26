import type { Team, TournamentStage } from "../../src/types/domain";

export type SimulationMatchScoreRow = {
  id: string;
  matchCode: string;
  stageCode: string;
  groupCode: string | null;
  kickoffAt: string | null;
  status: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeGoals: number | null;
  awayGoals: number | null;
  homePenalties: number | null;
  awayPenalties: number | null;
  winnerTeamId: string | null;
  lastSyncAt: string | null;
};

export type GeneratedSimulationScore = {
  matchId: string;
  matchCode: string;
  stageCode: string;
  stageLabel: string;
  groupCode: string | null;
  kickoffAt: string | null;
  status: string;
  homeTeamName: string;
  awayTeamName: string;
  homeGoals: number;
  awayGoals: number;
  homePenalties: number | null;
  awayPenalties: number | null;
  outcomeLabel: string;
  lastSyncAt: string | null;
};

function compareKickoffThenCode(
  a: Pick<GeneratedSimulationScore, "kickoffAt" | "matchCode">,
  b: Pick<GeneratedSimulationScore, "kickoffAt" | "matchCode">,
): number {
  const aTime = a.kickoffAt ? Date.parse(a.kickoffAt) : Number.POSITIVE_INFINITY;
  const bTime = b.kickoffAt ? Date.parse(b.kickoffAt) : Number.POSITIVE_INFINITY;
  if (aTime !== bTime) return aTime - bTime;
  return a.matchCode.localeCompare(b.matchCode);
}

function fallbackWinnerName(
  row: SimulationMatchScoreRow,
  homeTeamName: string,
  awayTeamName: string,
): string | null {
  if (row.homeGoals == null || row.awayGoals == null) return null;
  if (row.homeGoals > row.awayGoals) return homeTeamName;
  if (row.awayGoals > row.homeGoals) return awayTeamName;
  if (
    row.homePenalties != null &&
    row.awayPenalties != null &&
    row.homePenalties !== row.awayPenalties
  ) {
    return row.homePenalties > row.awayPenalties ? homeTeamName : awayTeamName;
  }
  return null;
}

export function isAppliedSimulationScore(row: SimulationMatchScoreRow): boolean {
  return row.homeGoals != null && row.awayGoals != null;
}

export function buildGeneratedSimulationScores(input: {
  matches: SimulationMatchScoreRow[];
  teamsById: Map<string, Team>;
  stageByCode: Record<string, TournamentStage | undefined>;
}): GeneratedSimulationScore[] {
  const { matches, teamsById, stageByCode } = input;

  const generated = matches.flatMap((row) => {
    if (!isAppliedSimulationScore(row)) return [];

    const homeTeamName = row.homeTeamId
      ? (teamsById.get(row.homeTeamId)?.name ?? "TBD")
      : "TBD";
    const awayTeamName = row.awayTeamId
      ? (teamsById.get(row.awayTeamId)?.name ?? "TBD")
      : "TBD";
    const winnerName =
      (row.winnerTeamId ? teamsById.get(row.winnerTeamId)?.name : null) ??
      fallbackWinnerName(row, homeTeamName, awayTeamName);

    const outcomeLabel =
      row.homeGoals === row.awayGoals
        ? row.homePenalties != null && row.awayPenalties != null && winnerName
          ? `${winnerName} on penalties`
          : "Draw"
        : winnerName ?? "Winner recorded";

    return [
      {
        matchId: row.id,
        matchCode: row.matchCode,
        stageCode: row.stageCode,
        stageLabel: stageByCode[row.stageCode]?.label ?? row.stageCode,
        groupCode: row.groupCode,
        kickoffAt: row.kickoffAt,
        status: row.status,
        homeTeamName,
        awayTeamName,
        homeGoals: row.homeGoals!,
        awayGoals: row.awayGoals!,
        homePenalties: row.homePenalties,
        awayPenalties: row.awayPenalties,
        outcomeLabel,
        lastSyncAt: row.lastSyncAt,
      },
    ];
  });

  generated.sort(compareKickoffThenCode);
  return generated;
}
