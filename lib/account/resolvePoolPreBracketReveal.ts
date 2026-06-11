import type { Prediction, Team } from "../../src/types/domain";
import { FROZEN_AT_POOL_LOCK_KINDS } from "../predictions/frozenPreBracketPickKinds";
import { labelParticipantBonusPick } from "../predictions/participantBonusLabels";
import type { ChampionPickSummary } from "./buildPoolReveal";

export type PreBracketRevealSection = {
  id: "group" | "third_place" | "bonus";
  title: string;
  subtitle?: string;
  teamPicks: ChampionPickSummary[];
};

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

function aggregateTeamPicks(input: {
  predictions: Prediction[];
  completeParticipantIds: string[];
  participantRows: Array<{ id: string; display_name: string | null }>;
  teams: Team[];
  match: (prediction: Prediction) => boolean;
  canShowParticipantNames: boolean;
}): ChampionPickSummary[] {
  const completeSet = new Set(input.completeParticipantIds);
  const teamById = new Map(input.teams.map((t) => [t.id, t]));
  const byTeam = new Map<
    string,
    {
      teamName: string;
      teamCode?: string;
      participantIds: Set<string>;
      participantNames: string[];
    }
  >();

  for (const row of input.predictions) {
    if (!completeSet.has(row.participantId)) continue;
    if (!input.match(row)) continue;
    const teamId = (row.teamId ?? "").trim();
    if (!teamId) continue;

    let entry = byTeam.get(teamId);
    if (!entry) {
      const { teamName, teamCode } = teamLabel(teamById, teamId);
      entry = {
        teamName,
        teamCode,
        participantIds: new Set(),
        participantNames: [],
      };
      byTeam.set(teamId, entry);
    }

    if (!entry.participantIds.has(row.participantId)) {
      entry.participantIds.add(row.participantId);
      if (input.canShowParticipantNames) {
        entry.participantNames.push(
          displayNameFromRow(input.participantRows, row.participantId),
        );
      }
    }
  }

  const totalPicks = [...byTeam.values()].reduce(
    (sum, entry) => sum + entry.participantIds.size,
    0,
  );

  return [...byTeam.entries()]
    .map(([teamId, entry]) => {
      const count = entry.participantIds.size;
      const percentage =
        totalPicks > 0 ? Math.round((count / totalPicks) * 1000) / 10 : 0;
      const names = input.canShowParticipantNames
        ? [...entry.participantNames].sort((a, b) => a.localeCompare(b))
        : undefined;
      return {
        teamId,
        teamName: entry.teamName,
        teamCode: entry.teamCode,
        count,
        percentage,
        participantNames: names,
      };
    })
    .sort(
      (a, b) =>
        b.count - a.count ||
        a.teamName.localeCompare(b.teamName) ||
        a.teamId.localeCompare(b.teamId),
    );
}

/**
 * Aggregates locked pre-bracket picks (group, third-place, bonus) among complete
 * participants. Used when knockout bracket picks are not yet required.
 */
export function resolvePoolPreBracketRevealSections(input: {
  completeParticipantIds: string[];
  predictions: Prediction[];
  participantRows: Array<{ id: string; display_name: string | null }>;
  teams: Team[];
  bonusKeys: readonly string[];
  canShowParticipantNames: boolean;
}): PreBracketRevealSection[] {
  if (input.completeParticipantIds.length === 0) return [];

  const frozenKind = (kind: string) => FROZEN_AT_POOL_LOCK_KINDS.has(kind);
  const base = {
    predictions: input.predictions,
    completeParticipantIds: input.completeParticipantIds,
    participantRows: input.participantRows,
    teams: input.teams,
    canShowParticipantNames: input.canShowParticipantNames,
  };

  const sections: PreBracketRevealSection[] = [];

  const groupPicks = aggregateTeamPicks({
    ...base,
    match: (p) => p.predictionKind === "group_winner",
  });
  if (groupPicks.length > 0) {
    sections.push({
      id: "group",
      title: "Group winners",
      subtitle: "Most popular teams picked to win their group.",
      teamPicks: groupPicks.slice(0, 12),
    });
  }

  const thirdPlacePicks = aggregateTeamPicks({
    ...base,
    match: (p) => p.predictionKind === "third_place_qualifier",
  });
  if (thirdPlacePicks.length > 0) {
    sections.push({
      id: "third_place",
      title: "Third-place advancers",
      subtitle: "Teams most often picked to advance from third place.",
      teamPicks: thirdPlacePicks.slice(0, 12),
    });
  }

  for (const bonusKey of input.bonusKeys) {
    const key = bonusKey.trim();
    if (!key) continue;
    const bonusPicks = aggregateTeamPicks({
      ...base,
      match: (p) => p.predictionKind === "bonus_pick" && (p.bonusKey ?? "").trim() === key,
    });
    if (bonusPicks.length === 0) continue;
    sections.push({
      id: "bonus",
      title: labelParticipantBonusPick(key),
      subtitle: "Bonus pick distribution.",
      teamPicks: bonusPicks.slice(0, 8),
    });
  }

  return sections;
}

/** True when the pool is locked but knockout bracket picks are not yet required. */
export function shouldShowPreBracketReveal(input: {
  locked: boolean;
  knockoutBracketPicksUnlocked: boolean;
  totalChampionBrackets: number;
  preBracketSections: PreBracketRevealSection[];
}): boolean {
  return (
    input.locked &&
    !input.knockoutBracketPicksUnlocked &&
    input.totalChampionBrackets === 0 &&
    input.preBracketSections.some((s) => s.teamPicks.length > 0)
  );
}

export const PRE_BRACKET_REVEAL_INTRO =
  "Knockout champion picks will appear after the official Round of 32 bracket opens. For now, compare group, third-place, and bonus picks.";
