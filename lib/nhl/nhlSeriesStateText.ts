import type { NhlSeriesRow } from "./types";

export type NhlSeriesStatePresentation = {
  /** Short badge: Pending, In progress, Final */
  statusLabel: string;
  /** Wins in bracket order (higher seed vs lower seed), e.g. "3–2"; null when no countable games yet */
  scoreHigherLower: string | null;
  /** Main matchup storyline */
  primaryLine: string;
  winnerTeamId: string | null;
};

const EN_DASH = "\u2013";

/** For matchup rows: compare a bracket slot's team id to the recorded series winner (if any). */
export function nhlTeamSlotOutcome(
  winnerTeamId: string | null | undefined,
  slotTeamId: string | null | undefined,
): "winner" | "loser" | "neutral" {
  if (!winnerTeamId || !slotTeamId) return "neutral";
  if (winnerTeamId === slotTeamId) return "winner";
  return "loser";
}

function clampNonNegInt(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const f = Math.floor(n);
  return f < 0 ? 0 : f;
}

/**
 * Drops common two-word city prefixes so "Boston Bruins" → "Bruins", "Los Angeles Kings" → "Kings".
 * Falls back sensibly on edge cases ("Maple Leafs", etc.).
 */
export function franchiseShortName(teamName: string | null | undefined): string | null {
  if (!teamName?.trim()) return null;
  const parts = teamName.trim().split(/\s+/);
  if (parts.length === 0) return null;
  const p0 = parts[0]!.toLowerCase();
  const p1 = parts.length > 1 ? parts[1]!.toLowerCase() : "";
  const two = `${p0} ${p1}`.trim();
  let start = 1;
  if (
    ["los angeles", "new york", "new jersey", "tampa bay", "san jose", "las vegas"].includes(two)
  ) {
    start = 2;
  } else if ((p0 === "st." || p0 === "st") && p1 === "louis") {
    start = 2;
  }
  if (parts[start] === "Maple" && parts[start + 1] === "Leafs") {
    return "Maple Leafs";
  }
  const rest = parts.slice(start).join(" ");
  return rest || teamName.trim();
}

function teamDisplayNick(series: NhlSeriesRow, side: "higher" | "lower"): string {
  const name = side === "higher" ? series.higher_team_name : series.lower_team_name;
  const abbr = side === "higher" ? series.higher_team_abbr : series.lower_team_abbr;
  return franchiseShortName(name) ?? abbr ?? name ?? "TBD";
}

function teamHasPresence(series: NhlSeriesRow, side: "higher" | "lower"): boolean {
  if (side === "higher") {
    return Boolean(series.higher_seed_team_id && (series.higher_team_abbr || series.higher_team_name));
  }
  return Boolean(series.lower_seed_team_id && (series.lower_team_abbr || series.lower_team_name));
}

function pairingComplete(series: NhlSeriesRow): boolean {
  return teamHasPresence(series, "higher") && teamHasPresence(series, "lower");
}

/** Maps `status` plus whether any games appear on the ledger to badge copy. */
function statusBadge(status: NhlSeriesRow["status"], hasGames: boolean): string {
  if (status === "complete") return "Final";
  if (status === "in_progress") return "In progress";
  if (status === "pending" && hasGames) return "In progress";
  return "Pending";
}

/** Visible score in bracket (higher seed listed first vs lower seed). */
export function formatNhlHigherLowerScore(series: Pick<NhlSeriesRow, "games_won_by_higher_seed" | "games_won_by_lower_seed">): string | null {
  const hi = clampNonNegInt(series.games_won_by_higher_seed);
  const lo = clampNonNegInt(series.games_won_by_lower_seed);
  if (hi === 0 && lo === 0) return null;
  return `${hi}${EN_DASH}${lo}`;
}

/**
 * Human-readable series state driven by `nhl_series` scoring + status fields.
 */
export function buildNhlSeriesStatePresentation(series: NhlSeriesRow): NhlSeriesStatePresentation {
  const hi = clampNonNegInt(series.games_won_by_higher_seed);
  const lo = clampNonNegInt(series.games_won_by_lower_seed);
  const hasGames = hi > 0 || lo > 0;
  const bracketScore = formatNhlHigherLowerScore(series);
  const pairing = pairingComplete(series);
  const winnerId = series.winner_team_id;
  const nh = teamDisplayNick(series, "higher");
  const nl = teamDisplayNick(series, "lower");

  const winnerIsKnown =
    Boolean(winnerId && series.higher_seed_team_id && series.lower_seed_team_id) &&
    (winnerId === series.higher_seed_team_id || winnerId === series.lower_seed_team_id);

  if (!pairing) {
    return {
      statusLabel: "Pending",
      scoreHigherLower: bracketScore,
      primaryLine:
        series.lower_seed_team_id === null && series.higher_seed_team_id === null
          ? "Series not started"
          : "Awaiting matchup",
      winnerTeamId: null,
    };
  }

  const statusLbl = statusBadge(series.status, hasGames);

  if (winnerIsKnown && winnerId) {
    const byHigher = winnerId === series.higher_seed_team_id;
    const ww = byHigher ? hi : lo;
    const lw = byHigher ? lo : hi;
    const nickW = byHigher ? nh : nl;
    const nickL = byHigher ? nl : nh;
    const scoreWinnerLoser =
      !(ww === 0 && lw === 0) ? `${ww}${EN_DASH}${lw}` : bracketScore ?? null;
    const primary =
      scoreWinnerLoser !== null ? `${nickW} defeated ${nickL} ${scoreWinnerLoser}` : `${nickW} defeated ${nickL}`;
    return {
      statusLabel: "Final",
      scoreHigherLower:
        bracketScore ?? (!(hi === 0 && lo === 0) ? `${hi}${EN_DASH}${lo}` : null),
      primaryLine: primary,
      winnerTeamId: winnerId,
    };
  }

  if (series.status === "complete" && !winnerId) {
    return {
      statusLabel: "Final",
      scoreHigherLower: bracketScore,
      primaryLine: hasGames ? "Final — winner not recorded" : "No result recorded yet",
      winnerTeamId: null,
    };
  }

  if (!hasGames) {
    return {
      statusLabel: statusLbl,
      scoreHigherLower: null,
      primaryLine: "No games recorded yet",
      winnerTeamId: null,
    };
  }

  if (hi === lo) {
    return {
      statusLabel: statusLbl,
      scoreHigherLower: bracketScore,
      primaryLine: `Series tied ${hi}${EN_DASH}${lo}`,
      winnerTeamId: null,
    };
  }

  if (hi > lo) {
    return {
      statusLabel: statusLbl,
      scoreHigherLower: bracketScore,
      primaryLine: `${nh} leads ${nl} ${hi}${EN_DASH}${lo}`,
      winnerTeamId: null,
    };
  }

  return {
    statusLabel: statusLbl,
    scoreHigherLower: bracketScore,
    primaryLine: `${nl} leads ${nh} ${lo}${EN_DASH}${hi}`,
    winnerTeamId: null,
  };
}
