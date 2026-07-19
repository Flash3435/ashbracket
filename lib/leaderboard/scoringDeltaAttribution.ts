/**
 * Shared scoring-delta attribution for leaderboard / dashboard “Latest” copy.
 * Source of truth is the standings delta broken into known scoring categories —
 * never the most recently finished match alone.
 */

import { formatPoolPoints } from "@/lib/format/poolPoints";

export const TOURNAMENT_BONUS_KEYS = [
  "most_goals",
  "most_yellow_cards",
  "most_red_cards",
] as const;

export type TournamentBonusKey = (typeof TOURNAMENT_BONUS_KEYS)[number];

export type ScoringDeltaCategory =
  | "match"
  | "progression"
  | "third_place"
  | "champion"
  | "most_goals"
  | "most_yellow_cards"
  | "most_red_cards"
  | "manual_adjustment"
  | "correction"
  | "unknown";

export type ScoringDeltaAttribution = {
  category: ScoringDeltaCategory;
  points: number;
  label: string;
  detail?: string;
  matchId?: string;
  teamId?: string;
};

export function isTournamentBonusKey(key: string): key is TournamentBonusKey {
  return (TOURNAMENT_BONUS_KEYS as readonly string[]).includes(key);
}

export function tournamentBonusCategoryLabel(key: TournamentBonusKey): string {
  switch (key) {
    case "most_goals":
      return "Most Goals";
    case "most_yellow_cards":
      return "Most Yellow Cards";
    case "most_red_cards":
      return "Most Red Cards";
  }
}

export function formatSignedPointsToken(points: number): string {
  const abs = formatPoolPoints(Math.abs(points));
  if (points > 0) return `+${abs}`;
  if (points < 0) return `−${abs}`;
  return "+0";
}

/** Participant-facing label for one attributed scoring component. */
export function formatScoringDeltaAttributionLabel(
  attribution: ScoringDeltaAttribution,
): string {
  const token = formatSignedPointsToken(attribution.points);
  switch (attribution.category) {
    case "most_goals":
      return attribution.points < 0
        ? `Most Goals bonus removed ${token}`
        : `Most Goals bonus ${token}`;
    case "most_yellow_cards":
      return attribution.points < 0
        ? `Most Yellow Cards bonus removed ${token}`
        : `Most Yellow Cards bonus ${token}`;
    case "most_red_cards":
      return attribution.points < 0
        ? `Most Red Cards bonus removed ${token}`
        : `Most Red Cards bonus ${token}`;
    case "champion":
      return `Champion pick ${token}`;
    case "third_place":
      return `Best third-place scoring ${token}`;
    case "manual_adjustment":
      return `Manual scoring adjustment ${token}`;
    case "correction":
      return `Scoring correction ${token}`;
    case "match":
    case "progression":
      return attribution.label.includes(token)
        ? attribution.label
        : `${attribution.label} ${token}`;
    case "unknown":
    default:
      return `Scoring adjustment ${token}`;
  }
}

export type ScoringDeltaPresentation = {
  /** One-line summary for the leaderboard “Latest” row. */
  latestLine: string | null;
  /** Categorized component lines (bonuses, corrections, extras). */
  componentLines: string[];
  /** True when more than one distinct scoring source contributed. */
  isMultiSource: boolean;
  attributions: ScoringDeltaAttribution[];
};

function matchLineLabel(input: {
  points: number;
  matchupShortLabel?: string | null;
  matchLabel?: string | null;
  winnerTeamName?: string | null;
  eventKind?: "single_match" | "multi_match" | string | null;
}): string {
  const token = formatSignedPointsToken(input.points);
  if (input.eventKind === "multi_match") {
    return `Latest matches: ${token}`;
  }
  if (input.matchupShortLabel) {
    return `${input.matchupShortLabel}: ${token}`;
  }
  if (input.matchLabel) {
    return `Latest: ${input.matchLabel} ${token}`;
  }
  if (input.winnerTeamName) {
    return `Latest: ${input.winnerTeamName} advanced ${token}`;
  }
  return `Latest: match result ${token}`;
}

/**
 * Build presentation copy from structured attributions.
 * Never invents a match/team label for unknown or bonus-only deltas.
 */
export function presentScoringDeltaAttributions(input: {
  attributions: readonly ScoringDeltaAttribution[];
  totalDelta: number;
  /** Optional match context used only when a match/progression attribution exists. */
  matchContext?: {
    matchupShortLabel?: string | null;
    matchLabel?: string | null;
    winnerTeamName?: string | null;
    eventKind?: "single_match" | "multi_match" | string | null;
  } | null;
}): ScoringDeltaPresentation {
  const attributions = input.attributions.filter((a) => a.points !== 0);
  if (attributions.length === 0 || input.totalDelta === 0) {
    return {
      latestLine: null,
      componentLines: [],
      isMultiSource: false,
      attributions: [],
    };
  }

  const matchLike = attributions.filter(
    (a) => a.category === "match" || a.category === "progression",
  );
  const bonuses = attributions.filter((a) => isTournamentBonusKey(a.category));

  const isMultiSource = attributions.length > 1;
  const componentLines = attributions.map(formatScoringDeltaAttributionLabel);

  if (!isMultiSource) {
    const only = attributions[0]!;
    if (only.category === "match" || only.category === "progression") {
      return {
        latestLine: matchLineLabel({
          points: only.points,
          matchupShortLabel: input.matchContext?.matchupShortLabel,
          matchLabel: input.matchContext?.matchLabel ?? only.label,
          winnerTeamName: input.matchContext?.winnerTeamName,
          eventKind: input.matchContext?.eventKind,
        }),
        componentLines: [],
        isMultiSource: false,
        attributions,
      };
    }
    if (isTournamentBonusKey(only.category)) {
      const label = formatScoringDeltaAttributionLabel(only);
      return {
        latestLine: `Latest: ${label}`,
        componentLines: only.detail ? [only.detail] : [],
        isMultiSource: false,
        attributions,
      };
    }
    return {
      latestLine: `Latest: ${formatScoringDeltaAttributionLabel(only)}`,
      componentLines: [],
      isMultiSource: false,
      attributions,
    };
  }

  // Multiple sources — never collapse under one match label.
  const totalToken = formatSignedPointsToken(input.totalDelta);
  const allBonuses =
    bonuses.length === attributions.length && matchLike.length === 0;
  const latestLine = allBonuses
    ? `Latest: Tournament bonuses ${totalToken}`
    : `Latest scoring: ${totalToken}`;

  return {
    latestLine,
    componentLines,
    isMultiSource: true,
    attributions,
  };
}

/**
 * Greedily attribute a residual standings delta to known tournament-bonus awards.
 * Uses current earned bonus totals (pick vs published winners); only claims
 * amounts that fit within the residual.
 */
export function attributeTournamentBonusResidual(input: {
  residual: number;
  earnedByKey: ReadonlyMap<TournamentBonusKey, number>;
}): {
  attributedByKey: Partial<Record<TournamentBonusKey, number>>;
  attributedTotal: number;
  remaining: number;
} {
  const attributedByKey: Partial<Record<TournamentBonusKey, number>> = {};
  if (input.residual === 0) {
    return { attributedByKey, attributedTotal: 0, remaining: 0 };
  }

  const entries = TOURNAMENT_BONUS_KEYS.map((key) => ({
    key,
    points: input.earnedByKey.get(key) ?? 0,
  })).filter((row) => row.points !== 0);

  // Prefer larger awards first so +35 → goals 25 + red 10, not partial fits.
  entries.sort((a, b) => Math.abs(b.points) - Math.abs(a.points));

  let remaining = input.residual;
  let attributedTotal = 0;

  for (const row of entries) {
    if (remaining === 0) break;
    // Same sign only — do not invent offsetting awards.
    if (Math.sign(row.points) !== Math.sign(remaining)) continue;
    if (Math.abs(row.points) > Math.abs(remaining)) continue;
    attributedByKey[row.key] = row.points;
    attributedTotal += row.points;
    remaining -= row.points;
  }

  return { attributedByKey, attributedTotal, remaining };
}

export function buildTournamentBonusAttributions(
  attributedByKey: Partial<Record<TournamentBonusKey, number>>,
  detailByKey?: Partial<Record<TournamentBonusKey, string>>,
): ScoringDeltaAttribution[] {
  const out: ScoringDeltaAttribution[] = [];
  for (const key of TOURNAMENT_BONUS_KEYS) {
    const points = attributedByKey[key];
    if (points == null || points === 0) continue;
    out.push({
      category: key,
      points,
      label: formatScoringDeltaAttributionLabel({
        category: key,
        points,
        label: "",
      }),
      detail: detailByKey?.[key],
    });
  }
  return out;
}
