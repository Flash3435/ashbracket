import type { ScoringCorrectionKind } from "./scoringCorrectionDisplay";

export type LatestScoreEventKind =
  | "single_match"
  | "multi_match"
  | "generic_update"
  | "scoring_refresh";

export type LeaderboardLatestScoreEventContext = {
  hasValidSnapshot: boolean;
  eventKind: LatestScoreEventKind;
  matchLabel: string | null;
  scoreline: string | null;
  matchCodes: string[];
  matchCount: number;
  /** True when the update can be attributed to one match (code or resolvable label). */
  isSingleMatch: boolean;
  winnerTeamName: string | null;
  loserTeamName: string | null;
  matchupShortLabel: string | null;
  /**
   * Named scoring corrections recorded on this score-impact event.
   * Display attribution requires an explicit kind here — do not infer corrections
   * from standings residuals alone.
   */
  scoringCorrectionKinds: ScoringCorrectionKind[];
};

function readString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function readMatchCodesArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((code): code is string => typeof code === "string" && code.trim().length > 0)
    .map((code) => code.trim());
}

function readMatchCodesFromMetadata(metadata: Record<string, unknown>): string[] {
  const fromArray = readMatchCodesArray(metadata.match_codes);
  if (fromArray.length > 0) return fromArray;

  const fromResult = readMatchCodesArray(metadata.result_match_codes);
  if (fromResult.length > 0) return fromResult;

  const single = readString(metadata.match_id) ?? readString(metadata.match_code);
  if (single) return [single];

  if (Array.isArray(metadata.matches)) {
    const codes = metadata.matches
      .map((entry) => {
        if (entry == null || typeof entry !== "object") return null;
        return readString((entry as { match_code?: unknown }).match_code);
      })
      .filter((code): code is string => Boolean(code));
    if (codes.length > 0) return codes;
  }

  return [];
}

const SCORING_REFRESH_TRIGGERS = new Set([
  "admin_manual_recompute",
  "admin_recompute_all_pools",
]);

function isScoringRefreshTrigger(trigger: string | null): boolean {
  return trigger != null && SCORING_REFRESH_TRIGGERS.has(trigger);
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

function parseDefPatternLabel(text: string): string | null {
  const defMatch = text.match(/([A-Za-z][\w\s.'-]+?)\s+def\.\s+([A-Za-z][\w\s.'-]+)/u);
  if (!defMatch) return null;
  return `${defMatch[1]!.trim()} def. ${defMatch[2]!.trim()}`;
}

function readLabelFromBodyOrTitle(metadata: Record<string, unknown>): string | null {
  const candidates = [
    readString(metadata.title),
    readString(metadata.body),
    readString(metadata.headline),
  ];
  for (const text of candidates) {
    if (!text) continue;
    const parsed = parseMatchupFromScoreLabel(text);
    if (parsed.winnerTeamName) return text;
    const defLabel = parseDefPatternLabel(text);
    if (defLabel) return defLabel;
  }
  return null;
}

export function formatMatchupShortLabel(input: {
  winnerTeamName: string | null;
  loserTeamName: string | null;
  fallbackLabel?: string | null;
}): string | null {
  if (input.winnerTeamName && input.loserTeamName) {
    return `${input.winnerTeamName} def. ${input.loserTeamName}`;
  }
  const fallback = input.fallbackLabel?.trim() || null;
  if (fallback) {
    const defLabel = parseDefPatternLabel(fallback);
    if (defLabel) return defLabel;
  }
  return fallback;
}

function resolveEventKind(input: {
  matchCount: number;
  hasResolvableSingleMatch: boolean;
  trigger: string | null;
}): LatestScoreEventKind {
  if (input.matchCount >= 2) return "multi_match";
  if (input.matchCount === 1 || input.hasResolvableSingleMatch) return "single_match";
  if (isScoringRefreshTrigger(input.trigger)) return "scoring_refresh";
  // Pool-wide ledger recalc without match attribution — not a labeled match result.
  if (input.trigger === "tournament_sync") return "scoring_refresh";
  return "generic_update";
}

export function parseLatestScoreEventContext(
  metadata: Record<string, unknown>,
  options?: { hasValidSnapshot?: boolean },
): LeaderboardLatestScoreEventContext {
  const matchCodes = readMatchCodesFromMetadata(metadata);
  const matchLabel =
    readString(metadata.match_label) ?? readLabelFromBodyOrTitle(metadata);
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

  const hasResolvableSingleMatch = Boolean(
    matchupShortLabel || (matchLabel && parseMatchupFromScoreLabel(matchLabel).winnerTeamName),
  );
  const trigger = readString(metadata.trigger);
  const matchCount = matchCodes.length;
  const eventKind = resolveEventKind({
    matchCount,
    hasResolvableSingleMatch,
    trigger,
  });

  const scoringCorrectionKinds: ScoringCorrectionKind[] = [];
  if (Array.isArray(metadata.scoring_corrections)) {
    for (const entry of metadata.scoring_corrections) {
      if (entry == null || typeof entry !== "object") continue;
      const kind = (entry as { kind?: unknown }).kind;
      if (
        kind === "third_place_qualifier" ||
        kind === "knockout_prediction_depth_cap" ||
        kind === "m101_knockout_depth_transition"
      ) {
        scoringCorrectionKinds.push(kind);
      }
    }
  }

  return {
    hasValidSnapshot: options?.hasValidSnapshot ?? false,
    eventKind,
    matchLabel,
    scoreline,
    matchCodes,
    matchCount,
    isSingleMatch: eventKind === "single_match",
    winnerTeamName,
    loserTeamName,
    matchupShortLabel,
    scoringCorrectionKinds,
  };
}
