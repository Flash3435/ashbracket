import {
  detectScoreImpact,
  formatBiggestMover,
  formatTopPointGainers,
  scoreImpactHasMeaningfulChange,
} from "./detectScoreImpact";
import {
  formatSoftImpactCountLine,
  formatSoftImpactNamesLine,
} from "./buildSoftImpact";
import { formatBracketImpactSummaryLines } from "@/lib/leaderboard/leaderboardBracketImpactDisplay";
import { parseLatestScoreEventContext } from "@/lib/leaderboard/parseLatestScoreEventContext";
import type {
  BracketImpactSummaryMetadata,
  ScoreImpactAnalysis,
  ScoreImpactSoftImpactMetadata,
} from "./types";

function formatBracketCount(n: number): string {
  return n === 1 ? "1 bracket" : `${n} brackets`;
}

function headlineForAnalysis(analysis: ScoreImpactAnalysis): string | null {
  if (analysis.reason === "group_complete" && analysis.groupCode) {
    return `Group ${analysis.groupCode} is complete.`;
  }
  if (analysis.primaryMatchLabel) {
    return `${analysis.primaryMatchLabel} is final.`;
  }
  return null;
}

/**
 * Deterministic AshBot score-impact copy (1–3 sentences). Returns null when nothing useful to say.
 */
export function buildScoreImpactCommentary(
  analysis: ScoreImpactAnalysis,
  softImpact?: ScoreImpactSoftImpactMetadata | null,
  bracketImpactSummary?: BracketImpactSummaryMetadata | null,
  uniformPointsDelta?: number | null,
): string | null {
  if (!scoreImpactHasMeaningfulChange(analysis)) return null;

  const sentences: string[] = [];
  const headline = headlineForAnalysis(analysis);

  if (analysis.pointsChanged) {
    if (headline) sentences.push(headline);

    const scored = analysis.bracketsScoredCount;
    if (uniformPointsDelta == null) {
      sentences.push(`${formatBracketCount(scored)} gained points.`);
    }

    const gainers = formatTopPointGainers(analysis.pointGainers);
    if (gainers && uniformPointsDelta == null) {
      sentences.push(`Biggest boost: ${gainers}.`);
    }

    const mover = formatBiggestMover(analysis.movers);
    if (mover) {
      sentences.push(`Leaderboard shakeup: ${mover}.`);
    }

    if (bracketImpactSummary) {
      const bracketLines = formatBracketImpactSummaryLines({
        uniformPointsDelta: uniformPointsDelta ?? null,
        affectedCount: analysis.bracketsScoredCount,
        summary: bracketImpactSummary,
        hasRankMovement: analysis.movers.some((moverRow) => moverRow.rankDelta !== 0),
        event: parseLatestScoreEventContext(
          {
            match_label: analysis.primaryMatchLabel ?? undefined,
            scoreline: analysis.scoreline ?? undefined,
            match_codes: analysis.primaryMatchCode ? [analysis.primaryMatchCode] : [],
          },
          { hasValidSnapshot: true },
        ),
      });
      sentences.push(...bracketLines);
    }

    return trimSentences(sentences, 6);
  }

  if (headline) {
    sentences.push(headline);
    if (analysis.pendingPointsNote) {
      sentences.push(analysis.pendingPointsNote);
    }
    if (softImpact?.enabled && softImpact.affected_count > 0) {
      sentences.push(formatSoftImpactCountLine(softImpact));
      const namesLine = formatSoftImpactNamesLine(softImpact.sample_names);
      if (namesLine) sentences.push(namesLine);
    }
    return trimSentences(sentences, 4);
  }

  if (analysis.bonusLeaderNotes.length > 0) {
    sentences.push(`${analysis.bonusLeaderNotes[0]}.`);
    if (analysis.bonusLeaderNotes[1]) {
      sentences.push(`${analysis.bonusLeaderNotes[1]}.`);
    }
    return trimSentences(sentences, 2);
  }

  return null;
}

function trimSentences(sentences: string[], max: number): string | null {
  const cleaned = sentences.map((s) => s.trim()).filter(Boolean);
  if (cleaned.length === 0) return null;
  return cleaned.slice(0, max).join("\n");
}

export { detectScoreImpact, scoreImpactHasMeaningfulChange };
