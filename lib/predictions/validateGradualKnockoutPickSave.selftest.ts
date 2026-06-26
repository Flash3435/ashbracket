import assert from "node:assert";
import type { Team } from "../../src/types/domain";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import type { Prediction } from "../../src/types/domain";
import { applyGradualKnockoutPickSaveGuards } from "./validateGradualKnockoutPickSave";

function match(
  partial: Partial<TournamentMatchPublicRow> &
    Pick<TournamentMatchPublicRow, "match_code" | "stage_code">,
): TournamentMatchPublicRow {
  return {
    match_id: partial.match_code,
    edition_id: "ed",
    edition_code: "wc2026",
    match_code: partial.match_code,
    stage_code: partial.stage_code,
    stage_label: partial.stage_code,
    stage_sort_order: 2,
    group_code: null,
    round_index: 0,
    kickoff_at: partial.kickoff_at ?? null,
    status: partial.status ?? "scheduled",
    home_goals: null,
    away_goals: null,
    home_penalties: null,
    away_penalties: null,
    home_team_name: partial.home_team_name ?? "Home",
    home_country_code: partial.home_country_code ?? null,
    away_team_name: partial.away_team_name ?? "Away",
    away_country_code: partial.away_country_code ?? null,
    winner_team_name: null,
    winner_country_code: null,
  };
}

const teams: Team[] = [
  {
    id: "team-usa",
    name: "United States",
    countryCode: "USA",
    fifaCode: "USA",
    fifaRank: 12,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "team-mex",
    name: "Mexico",
    countryCode: "MEX",
    fifaCode: "MEX",
    fifaRank: 15,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  },
];

const stageR32 = "stage-r32";

const existing: Prediction[] = [
  {
    id: "p1",
    poolId: "pool",
    participantId: "par",
    predictionKind: "round_of_32",
    teamId: "team-usa",
    tournamentStageId: stageR32,
    groupCode: null,
    slotKey: "1",
    bonusKey: null,
    valueText: null,
    createdAt: "",
    updatedAt: "",
  },
];

// Can save one confirmed slot; unconfirmed slot change rejected
{
  const result = applyGradualKnockoutPickSaveGuards({
    incoming: [
      {
        predictionKind: "round_of_32",
        tournamentStageId: stageR32,
        slotKey: "1",
        groupCode: null,
        bonusKey: null,
        teamId: "team-mex",
      },
      {
        predictionKind: "round_of_32",
        tournamentStageId: stageR32,
        slotKey: "3",
        groupCode: null,
        bonusKey: null,
        teamId: "team-usa",
      },
    ],
    existing,
    teams,
    matches: [
      match({
        match_code: "M73",
        stage_code: "round_of_32",
        kickoff_at: "2026-06-28T19:00:00Z",
        home_country_code: "USA",
        away_country_code: "MEX",
      }),
    ],
    fullRoundOf32Official: false,
    nowMs: new Date("2026-06-28T12:00:00Z").getTime(),
  });
  assert.strictEqual(result.error, "Matchup not confirmed yet.");
}

// Partial save for confirmed match preserves other existing picks
{
  const result = applyGradualKnockoutPickSaveGuards({
    incoming: [
      {
        predictionKind: "round_of_32",
        tournamentStageId: stageR32,
        slotKey: "1",
        groupCode: null,
        bonusKey: null,
        teamId: "team-mex",
      },
      {
        predictionKind: "round_of_32",
        tournamentStageId: stageR32,
        slotKey: "2",
        groupCode: null,
        bonusKey: null,
        teamId: "",
      },
    ],
    existing,
    teams,
    matches: [
      match({
        match_code: "M73",
        stage_code: "round_of_32",
        kickoff_at: "2026-06-28T19:00:00Z",
        home_country_code: "USA",
        away_country_code: "MEX",
      }),
    ],
    fullRoundOf32Official: false,
    nowMs: new Date("2026-06-28T12:00:00Z").getTime(),
  });
  assert.strictEqual(result.error, null);
  const slot1 = result.slots.find((s) => s.slotKey === "1");
  assert.strictEqual(slot1?.teamId, "team-mex");
}

// After kickoff — cannot change
{
  const result = applyGradualKnockoutPickSaveGuards({
    incoming: [
      {
        predictionKind: "round_of_32",
        tournamentStageId: stageR32,
        slotKey: "1",
        groupCode: null,
        bonusKey: null,
        teamId: "team-mex",
      },
    ],
    existing,
    teams,
    matches: [
      match({
        match_code: "M73",
        stage_code: "round_of_32",
        kickoff_at: "2026-06-28T19:00:00Z",
        status: "live",
        home_country_code: "USA",
        away_country_code: "MEX",
      }),
    ],
    fullRoundOf32Official: false,
    nowMs: new Date("2026-06-28T19:30:00Z").getTime(),
  });
  assert.ok(result.error?.includes("kicked off"), result.error ?? "");
}

console.log("validateGradualKnockoutPickSave.selftest.ts: ok");
