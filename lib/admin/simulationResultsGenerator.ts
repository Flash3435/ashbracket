import { winnerFromMatchScores } from "@/lib/tournament/matchOutcome";
import { teamStrengthLabel } from "@/lib/teams/teamStrengthLabel";
import type { Team } from "../../src/types/domain";

export const SIMULATION_FALLBACK_BATCH_SIZE = 8;

const MAX_SIMULATED_GOALS = 5;

const STAGE_SORT_ORDER: Record<string, number> = {
  group: 0,
  round_of_32: 1,
  round_of_16: 2,
  quarterfinal: 3,
  semifinal: 4,
  third_place: 5,
  final: 6,
};

export type SimulationMatchCandidate = {
  id: string;
  matchCode: string;
  stageCode: string;
  groupCode: string | null;
  kickoffAt: string | null;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
};

export type SimulationBatchType = "kickoff_date" | "ordered_fallback";
export type SimulationStageMode = "group" | "knockout" | "mixed";
export type SimulationDecisionType = "draw" | "regulation" | "penalties";

export type SimulationGeneratedMatch = SimulationMatchCandidate & {
  homeGoals: number;
  awayGoals: number;
  homePenalties: number | null;
  awayPenalties: number | null;
  winnerTeamId: string | null;
  winnerTeamName: string | null;
  decisionType: SimulationDecisionType;
};

export type SimulationBatchPreview = {
  batchType: SimulationBatchType;
  batchLabel: string;
  batchKey: string;
  fallbackBatchSize: number | null;
  matchCount: number;
  stageCodes: string[];
  stageMode: SimulationStageMode;
  matches: SimulationGeneratedMatch[];
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function stageSortValue(stageCode: string): number {
  return STAGE_SORT_ORDER[stageCode] ?? 99;
}

function compareCandidateMatches(
  a: Pick<SimulationMatchCandidate, "kickoffAt" | "stageCode" | "matchCode">,
  b: Pick<SimulationMatchCandidate, "kickoffAt" | "stageCode" | "matchCode">,
): number {
  const aTime = a.kickoffAt ? Date.parse(a.kickoffAt) : Number.POSITIVE_INFINITY;
  const bTime = b.kickoffAt ? Date.parse(b.kickoffAt) : Number.POSITIVE_INFINITY;
  if (aTime !== bTime) return aTime - bTime;

  const stageDiff = stageSortValue(a.stageCode) - stageSortValue(b.stageCode);
  if (stageDiff !== 0) return stageDiff;

  return a.matchCode.localeCompare(b.matchCode);
}

function kickoffDateKey(kickoffAt: string | null): string | null {
  if (!kickoffAt) return null;
  const iso = new Date(kickoffAt).toISOString();
  return iso.slice(0, 10);
}

function humanDateLabel(dateKey: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${dateKey}T00:00:00.000Z`));
}

function inferStageMode(stageCodes: string[]): SimulationStageMode {
  const hasGroup = stageCodes.includes("group");
  const hasKnockout = stageCodes.some((code) => code !== "group");
  if (hasGroup && hasKnockout) return "mixed";
  return hasGroup ? "group" : "knockout";
}

function pickEligibleBatch(matches: SimulationMatchCandidate[]): {
  batchType: SimulationBatchType;
  batchLabel: string;
  batchKey: string;
  fallbackBatchSize: number | null;
  matches: SimulationMatchCandidate[];
} | null {
  if (matches.length === 0) return null;

  const sorted = [...matches].sort(compareCandidateMatches);
  const firstDated = sorted.find((match) => match.kickoffAt);
  if (firstDated?.kickoffAt) {
    const dateKey = kickoffDateKey(firstDated.kickoffAt);
    if (dateKey) {
      const batch = sorted.filter((match) => kickoffDateKey(match.kickoffAt) === dateKey);
      return {
        batchType: "kickoff_date",
        batchLabel: `Next scheduled date: ${humanDateLabel(dateKey)}`,
        batchKey: dateKey,
        fallbackBatchSize: null,
        matches: batch,
      };
    }
  }

  const batch = sorted.slice(0, SIMULATION_FALLBACK_BATCH_SIZE);
  return {
    batchType: "ordered_fallback",
    batchLabel: `Fallback batch: first ${batch.length} unplayed matches in schedule order`,
    batchKey: `fallback:${batch[0]?.matchCode ?? "none"}`,
    fallbackBatchSize: SIMULATION_FALLBACK_BATCH_SIZE,
    matches: batch,
  };
}

function poisson(lambda: number): number {
  const cappedLambda = clamp(lambda, 0.2, 3.2);
  const cutoff = Math.exp(-cappedLambda);
  let k = 0;
  let product = 1;
  do {
    k += 1;
    product *= Math.random();
  } while (product > cutoff);
  return clamp(k - 1, 0, MAX_SIMULATED_GOALS);
}

function strengthBoost(team: Team | undefined): number {
  if (!team) return 0;

  const rankBoost =
    team.fifaRank != null && team.fifaRank > 0
      ? clamp((36 - team.fifaRank) / 20, -1.15, 1.35)
      : 0;

  const labelBoost = (() => {
    switch (teamStrengthLabel(team.countryCode)) {
      case "Often picked":
        return 0.32;
      case "Solid":
        return 0.12;
      default:
        return -0.08;
    }
  })();

  return rankBoost + labelBoost;
}

function knockoutPenalties(homeFavored: boolean): {
  homePenalties: number;
  awayPenalties: number;
} {
  const baseWinnerScore = Math.random() < 0.65 ? 4 : 5;
  const margin = Math.random() < 0.8 ? 1 : 2;
  const loserScore = Math.max(2, baseWinnerScore - margin);

  return homeFavored
    ? { homePenalties: baseWinnerScore, awayPenalties: loserScore }
    : { homePenalties: loserScore, awayPenalties: baseWinnerScore };
}

function isGroupStage(stageCode: string): boolean {
  return stageCode === "group";
}

export function generateSimulationBatchPreview(
  matches: SimulationMatchCandidate[],
  teamsById: Map<string, Team>,
): SimulationBatchPreview | null {
  const picked = pickEligibleBatch(matches);
  if (!picked) return null;

  const generated = picked.matches.map<SimulationGeneratedMatch>((match) => {
    const homeTeam = teamsById.get(match.homeTeamId);
    const awayTeam = teamsById.get(match.awayTeamId);
    const advantage = clamp(
      strengthBoost(homeTeam) - strengthBoost(awayTeam) + 0.12,
      -1,
      1,
    );

    const homeGoals = poisson(1.18 + advantage * 0.42);
    const awayGoals = poisson(1.06 - advantage * 0.42);

    if (isGroupStage(match.stageCode) || homeGoals !== awayGoals) {
      const winnerTeamId = winnerFromMatchScores({
        homeTeamId: match.homeTeamId,
        awayTeamId: match.awayTeamId,
        homeGoals,
        awayGoals,
        homePenalties: null,
        awayPenalties: null,
      });

      return {
        ...match,
        homeGoals,
        awayGoals,
        homePenalties: null,
        awayPenalties: null,
        winnerTeamId,
        winnerTeamName:
          winnerTeamId === match.homeTeamId
            ? match.homeTeamName
            : winnerTeamId === match.awayTeamId
              ? match.awayTeamName
              : null,
        decisionType: winnerTeamId ? "regulation" : "draw",
      };
    }

    const homeFavoredOnPens = Math.random() < 0.5 + advantage * 0.18;
    const penalties = knockoutPenalties(homeFavoredOnPens);
    const winnerTeamId = winnerFromMatchScores({
      homeTeamId: match.homeTeamId,
      awayTeamId: match.awayTeamId,
      homeGoals,
      awayGoals,
      homePenalties: penalties.homePenalties,
      awayPenalties: penalties.awayPenalties,
    });

    return {
      ...match,
      homeGoals,
      awayGoals,
      homePenalties: penalties.homePenalties,
      awayPenalties: penalties.awayPenalties,
      winnerTeamId,
      winnerTeamName:
        winnerTeamId === match.homeTeamId
          ? match.homeTeamName
          : winnerTeamId === match.awayTeamId
            ? match.awayTeamName
            : null,
      decisionType: "penalties",
    };
  });

  const stageCodes = [...new Set(generated.map((match) => match.stageCode))].sort(
    (a, b) => stageSortValue(a) - stageSortValue(b) || a.localeCompare(b),
  );

  return {
    batchType: picked.batchType,
    batchLabel: picked.batchLabel,
    batchKey: picked.batchKey,
    fallbackBatchSize: picked.fallbackBatchSize,
    matchCount: generated.length,
    stageCodes,
    stageMode: inferStageMode(stageCodes),
    matches: generated,
  };
}
