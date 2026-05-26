/**
 * Simulation result generator checks.
 * Run: `npx tsx lib/admin/simulationResultsGenerator.selftest.ts`
 */
import {
  generateSimulationBatchPreview,
  SIMULATION_FALLBACK_BATCH_SIZE,
  type SimulationMatchCandidate,
} from "./simulationResultsGenerator";
import type { Team } from "../../src/types/domain";

let failed = 0;

function t(condition: boolean, message: string): void {
  if (!condition) {
    failed += 1;
    console.error("FAIL:", message);
  }
}

function team(id: string, code: string, rank: number | null): Team {
  return {
    id,
    name: code,
    countryCode: code,
    fifaCode: code,
    fifaRank: rank,
    fifaRankAsOf: "2026-01-01",
    createdAt: "",
    updatedAt: "",
  };
}

function match(
  suffix: string,
  kickoffAt: string | null,
  stageCode = "group",
): SimulationMatchCandidate {
  return {
    id: `match-${suffix}`,
    matchCode: `WC-${suffix}`,
    stageCode,
    groupCode: stageCode === "group" ? "A" : null,
    kickoffAt,
    homeTeamId: "home",
    awayTeamId: "away",
    homeTeamName: "Home",
    awayTeamName: "Away",
  };
}

const teamsById = new Map<string, Team>([
  ["home", team("home", "BRA", 4)],
  ["away", team("away", "JPN", 18)],
]);

const datedPreview = generateSimulationBatchPreview(
  [
    match("01", "2026-06-11T10:00:00.000Z"),
    match("02", "2026-06-11T18:00:00.000Z"),
    match("03", "2026-06-12T10:00:00.000Z"),
  ],
  teamsById,
);

t(Boolean(datedPreview), "dated batch should generate a preview");
t(datedPreview?.batchType === "kickoff_date", "dated batch should prefer kickoff-date grouping");
t(datedPreview?.matches.length === 2, "dated batch should include only the earliest date");
t(datedPreview?.stageMode === "group", "group matches should report group stage mode");
t(
  datedPreview?.matches.every(
    (item) =>
      item.homePenalties === null &&
      item.awayPenalties === null &&
      item.decisionType !== "penalties",
  ) ?? false,
  "group matches should never use penalties",
);

const knockoutPreview = generateSimulationBatchPreview(
  [match("KO", "2026-07-01T20:00:00.000Z", "quarterfinal")],
  teamsById,
);

t(Boolean(knockoutPreview), "knockout batch should generate a preview");
t(knockoutPreview?.stageMode === "knockout", "non-group matches should report knockout mode");
t(
  knockoutPreview?.matches.every(
    (item) =>
      item.winnerTeamId === item.homeTeamId || item.winnerTeamId === item.awayTeamId,
  ) ?? false,
  "knockout matches should always resolve a winner",
);

const fallbackInput = Array.from({ length: SIMULATION_FALLBACK_BATCH_SIZE + 2 }, (_, index) =>
  match(String(index + 1).padStart(2, "0"), null),
);
const fallbackPreview = generateSimulationBatchPreview(fallbackInput, teamsById);
t(fallbackPreview?.batchType === "ordered_fallback", "missing kickoff times should use fallback batch");
t(
  fallbackPreview?.matches.length === SIMULATION_FALLBACK_BATCH_SIZE,
  "fallback batch should cap the number of matches",
);

if (failed > 0) {
  process.exit(1);
}

console.log("simulationResultsGenerator.selftest: ok");
