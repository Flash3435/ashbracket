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

/**
 * Deterministic AshBot score-impact copy (1–3 sentences). Returns null when nothing useful to say.
 */
export function buildScoreImpactCommentary(analysis: ScoreImpactAnalysis): string | null {
  if (!scoreImpactHasMeaningfulChange(analysis)) return null;

  const sentences: string[] = [];
  const matchLabel = analysis.primaryMatchLabel;

  if (analysis.pointsChanged) {
    const gainers = formatTopPointGainers(analysis.pointGainers);
    const mover = formatBiggestMover(analysis.movers);
    const scored = analysis.bracketsScoredCount;

    if (analysis.perfectGroupPickers.length > 0 && scored > 0) {
      const perfect = analysis.perfectGroupPickers.slice(0, 2).join(" and ");
      if (scored === 1 && analysis.perfectGroupPickers.length === 1) {
        sentences.push(`${perfect} was the only bracket to score on that update.`);
      } else if (analysis.perfectGroupPickers.length <= 2 && scored > 1) {
        sentences.push(
          `${formatBracketCount(scored)} scored, and ${perfect} nailed both top spots.`,
        );
      } else {
        sentences.push(`${formatBracketCount(scored)} just scored.`);
      }
    } else if (matchLabel) {
      sentences.push(`${matchLabel} is in.`);
    }

    if (gainers) {
      sentences.push(`Leaderboard shake-up: ${gainers} gained points.`);
    } else if (scored > 0) {
      sentences.push(`${formatBracketCount(scored)} picked up points.`);
    }

    if (mover) {
      sentences.push(`${mover}.`);
    }

    return trimSentences(sentences, 3);
  }

  if (matchLabel) {
    sentences.push(`${matchLabel} is in.`);
    sentences.push("No pool points changed yet.");
    if (analysis.incompleteGroupNote) {
      sentences.push(analysis.incompleteGroupNote);
    } else if (analysis.pickSentimentNote) {
      sentences.push(analysis.pickSentimentNote);
    }
    return trimSentences(sentences, 3);
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
  return cleaned.slice(0, max).join(" ");
}

export { detectScoreImpact, scoreImpactHasMeaningfulChange };
