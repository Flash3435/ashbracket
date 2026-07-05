import type { PilotStandingsRow } from "@/lib/admin/pilotStandingsSnapshot";
import { buildLeaderboardMomentum } from "@/lib/leaderboard/buildLeaderboardMomentum";
import {
  STANDINGS_CAPTURE_VERSION,
  STANDINGS_CAPTURE_VERSION_KEY,
} from "@/lib/leaderboard/validateLeaderboardMomentumSnapshot";
import {
  bracketImpactToMetadata,
  buildBracketImpactForPool,
} from "./buildBracketImpact";
import { formatBiggestMover } from "./detectScoreImpact";
import type {
  ScoreImpactActivityMetadata,
  ScoreImpactAnalysis,
  ScoreImpactMatchResult,
  ScoreImpactPointGainerMetadata,
  ScoreImpactSoftImpactMetadata,
  ScoreImpactTopGainerMetadata,
} from "./types";
import type { BracketImpactResult } from "./buildBracketImpact";

function stageLabelFromCode(stageCode: string | null): string | undefined {
  if (!stageCode) return undefined;
  if (stageCode === "group") return "Group stage";
  if (stageCode.startsWith("knockout") || stageCode.includes("round")) {
    return "Knockout";
  }
  return stageCode;
}

function topGainersForMetadata(
  analysis: ScoreImpactAnalysis,
  participantNames: ReadonlyMap<string, string>,
): ScoreImpactTopGainerMetadata[] {
  if (!analysis.pointsChanged) return [];
  return analysis.pointGainers.slice(0, 3).map((g) => ({
    display_name: participantNames.get(g.participantId) ?? g.displayName,
    delta: g.pointsGained,
  }));
}

function pointGainersForRecap(
  analysis: ScoreImpactAnalysis,
  participantNames: ReadonlyMap<string, string>,
): ScoreImpactPointGainerMetadata[] {
  if (!analysis.pointsChanged) return [];
  return analysis.pointGainers.slice(0, 5).map((g) => ({
    participant_id: g.participantId,
    display_name: participantNames.get(g.participantId) ?? g.displayName,
    points_gained: g.pointsGained,
  }));
}

export function buildScoreImpactMetadata(input: {
  analysis: ScoreImpactAnalysis;
  beforeRows: PilotStandingsRow[];
  afterRows: PilotStandingsRow[];
  matchResults: ScoreImpactMatchResult[];
  participantNames: ReadonlyMap<string, string>;
  trigger: string;
  sourceKey: string;
  standingsHash: string;
  scoreSignature: string;
  softImpact?: ScoreImpactSoftImpactMetadata | null;
  bracketImpact?: BracketImpactResult | null;
}): ScoreImpactActivityMetadata {
  const { analysis, matchResults } = input;
  const primaryMatch = matchResults[0] ?? null;
  const topGainers = topGainersForMetadata(analysis, input.participantNames);
  const moverLine = formatBiggestMover(analysis.movers);

  const metadata: ScoreImpactActivityMetadata = {
    source_key: input.sourceKey,
    score_impact_label: "SCORE IMPACT",
    icon: "⚽",
    trigger: input.trigger,
    standings_hash: input.standingsHash,
    score_signature: input.scoreSignature,
    match_id: primaryMatch?.matchCode,
    match_label: analysis.primaryMatchLabel ?? undefined,
    match_codes: matchResults.map((m) => m.matchCode),
    stage_label: stageLabelFromCode(analysis.stageCode),
    group_code: analysis.groupCode ?? undefined,
    scoreline: analysis.scoreline ?? undefined,
    points_changed: analysis.pointsChanged,
    affected_count: analysis.bracketsScoredCount,
    top_gainers: topGainers,
    point_gainers: pointGainersForRecap(analysis, input.participantNames),
    reason: analysis.reason,
  };

  if (moverLine && analysis.movers[0]) {
    metadata.leaderboard_movement = [
      {
        display_name: analysis.movers[0].displayName,
        from_rank: analysis.movers[0].previousRank,
        to_rank: analysis.movers[0].newRank,
      },
    ];
  }

  const momentum = buildLeaderboardMomentum({
    currentRows: input.afterRows.map((row) => ({
      participantId: row.participantId,
      totalPoints: row.totalPoints,
      rank: row.rank,
    })),
    previousRows: input.beforeRows.map((row) => ({
      participantId: row.participantId,
      totalPoints: row.totalPoints,
    })),
  });

  if (momentum.hasPreviousSnapshot) {
    metadata.has_previous_snapshot = true;
    metadata[STANDINGS_CAPTURE_VERSION_KEY] = STANDINGS_CAPTURE_VERSION;
    metadata.previous_standings = input.beforeRows.map((row) => ({
      participant_id: row.participantId,
      total_points: row.totalPoints,
    }));
    metadata.leaderboard_momentum = momentum.rows.map((row) => ({
      participant_id: row.participantId,
      previous_rank: row.previousRank,
      previous_points: row.previousPoints,
      rank_change: row.rankChange,
      points_gained: row.recentPointsGained,
      is_new_entry: row.isNewEntry,
    }));
  }

  if (
    input.softImpact?.enabled &&
    input.softImpact.affected_count > 0 &&
    !analysis.pointsChanged
  ) {
    metadata.soft_impact = input.softImpact;
  }

  if (input.bracketImpact) {
    metadata.bracket_impact = bracketImpactToMetadata(input.bracketImpact);
  }

  return metadata;
}
