import type {
  BracketImpactActivityMetadata,
  ScoreImpactLeaderboardMovementMetadata,
  ScoreImpactReason,
  ScoreImpactSoftImpactMetadata,
  ScoreImpactSoftImpactReason,
  ScoreImpactTopGainerMetadata,
} from "./types";
import {
  formatSoftImpactCountLine,
  formatSoftImpactNamesLine,
} from "./buildSoftImpact";
import { formatBracketImpactSummaryLines } from "@/lib/leaderboard/leaderboardBracketImpactDisplay";

export type ParsedScoreImpactMetadata = {
  matchLabel: string | null;
  scoreline: string | null;
  groupCode: string | null;
  pointsChanged: boolean;
  affectedCount: number;
  topGainers: ScoreImpactTopGainerMetadata[];
  leaderboardMovement: ScoreImpactLeaderboardMovementMetadata | null;
  reason: ScoreImpactReason | null;
  softImpact: ScoreImpactSoftImpactMetadata | null;
};

function readString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function readNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function readTopGainers(raw: unknown): ScoreImpactTopGainerMetadata[] {
  if (!Array.isArray(raw)) return [];

  const out: ScoreImpactTopGainerMetadata[] = [];
  for (const row of raw) {
    if (row == null || typeof row !== "object") continue;
    const name = readString((row as { display_name?: unknown }).display_name);
    const delta =
      readNumber((row as { delta?: unknown }).delta) ??
      readNumber((row as { points_gained?: unknown }).points_gained);
    if (!name || delta == null || delta <= 0) continue;
    out.push({ display_name: name, delta });
  }
  return out.slice(0, 3);
}

function readReason(v: unknown): ScoreImpactReason | null {
  if (
    v === "group_incomplete" ||
    v === "group_complete" ||
    v === "knockout_result" ||
    v === "bonus_update" ||
    v === "other"
  ) {
    return v;
  }
  return null;
}

function readSoftImpactReason(v: unknown): ScoreImpactSoftImpactReason {
  if (
    v === "winner_in_path" ||
    v === "draw_watchlist" ||
    v === "both_teams_in_path" ||
    v === "unknown"
  ) {
    return v;
  }
  return "unknown";
}

function readSampleNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const name of raw) {
    if (typeof name !== "string") continue;
    const trimmed = name.trim();
    if (!trimmed) continue;
    out.push(trimmed);
  }
  return out.slice(0, 3);
}

function readSoftImpact(raw: unknown): ScoreImpactSoftImpactMetadata | null {
  if (raw == null || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const enabled = row.enabled === true;
  const affectedCount = readNumber(row.affected_count) ?? 0;
  if (!enabled || affectedCount <= 0) return null;

  const teamName = readString(row.team_name) ?? undefined;
  const teamId = readString(row.team_id) ?? undefined;

  return {
    enabled: true,
    team_name: teamName,
    team_id: teamId,
    affected_count: affectedCount,
    sample_names: readSampleNames(row.sample_names),
    reason: readSoftImpactReason(row.reason),
  };
}

function readBracketImpactSummary(raw: unknown): {
  uniformPointsDelta: number | null;
  summary: BracketImpactActivityMetadata["summary"] | null;
} {
  if (raw == null || typeof raw !== "object") {
    return { uniformPointsDelta: null, summary: null };
  }
  const row = raw as BracketImpactActivityMetadata;
  const uniformPointsDelta =
    typeof row.uniform_points_delta === "number" &&
    Number.isFinite(row.uniform_points_delta)
      ? row.uniform_points_delta
      : null;
  return {
    uniformPointsDelta,
    summary: row.summary ?? null,
  };
}

function readLeaderboardMovement(
  raw: unknown,
): ScoreImpactLeaderboardMovementMetadata | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const row = raw[0];
  if (row == null || typeof row !== "object") return null;
  const displayName = readString((row as { display_name?: unknown }).display_name);
  const fromRank = readNumber((row as { from_rank?: unknown }).from_rank);
  const toRank = readNumber((row as { to_rank?: unknown }).to_rank);
  if (!displayName || fromRank == null || toRank == null || fromRank === toRank) {
    return null;
  }
  return { display_name: displayName, from_rank: fromRank, to_rank: toRank };
}

export function parseScoreImpactMetadata(
  metadata: Record<string, unknown>,
): ParsedScoreImpactMetadata {
  const topFromMeta = readTopGainers(metadata.top_gainers);
  const topFromLegacy =
    topFromMeta.length > 0 ? topFromMeta : readTopGainers(metadata.point_gainers);

  const pointsChanged =
    metadata.points_changed === true ||
    (metadata.points_changed == null && topFromLegacy.length > 0);

  return {
    matchLabel: readString(metadata.match_label),
    scoreline: readString(metadata.scoreline) ?? readString(metadata.match_label),
    groupCode: readString(metadata.group_code),
    pointsChanged,
    affectedCount: readNumber(metadata.affected_count) ?? topFromLegacy.length,
    topGainers: topFromLegacy,
    leaderboardMovement: readLeaderboardMovement(metadata.leaderboard_movement),
    reason: readReason(metadata.reason),
    softImpact: readSoftImpact(metadata.soft_impact),
  };
}

function formatDelta(delta: number): string {
  return Number.isInteger(delta) ? String(delta) : delta.toFixed(1);
}

function formatGainerLine(gainers: ScoreImpactTopGainerMetadata[]): string | null {
  if (gainers.length === 0) return null;
  return gainers
    .map((g) => `${g.display_name} +${formatDelta(g.delta)}`)
    .join(", ");
}

function rankOrdinal(n: number): string {
  if (n === 1) return "1st";
  if (n === 2) return "2nd";
  if (n === 3) return "3rd";
  return `${n}th`;
}

function pendingNote(groupCode: string, seed: string): string {
  const templates = [
    `No pool points yet — Group ${groupCode} points settle after the group finishes.`,
    `No scoring change yet. Group ${groupCode} points land once all group matches are complete.`,
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return templates[hash % templates.length]!;
}

export type ScoreImpactDisplayLines = {
  headline: string;
  detailLines: string[];
  showLeaderboardLink: boolean;
  showGainerNames: boolean;
  showSoftImpactNames: boolean;
};

function appendSoftImpactLines(
  detailLines: string[],
  softImpact: ScoreImpactSoftImpactMetadata,
  options: {
    allowParticipantNames: boolean;
    compact?: boolean;
  },
): void {
  if (!options.allowParticipantNames) return;

  if (options.compact) {
    detailLines.push(formatSoftImpactCountLine(softImpact, { compact: true }));
    return;
  }

  detailLines.push(formatSoftImpactCountLine(softImpact));
  const namesLine = formatSoftImpactNamesLine(softImpact.sample_names);
  if (namesLine) {
    detailLines.push(namesLine);
  }
}

export function buildScoreImpactDisplayLines(
  metadata: Record<string, unknown>,
  options: {
    /** When false, omit participant names even if points changed (pre-lock privacy). */
    allowParticipantNames: boolean;
    /** Fallback body text for legacy rows without structured metadata. */
    fallbackBodyText?: string;
    /** Dashboard: one compact soft-impact line instead of count + names. */
    compact?: boolean;
  },
): ScoreImpactDisplayLines | null {
  const parsed = parseScoreImpactMetadata(metadata);
  const hasStructured =
    parsed.matchLabel != null ||
    parsed.scoreline != null ||
    metadata.points_changed != null ||
    metadata.reason != null;

  if (!hasStructured) {
    const fallback = options.fallbackBodyText?.trim();
    if (!fallback) return null;
    const parts = fallback.split(/\n+/).map((s) => s.trim()).filter(Boolean);
    return {
      headline: parts[0] ?? fallback,
      detailLines: parts.slice(1),
      showLeaderboardLink: false,
      showGainerNames: false,
      showSoftImpactNames: false,
    };
  }

  const scoreLabel = parsed.scoreline ?? parsed.matchLabel;
  const groupCode = parsed.groupCode;
  const reason = parsed.reason;

  if (parsed.pointsChanged) {
    const headline =
      reason === "group_complete" && groupCode
        ? `Group ${groupCode} is complete.`
        : scoreLabel
          ? `${scoreLabel} is final.`
          : "Pool scores updated.";

    const detailLines: string[] = [];
    const bracketCount = parsed.affectedCount;
    const { uniformPointsDelta, summary } = readBracketImpactSummary(
      metadata.bracket_impact,
    );

    if (uniformPointsDelta == null) {
      const bracketLabel =
        bracketCount === 1
          ? "1 bracket gained points."
          : `${bracketCount} brackets gained points.`;
      detailLines.push(bracketLabel);
    }

    if (reason === "group_complete" && groupCode) {
      detailLines.push(`Group ${groupCode} advancement points are in.`);
    }

    const showGainerNames =
      options.allowParticipantNames &&
      parsed.topGainers.length > 0 &&
      uniformPointsDelta == null;
    if (showGainerNames) {
      const gainerLine = formatGainerLine(parsed.topGainers);
      if (gainerLine) {
        detailLines.push(`Biggest boost: ${gainerLine}.`);
      }
    }

    const bracketImpactLines = formatBracketImpactSummaryLines({
      uniformPointsDelta,
      affectedCount: bracketCount,
      summary,
      hasRankMovement: parsed.leaderboardMovement != null,
    });
    detailLines.push(...bracketImpactLines);

    if (options.allowParticipantNames && parsed.leaderboardMovement) {
      const m = parsed.leaderboardMovement;
      detailLines.push(
        `Leaderboard shakeup: ${m.display_name} jumped from ${rankOrdinal(m.from_rank)} to ${rankOrdinal(m.to_rank)}.`,
      );
    }

    return {
      headline,
      detailLines,
      showLeaderboardLink: true,
      showGainerNames,
      showSoftImpactNames: false,
    };
  }

  const headline = scoreLabel ? `${scoreLabel} is final.` : "Match result recorded.";
  const detailLines: string[] = [];

  if (reason === "group_incomplete" && groupCode) {
    detailLines.push(pendingNote(groupCode, scoreLabel ?? groupCode));
  } else if (reason === "bonus_update") {
    detailLines.push("Bonus stat leaders updated — check back for scoring changes.");
  }

  const softImpact = !parsed.pointsChanged ? parsed.softImpact : null;
  const showSoftImpactNames =
    options.allowParticipantNames &&
    !options.compact &&
    Boolean(softImpact && softImpact.sample_names.length > 0);
  if (softImpact) {
    appendSoftImpactLines(detailLines, softImpact, options);
  }

  return {
    headline,
    detailLines,
    showLeaderboardLink: false,
    showGainerNames: false,
    showSoftImpactNames,
  };
}

/** Strip server-only fields before any client serialization audit. */
export function clientSafeScoreImpactMetadata(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  const {
    point_gainers: _pg,
    leaderboard_momentum: _lm,
    previous_standings: _ps,
    soft_impact: rawSoftImpact,
    bracket_impact: rawBracketImpact,
    ...rest
  } = metadata;
  void _pg;
  void _lm;
  void _ps;

  let safeBracketImpact: Record<string, unknown> | undefined;
  if (rawBracketImpact != null && typeof rawBracketImpact === "object") {
    const { rows: _rows, ...bracketSummary } = rawBracketImpact as Record<string, unknown>;
    void _rows;
    safeBracketImpact = bracketSummary;
  }

  if (rawSoftImpact == null || typeof rawSoftImpact !== "object") {
    return safeBracketImpact ? { ...rest, bracket_impact: safeBracketImpact } : rest;
  }

  const soft = { ...(rawSoftImpact as Record<string, unknown>) };
  delete soft.team_id;

  return {
    ...rest,
    ...(safeBracketImpact ? { bracket_impact: safeBracketImpact } : {}),
    soft_impact: soft,
  };
}
