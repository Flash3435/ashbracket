import type { ScoreImpactDisplayLines } from "../poolActivity/scoreImpact/buildScoreImpactDisplay";

/** True when metadata has fields for structured score-impact display. */
export function hasStructuredScoreImpactMetadata(
  metadata: Record<string, unknown>,
): boolean {
  const matchLabel =
    typeof metadata.match_label === "string" && metadata.match_label.trim()
      ? metadata.match_label.trim()
      : null;
  const scoreline =
    typeof metadata.scoreline === "string" && metadata.scoreline.trim()
      ? metadata.scoreline.trim()
      : null;
  return (
    matchLabel != null ||
    scoreline != null ||
    metadata.points_changed != null ||
    metadata.reason != null
  );
}

function pendingGroupNote(groupCode: string): string {
  return `No pool points yet — Group ${groupCode} points settle after the group finishes.`;
}

/**
 * Conservative parser for pre-metadata ash_score_impact body_text on the dashboard.
 * Returns null when the text does not match a known legacy pattern.
 */
export function parseLegacyScoreImpactDashboardBody(
  bodyText: string,
): ScoreImpactDisplayLines | null {
  const text = bodyText.trim().replace(/\s+/g, " ");
  if (!text) return null;

  const groupIncompleteLong =
    /^(.+?)\s+is in\.\s*No pool points changed yet\.\s*Group\s+([A-Za-z0-9]+)\s+is not complete yet\s*[—–-]\s*winner and runner-up points land after all six group matches finish\.?\s*$/i;
  const groupIncompleteLongMatch = text.match(groupIncompleteLong);
  if (groupIncompleteLongMatch) {
    const [, matchLabel, groupCode] = groupIncompleteLongMatch;
    return {
      headline: `${matchLabel!.trim()} is final.`,
      detailLines: [pendingGroupNote(groupCode!.toUpperCase())],
      showLeaderboardLink: false,
      showGainerNames: false,
      showSoftImpactNames: false,
    };
  }

  const groupIncompleteShort =
    /^(.+?)\s+is in\.\s*No pool points changed yet\.\s*Group\s+([A-Za-z0-9]+)\s+is not complete yet\.?\s*$/i;
  const groupIncompleteShortMatch = text.match(groupIncompleteShort);
  if (groupIncompleteShortMatch) {
    const [, matchLabel, groupCode] = groupIncompleteShortMatch;
    return {
      headline: `${matchLabel!.trim()} is final.`,
      detailLines: [pendingGroupNote(groupCode!.toUpperCase())],
      showLeaderboardLink: false,
      showGainerNames: false,
      showSoftImpactNames: false,
    };
  }

  const isInOnly =
    /^(.+?)\s+is in\.\s*No pool points changed yet\.?\s*$/i;
  const isInOnlyMatch = text.match(isInOnly);
  if (isInOnlyMatch) {
    return {
      headline: `${isInOnlyMatch[1]!.trim()} is final.`,
      detailLines: [],
      showLeaderboardLink: false,
      showGainerNames: false,
      showSoftImpactNames: false,
    };
  }

  const isFinalWithPoints =
    /^(.+?)\s+is in\.\s*((?:\d+|One)\s+brackets?\s+gained points\.)\s*(.*)$/i;
  const isFinalWithPointsMatch = text.match(isFinalWithPoints);
  if (isFinalWithPointsMatch) {
    const [, matchLabel, bracketLine, rest] = isFinalWithPointsMatch;
    const detailLines = [bracketLine!.trim()];
    const trimmedRest = rest?.trim();
    if (trimmedRest) detailLines.push(trimmedRest);
    return {
      headline: `${matchLabel!.trim()} is final.`,
      detailLines,
      showLeaderboardLink: true,
      showGainerNames: trimmedRest?.startsWith("Biggest boost:") ?? false,
      showSoftImpactNames: false,
    };
  }

  const alreadyFinal =
    /^(.+?)\s+is final\.\s*No pool points changed yet\.\s*Group\s+([A-Za-z0-9]+)\s+is not complete yet\s*[—–-]\s*winner and runner-up points land after all six group matches finish\.?\s*$/i;
  const alreadyFinalMatch = text.match(alreadyFinal);
  if (alreadyFinalMatch) {
    const [, matchLabel, groupCode] = alreadyFinalMatch;
    return {
      headline: `${matchLabel!.trim()} is final.`,
      detailLines: [pendingGroupNote(groupCode!.toUpperCase())],
      showLeaderboardLink: false,
      showGainerNames: false,
      showSoftImpactNames: false,
    };
  }

  return null;
}

export function buildScoreImpactDashboardDisplay(
  metadata: Record<string, unknown>,
  bodyText: string,
  options: {
    allowParticipantNames: boolean;
    buildStructured: (
      metadata: Record<string, unknown>,
      opts: {
        allowParticipantNames: boolean;
        fallbackBodyText?: string;
        compact?: boolean;
      },
    ) => ScoreImpactDisplayLines | null;
  },
): ScoreImpactDisplayLines | null {
  if (hasStructuredScoreImpactMetadata(metadata)) {
    return options.buildStructured(metadata, {
      allowParticipantNames: options.allowParticipantNames,
      fallbackBodyText: bodyText,
      compact: true,
    });
  }

  const legacy = parseLegacyScoreImpactDashboardBody(bodyText);
  if (legacy) return legacy;

  return options.buildStructured(metadata, {
    allowParticipantNames: options.allowParticipantNames,
    fallbackBodyText: bodyText,
    compact: true,
  });
}
