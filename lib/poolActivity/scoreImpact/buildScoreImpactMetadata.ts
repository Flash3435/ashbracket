import { formatBiggestMover } from "./detectScoreImpact";
import type {
  ScoreImpactActivityMetadata,
  ScoreImpactAnalysis,
  ScoreImpactMatchResult,
  ScoreImpactPointGainerMetadata,
  ScoreImpactTopGainerMetadata,
} from "./types";

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
  matchResults: ScoreImpactMatchResult[];
  participantNames: ReadonlyMap<string, string>;
  trigger: string;
  sourceKey: string;
  standingsHash: string;
  scoreSignature: string;
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

  return metadata;
}
