import type { OfficialMatchScorePatch } from "@/lib/tournament/syncOfficialTournament";
import { buildScoreSignatureFromMatches } from "./scoreImpactDedupKey";
import type { ScoreImpactMatchResult } from "./types";

type MatchLike = {
  match_code: string;
  group_code: string | null;
  stage_code: string;
  home_team_id: string | null;
  away_team_id: string | null;
  home_goals: number | null;
  away_goals: number | null;
  winner_team_id: string | null;
};

export function buildScoreImpactMatchResults(input: {
  matches: readonly MatchLike[];
  patches?: readonly OfficialMatchScorePatch[];
  teamNameById: ReadonlyMap<string, string>;
}): ScoreImpactMatchResult[] {
  if (!input.patches?.length) return [];

  const byCode = new Map(input.matches.map((m) => [m.match_code, m]));
  const results: ScoreImpactMatchResult[] = [];

  for (const patch of input.patches) {
    const match = byCode.get(patch.matchCode);
    if (!match) continue;

    const homeName =
      (match.home_team_id && input.teamNameById.get(match.home_team_id)) || "Home";
    const awayName =
      (match.away_team_id && input.teamNameById.get(match.away_team_id)) || "Away";

    results.push({
      matchCode: patch.matchCode,
      label: `${homeName} ${patch.homeGoals}–${patch.awayGoals} ${awayName}`,
      groupCode: match.group_code,
      winnerTeamId: match.winner_team_id,
      homeTeamId: match.home_team_id,
      awayTeamId: match.away_team_id,
      stageCode: match.stage_code,
    });
  }

  return results;
}

/** Build match-result rows from persisted DB state when patch objects are unavailable (Step B recalc). */
export function buildScoreImpactMatchResultsFromMatchCodes(input: {
  matches: readonly MatchLike[];
  matchCodes: readonly string[];
  teamNameById: ReadonlyMap<string, string>;
}): ScoreImpactMatchResult[] {
  if (!input.matchCodes.length) return [];

  const byCode = new Map(input.matches.map((m) => [m.match_code, m]));
  const results: ScoreImpactMatchResult[] = [];
  const seen = new Set<string>();

  for (const rawCode of input.matchCodes) {
    const matchCode = rawCode.trim();
    if (!matchCode || seen.has(matchCode)) continue;
    seen.add(matchCode);

    const match = byCode.get(matchCode);
    if (!match) continue;

    const homeName =
      (match.home_team_id && input.teamNameById.get(match.home_team_id)) || "Home";
    const awayName =
      (match.away_team_id && input.teamNameById.get(match.away_team_id)) || "Away";
    const homeGoals = match.home_goals;
    const awayGoals = match.away_goals;
    const label =
      homeGoals != null && awayGoals != null
        ? `${homeName} ${homeGoals}–${awayGoals} ${awayName}`
        : `${homeName} vs ${awayName}`;

    results.push({
      matchCode,
      label,
      groupCode: match.group_code,
      winnerTeamId: match.winner_team_id,
      homeTeamId: match.home_team_id,
      awayTeamId: match.away_team_id,
      stageCode: match.stage_code,
    });
  }

  return results;
}

export function scoreImpactSignatureFromMatchResults(
  matchResults: readonly ScoreImpactMatchResult[],
): string {
  return buildScoreSignatureFromMatches(matchResults);
}
