import type { Prediction, Team, TournamentStage } from "../../src/types/domain";
import { buildAllParticipantPickDrafts } from "../predictions/buildParticipantPickDrafts";
import type { GroupTeamCountryCodesByLetter } from "../predictions/knockoutPickConsistency";
import type { ChampionPickInput } from "./buildPoolReveal";

function displayNameFromRow(
  rows: Array<{ id: string; display_name: string | null }>,
  participantId: string,
): string {
  const row = rows.find((r) => r.id === participantId);
  return (row?.display_name ?? "").trim() || "Participant";
}

function teamLabel(teamById: Map<string, Team>, teamId: string): {
  teamName: string;
  teamCode?: string;
} {
  const team = teamById.get(teamId);
  return {
    teamName: team?.name?.trim() || "Unknown team",
    teamCode: team?.countryCode?.trim() || undefined,
  };
}

/**
 * Reads champion team id for one participant from canonical predictions rows.
 */
export function championTeamIdFromPredictions(
  predictions: Prediction[],
  participantId: string,
): string | null {
  const row = predictions.find(
    (p) =>
      p.participantId === participantId &&
      p.predictionKind === "champion" &&
      (p.teamId ?? "").trim() !== "",
  );
  return (row?.teamId ?? "").trim() || null;
}

/**
 * Fallback: champion slot from the same draft builder used by completeness checks.
 * Drafts are derived from predictions, so this only helps when a direct row lookup
 * misses but the slot builder still resolves a team (should be rare).
 */
export function championTeamIdFromDraftSlots(
  input: {
    stageByCode: Partial<Record<TournamentStage["code"], TournamentStage>>;
    predictions: Prediction[];
    participantId: string;
    bonusKeys: readonly string[];
    teams: Team[];
    groupTeamCountryCodesByLetter: GroupTeamCountryCodesByLetter;
  },
): string | null {
  const slots = buildAllParticipantPickDrafts({
    stageByCode: input.stageByCode,
    predictions: input.predictions,
    participantId: input.participantId,
    bonusKeys: input.bonusKeys,
    teams: input.teams,
    groupTeamCountryCodesByLetter: input.groupTeamCountryCodesByLetter,
  });
  const champSlot = slots.find((s) => s.predictionKind === "champion");
  const teamId = champSlot?.teamId.trim() ?? "";
  return teamId || null;
}

/**
 * Resolves one champion pick per complete participant. Prefers `prediction_kind =
 * 'champion'` rows; falls back to the champion draft slot from the same predictions.
 * Participants complete without a champion (e.g. knockout bracket not unlocked yet)
 * are omitted — not double-counted.
 */
export function resolvePoolChampionPickInputs(input: {
  completeParticipantIds: string[];
  predictions: Prediction[];
  participantRows: Array<{ id: string; display_name: string | null }>;
  teams: Team[];
  stageByCode: Partial<Record<TournamentStage["code"], TournamentStage>>;
  bonusKeys: readonly string[];
  groupTeamCountryCodesByLetter: GroupTeamCountryCodesByLetter;
}): ChampionPickInput[] {
  const teamById = new Map(input.teams.map((t) => [t.id, t]));
  const out: ChampionPickInput[] = [];
  const seenParticipants = new Set<string>();

  const draftContext = {
    stageByCode: input.stageByCode,
    predictions: input.predictions,
    bonusKeys: input.bonusKeys,
    teams: input.teams,
    groupTeamCountryCodesByLetter: input.groupTeamCountryCodesByLetter,
  };

  for (const participantId of input.completeParticipantIds) {
    if (seenParticipants.has(participantId)) continue;

    let teamId = championTeamIdFromPredictions(input.predictions, participantId);
    if (!teamId) {
      teamId = championTeamIdFromDraftSlots({
        ...draftContext,
        participantId,
      });
    }
    if (!teamId) continue;

    seenParticipants.add(participantId);
    const { teamName, teamCode } = teamLabel(teamById, teamId);
    out.push({
      teamId,
      teamName,
      teamCode,
      participantId,
      participantDisplayName: displayNameFromRow(
        input.participantRows,
        participantId,
      ),
    });
  }

  return out;
}
