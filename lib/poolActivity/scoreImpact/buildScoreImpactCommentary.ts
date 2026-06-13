import {
  detectScoreImpact,
  formatBiggestMover,
  formatTopPointGainers,
  scoreImpactHasMeaningfulChange,
} from "./detectScoreImpact";
import type { ScoreImpactAnalysis } from "./types";

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
export function buildScoreImpactCommentary(analysis: ScoreImpactAnalysis): string | null {
  if (!scoreImpactHasMeaningfulChange(analysis)) return null;

  const sentences: string[] = [];
  const headline = headlineForAnalysis(analysis);

  if (analysis.pointsChanged) {
    if (headline) sentences.push(headline);

    const scored = analysis.bracketsScoredCount;
    sentences.push(`${formatBracketCount(scored)} gained points.`);

    const gainers = formatTopPointGainers(analysis.pointGainers);
    if (gainers) {
      sentences.push(`Biggest boost: ${gainers}.`);
    }

    const mover = formatBiggestMover(analysis.movers);
    if (mover) {
      sentences.push(`Leaderboard shakeup: ${mover}.`);
    }

    return trimSentences(sentences, 4);
  }

  if (headline) {
    sentences.push(headline);
    if (analysis.pendingPointsNote) {
      sentences.push(analysis.pendingPointsNote);
    }
    return trimSentences(sentences, 2);
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
