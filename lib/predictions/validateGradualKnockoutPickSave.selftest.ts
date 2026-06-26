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
  {
    id: "team-rsa",
    name: "South Africa",
    countryCode: "RSA",
    fifaCode: "RSA",
    fifaRank: 30,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "team-can",
    name: "Canada",
    countryCode: "CAN",
    fifaCode: "CAN",
    fifaRank: 40,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "team-ned",
    name: "Netherlands",
    countryCode: "NED",
    fifaCode: "NED",
    fifaRank: 8,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "team-mar",
    name: "Morocco",
    countryCode: "MAR",
    fifaCode: "MAR",
    fifaRank: 14,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "team-bra",
    name: "Brazil",
    countryCode: "BRA",
    fifaCode: "BRA",
    fifaRank: 3,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "team-jpn",
    name: "Japan",
    countryCode: "JPN",
    fifaCode: "JPN",
    fifaRank: 18,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  },
];

const stageR32 = "stage-r32";
const stageR16 = "stage-r16";
const stageGroup = "stage-group";

const pickableMatches = [
  match({
    match_code: "M73",
    stage_code: "round_of_32",
    kickoff_at: "2026-06-28T19:00:00Z",
    home_country_code: "RSA",
    away_country_code: "CAN",
    home_team_name: "South Africa",
    away_team_name: "Canada",
  }),
  match({
    match_code: "M75",
    stage_code: "round_of_32",
    kickoff_at: "2026-06-29T19:00:00Z",
    home_country_code: "NED",
    away_country_code: "MAR",
    home_team_name: "Netherlands",
    away_team_name: "Morocco",
  }),
  match({
    match_code: "M76",
    stage_code: "round_of_32",
    kickoff_at: "2026-06-29T22:00:00Z",
    home_country_code: "BRA",
    away_country_code: "JPN",
    home_team_name: "Brazil",
    away_team_name: "Japan",
  }),
];

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
  {
    id: "p2",
    poolId: "pool",
    participantId: "par",
    predictionKind: "group_winner",
    teamId: "team-usa",
    tournamentStageId: stageGroup,
    groupCode: "A",
    slotKey: null,
    bonusKey: null,
    valueText: null,
    createdAt: "",
    updatedAt: "",
  },
];

// Can save one confirmed matchup; unconfirmed matchup change rejected
{
  const result = applyGradualKnockoutPickSaveGuards({
    incoming: [
      {
        predictionKind: "round_of_16",
        tournamentStageId: stageR16,
        slotKey: "1",
        groupCode: null,
        bonusKey: null,
        teamId: "team-mex",
      },
      {
        predictionKind: "round_of_16",
        tournamentStageId: stageR16,
        slotKey: "2",
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

// Partial save for confirmed M73 winner via round_of_16 slot 1
{
  const result = applyGradualKnockoutPickSaveGuards({
    incoming: [
      {
        predictionKind: "round_of_16",
        tournamentStageId: stageR16,
        slotKey: "1",
        groupCode: null,
        bonusKey: null,
        teamId: "team-mex",
      },
      {
        predictionKind: "round_of_32",
        tournamentStageId: stageR32,
        slotKey: "1",
        groupCode: null,
        bonusKey: null,
        teamId: "",
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
  const r16 = result.slots.find(
    (s) => s.predictionKind === "round_of_16" && s.slotKey === "1",
  );
  assert.strictEqual(r16?.teamId, "team-mex");
  const legacyTop = result.slots.find(
    (s) => s.predictionKind === "round_of_32" && s.slotKey === "1",
  );
  assert.strictEqual(legacyTop?.teamId, "");
}

// Gradual partial payload: one M73 winner + group row; unconfirmed slots omitted
{
  const result = applyGradualKnockoutPickSaveGuards({
    incoming: [
      {
        predictionKind: "group_winner",
        tournamentStageId: stageGroup,
        slotKey: null,
        groupCode: "A",
        bonusKey: null,
        teamId: "team-usa",
      },
      {
        predictionKind: "round_of_16",
        tournamentStageId: stageR16,
        slotKey: "1",
        groupCode: null,
        bonusKey: null,
        teamId: "team-rsa",
      },
      {
        predictionKind: "round_of_32",
        tournamentStageId: stageR32,
        slotKey: "1",
        groupCode: null,
        bonusKey: null,
        teamId: "",
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
    matches: pickableMatches,
    fullRoundOf32Official: false,
    nowMs: new Date("2026-06-28T12:00:00Z").getTime(),
  });
  assert.strictEqual(result.error, null);
  assert.strictEqual(
    result.slots.filter((s) => s.predictionKind === "round_of_16").length,
    1,
  );
  assert.strictEqual(
    result.slots.find((s) => s.predictionKind === "round_of_16" && s.slotKey === "1")
      ?.teamId,
    "team-rsa",
  );
  assert.strictEqual(
    result.slots.some((s) => s.predictionKind === "round_of_16" && s.slotKey === "2"),
    false,
  );
}

// Wrong team in confirmed matchup rejected
{
  const result = applyGradualKnockoutPickSaveGuards({
    incoming: [
      {
        predictionKind: "round_of_16",
        tournamentStageId: stageR16,
        slotKey: "1",
        groupCode: null,
        bonusKey: null,
        teamId: "team-usa",
      },
    ],
    existing: [],
    teams,
    matches: pickableMatches,
    fullRoundOf32Official: false,
    nowMs: new Date("2026-06-28T12:00:00Z").getTime(),
  });
  assert.ok(result.error?.includes("not in this confirmed matchup"), result.error ?? "");
}

// Reject direct legacy round_of_32 slot edits during gradual unlock
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
        home_country_code: "USA",
        away_country_code: "MEX",
      }),
    ],
    fullRoundOf32Official: false,
    nowMs: new Date("2026-06-28T12:00:00Z").getTime(),
  });
  assert.ok(result.error?.includes("matchup row"), result.error ?? "");
}

// After kickoff — cannot change
{
  const result = applyGradualKnockoutPickSaveGuards({
    incoming: [
      {
        predictionKind: "round_of_16",
        tournamentStageId: stageR16,
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
