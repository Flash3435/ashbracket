export type LeaderboardLatestScoreEventContext = {
  hasValidSnapshot: boolean;
  matchLabel: string | null;
  scoreline: string | null;
  matchCodes: string[];
  matchCount: number;
  isSingleMatch: boolean;
  winnerTeamName: string | null;
  loserTeamName: string | null;
  matchupShortLabel: string | null;
};

function readString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function readMatchCodes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((code): code is string => typeof code === "string" && code.trim().length > 0)
    .map((code) => code.trim());
}

/** Parse "Morocco 2–1 Canada" into winner/loser team names when possible. */
export function parseMatchupFromScoreLabel(
  label: string | null | undefined,
): { winnerTeamName: string | null; loserTeamName: string | null } {
  const trimmed = label?.trim();
  if (!trimmed) {
    return { winnerTeamName: null, loserTeamName: null };
  }

  const scoreMatch = trimmed.match(/^(.+?)\s+(\d+)\s*[–-]\s*(\d+)\s+(.+)$/u);
  if (!scoreMatch) {
    return { winnerTeamName: null, loserTeamName: null };
  }

  const home = scoreMatch[1]!.trim();
  const homeGoals = Number(scoreMatch[2]);
  const awayGoals = Number(scoreMatch[3]);
  const away = scoreMatch[4]!.trim();

  if (!Number.isFinite(homeGoals) || !Number.isFinite(awayGoals) || homeGoals === awayGoals) {
    return { winnerTeamName: null, loserTeamName: null };
  }

  if (homeGoals > awayGoals) {
    return { winnerTeamName: home, loserTeamName: away };
  }
  return { winnerTeamName: away, loserTeamName: home };
}

export function formatMatchupShortLabel(input: {
  winnerTeamName: string | null;
  loserTeamName: string | null;
  fallbackLabel?: string | null;
}): string | null {
  if (input.winnerTeamName && input.loserTeamName) {
    return `${input.winnerTeamName} def. ${input.loserTeamName}`;
  }
  return input.fallbackLabel?.trim() || null;
}

export function parseLatestScoreEventContext(
  metadata: Record<string, unknown>,
  options?: { hasValidSnapshot?: boolean },
): LeaderboardLatestScoreEventContext {
  const matchCodes = readMatchCodes(metadata.match_codes);
  const matchLabel = readString(metadata.match_label);
  const scoreline = readString(metadata.scoreline) ?? matchLabel;
  const parsed = parseMatchupFromScoreLabel(scoreline);

  const bracketImpact =
    metadata.bracket_impact != null && typeof metadata.bracket_impact === "object"
      ? (metadata.bracket_impact as Record<string, unknown>)
      : null;

  const winnerTeamName =
    parsed.winnerTeamName ??
    readString(bracketImpact?.winner_team_name) ??
    null;
  const loserTeamName =
    parsed.loserTeamName ??
    readString(bracketImpact?.loser_team_name) ??
    null;

  const matchupShortLabel = formatMatchupShortLabel({
    winnerTeamName,
    loserTeamName,
    fallbackLabel: matchLabel,
  });

  return {
    hasValidSnapshot: options?.hasValidSnapshot ?? false,
    matchLabel,
    scoreline,
    matchCodes,
    matchCount: matchCodes.length,
    isSingleMatch: matchCodes.length === 1,
    winnerTeamName,
    loserTeamName,
    matchupShortLabel,
  };
}
