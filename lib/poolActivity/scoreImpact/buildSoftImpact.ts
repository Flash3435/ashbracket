import { importanceScoreForKind } from "@/lib/account/buildWhoToCheerFor";
import type { PredictionKind } from "../../../src/types/domain";
import type {
  ScoreImpactMatchResult,
  ScoreImpactSoftImpactMetadata,
} from "./types";

/** Advancement / bracket-path pick kinds counted for soft impact. Bonus picks excluded. */
export const SOFT_IMPACT_PATH_PICK_KINDS = [
  "group_winner",
  "group_runner_up",
  "third_place_qualifier",
  "round_of_32",
  "round_of_16",
  "quarterfinalist",
  "semifinalist",
  "finalist",
  "champion",
] as const satisfies readonly PredictionKind[];

export type SoftImpactPathPickKind = (typeof SOFT_IMPACT_PATH_PICK_KINDS)[number];

export function isSoftImpactPathPickKind(kind: string): kind is SoftImpactPathPickKind {
  return (SOFT_IMPACT_PATH_PICK_KINDS as readonly string[]).includes(kind);
}

export type ParticipantTeamPicks = {
  /** Teams appearing in meaningful advancement/path picks (not bonus-only). */
  pathTeamIds: Set<string>;
  maxPathImportanceByTeamId: Map<string, number>;
};

export function buildParticipantTeamPicksFromPredictions(
  predictions: ReadonlyArray<{
    participantId: string;
    teamId: string | null;
    predictionKind: string;
  }>,
): Map<string, ParticipantTeamPicks> {
  const out = new Map<string, ParticipantTeamPicks>();

  for (const pred of predictions) {
    if (!isSoftImpactPathPickKind(pred.predictionKind)) continue;

    const teamId = pred.teamId?.trim();
    if (!teamId) continue;

    let entry = out.get(pred.participantId);
    if (!entry) {
      entry = { pathTeamIds: new Set(), maxPathImportanceByTeamId: new Map() };
      out.set(pred.participantId, entry);
    }

    entry.pathTeamIds.add(teamId);
    const score = importanceScoreForKind(pred.predictionKind);
    const prev = entry.maxPathImportanceByTeamId.get(teamId) ?? 0;
    if (score > prev) {
      entry.maxPathImportanceByTeamId.set(teamId, score);
    }
  }

  return out;
}

function formatSampleNames(names: readonly string[]): string {
  const trimmed = names.map((n) => n.trim()).filter(Boolean);
  if (trimmed.length === 0) return "";
  if (trimmed.length === 1) return trimmed[0]!;
  if (trimmed.length === 2) return `${trimmed[0]} and ${trimmed[1]}`;
  return `${trimmed[0]}, ${trimmed[1]}, and ${trimmed[2]}`;
}

export function formatSoftImpactCountLine(
  softImpact: Pick<ScoreImpactSoftImpactMetadata, "affected_count" | "team_name">,
  options?: { compact?: boolean },
): string {
  const teamName = softImpact.team_name?.trim() || "that team";
  const count = softImpact.affected_count;
  const bracketLabel = count === 1 ? "1 bracket" : `${count} brackets`;

  if (options?.compact) {
    return `Early boost: ${bracketLabel} had ${teamName} in their bracket path.`;
  }

  return `Good result for ${bracketLabel} with ${teamName} in their path.`;
}

export function formatSoftImpactNamesLine(
  sampleNames: readonly string[],
): string | null {
  const formatted = formatSampleNames(sampleNames);
  if (!formatted) return null;
  return `Watching closely: ${formatted}.`;
}

/**
 * Heuristic bracket-path engagement for finished matches with no pool points yet.
 * Counts participants with the winner in advancement/path picks only (not bonus-only).
 * Draws are omitted in v1 (low confidence).
 */
export function buildSoftImpactForMatch(input: {
  match: ScoreImpactMatchResult | null;
  teamNameById: ReadonlyMap<string, string>;
  participantPicks: ReadonlyMap<string, ParticipantTeamPicks>;
  participantNames: ReadonlyMap<string, string>;
}): ScoreImpactSoftImpactMetadata | null {
  const { match } = input;
  if (!match) return null;

  const winnerTeamId = match.winnerTeamId?.trim() || null;
  if (!winnerTeamId) {
    return null;
  }

  const teamName = input.teamNameById.get(winnerTeamId)?.trim();
  if (!teamName) return null;

  const helped: Array<{
    participantId: string;
    displayName: string;
    relevance: number;
  }> = [];

  for (const [participantId, picks] of input.participantPicks) {
    if (!picks.pathTeamIds.has(winnerTeamId)) continue;
    helped.push({
      participantId,
      displayName: input.participantNames.get(participantId) ?? "Participant",
      relevance: picks.maxPathImportanceByTeamId.get(winnerTeamId) ?? 0,
    });
  }

  if (helped.length === 0) return null;

  helped.sort((a, b) => {
    if (b.relevance !== a.relevance) return b.relevance - a.relevance;
    const nameCmp = a.displayName.localeCompare(b.displayName, undefined, {
      sensitivity: "base",
    });
    if (nameCmp !== 0) return nameCmp;
    return a.participantId.localeCompare(b.participantId);
  });

  return {
    enabled: true,
    team_name: teamName,
    team_id: winnerTeamId,
    affected_count: helped.length,
    sample_names: helped.slice(0, 3).map((h) => h.displayName),
    reason: "winner_in_path",
  };
}
