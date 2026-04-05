/**
 * Derive winner from regulation (and optional penalties) for official matches.
 */

export function winnerFromMatchScores(input: {
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeGoals: number | null;
  awayGoals: number | null;
  homePenalties: number | null;
  awayPenalties: number | null;
}): string | null {
  const { homeTeamId, awayTeamId, homeGoals, awayGoals, homePenalties, awayPenalties } =
    input;
  if (!homeTeamId || !awayTeamId) return null;
  if (homeGoals === null || awayGoals === null) return null;
  if (homeGoals > awayGoals) return homeTeamId;
  if (awayGoals > homeGoals) return awayTeamId;
  if (homePenalties === null || awayPenalties === null) return null;
  if (homePenalties > awayPenalties) return homeTeamId;
  if (awayPenalties > homePenalties) return awayTeamId;
  return null;
}
