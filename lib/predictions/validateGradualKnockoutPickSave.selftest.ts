import assert from "node:assert";
import type { Team } from "../../src/types/domain";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import type { Prediction } from "../../src/types/domain";
import { r32SlotKeysForMatchIndex } from "../bracket/wc2026RoundOf32";
import {
  getGradualKnockoutSelectionState,
  promoteGradualR32WinnersToRoundOf32Slots,
} from "../picks/gradualKnockoutUnlock";
import { participantPickSlotPayloadFromDraft } from "./knockoutPickStatus";
import {
  applyGradualKnockoutPickSaveGuards,
  validateFrozenKnockoutSwapAttempts,
  validateKnockoutParticipantPickChanges,
} from "./validateGradualKnockoutPickSave";

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
    winner_team_name: partial.winner_team_name ?? null,
    winner_country_code: partial.winner_country_code ?? null,
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

// Locked Round of 32 with official result: save unrelated R16 pick while client
// payload includes promoted official sides or auto-cleared legacy R32 rows.
{
  const extraTeams: Team[] = [
    {
      id: "team-ger",
      name: "Germany",
      countryCode: "GER",
      fifaCode: "GER",
      fifaRank: 5,
      fifaRankAsOf: null,
      createdAt: "",
      updatedAt: "",
    },
    {
      id: "team-par",
      name: "Paraguay",
      countryCode: "PAR",
      fifaCode: "PAR",
      fifaRank: 50,
      fifaRankAsOf: null,
      createdAt: "",
      updatedAt: "",
    },
    {
      id: "team-fra",
      name: "France",
      countryCode: "FRA",
      fifaCode: "FRA",
      fifaRank: 2,
      fifaRankAsOf: null,
      createdAt: "",
      updatedAt: "",
    },
    {
      id: "team-egy",
      name: "Egypt",
      countryCode: "EGY",
      fifaCode: "EGY",
      fifaRank: 30,
      fifaRankAsOf: null,
      createdAt: "",
      updatedAt: "",
    },
  ];
  const allTeams = [...teams, ...extraTeams];
  const m82 = match({
    match_code: "M82",
    stage_code: "round_of_32",
    status: "finished",
    home_country_code: "GER",
    away_country_code: "PAR",
    winner_country_code: "PAR",
  });
  const m74 = match({
    match_code: "M74",
    stage_code: "round_of_32",
    status: "finished",
    home_country_code: "GER",
    away_country_code: "EGY",
    winner_country_code: "GER",
  });
  const m77 = match({
    match_code: "M77",
    stage_code: "round_of_32",
    status: "finished",
    home_country_code: "FRA",
    away_country_code: "EGY",
    winner_country_code: "FRA",
  });
  const m89 = match({
    match_code: "M89",
    stage_code: "round_of_16",
    kickoff_at: "2026-07-05T18:00:00Z",
    home_country_code: "GER",
    away_country_code: "FRA",
  });
  const lockedMatches = [m74, m77, m82, m89];
  const lockedNowMs = new Date("2026-07-04T12:00:00Z").getTime();
  const lockedGradual = getGradualKnockoutSelectionState({
    matches: lockedMatches,
    teams: allTeams,
    nowMs: lockedNowMs,
    fullRoundOf32Official: true,
  });
  const { top: m82Top, bottom: m82Bottom } = r32SlotKeysForMatchIndex(9);

  const savedOnR16: Prediction[] = [
    {
      id: "p-r16-m74",
      poolId: "pool",
      participantId: "par",
      predictionKind: "round_of_16",
      teamId: "team-ger",
      tournamentStageId: stageR16,
      groupCode: null,
      slotKey: "2",
      bonusKey: null,
      valueText: null,
      createdAt: "",
      updatedAt: "",
    },
    {
      id: "p-r16-m77",
      poolId: "pool",
      participantId: "par",
      predictionKind: "round_of_16",
      teamId: "team-fra",
      tournamentStageId: stageR16,
      groupCode: null,
      slotKey: "5",
      bonusKey: null,
      valueText: null,
      createdAt: "",
      updatedAt: "",
    },
    {
      id: "p-r16-m82",
      poolId: "pool",
      participantId: "par",
      predictionKind: "round_of_16",
      teamId: "team-par",
      tournamentStageId: stageR16,
      groupCode: null,
      slotKey: "10",
      bonusKey: null,
      valueText: null,
      createdAt: "",
      updatedAt: "",
    },
    {
      id: "p-m89",
      poolId: "pool",
      participantId: "par",
      predictionKind: "quarterfinalist",
      teamId: "",
      tournamentStageId: stageR16,
      groupCode: null,
      slotKey: "1",
      bonusKey: null,
      valueText: null,
      createdAt: "",
      updatedAt: "",
    },
  ];
  const savedOnR32: Prediction[] = [
    {
      id: "p-r32-m82",
      poolId: "pool",
      participantId: "par",
      predictionKind: "round_of_32",
      teamId: "team-par",
      tournamentStageId: stageR32,
      groupCode: null,
      slotKey: m82Bottom,
      bonusKey: null,
      valueText: null,
      createdAt: "",
      updatedAt: "",
    },
  ];

  function payloadFromDrafts(drafts: KnockoutPickSlotDraft[]) {
    return drafts.map((s) => participantPickSlotPayloadFromDraft(s));
  }

  let clientSlots: KnockoutPickSlotDraft[] = [
    {
      rowKey: "round_of_16|2",
      sectionLabel: "",
      slotLabel: "",
      predictionKind: "round_of_16",
      tournamentStageId: stageR16,
      slotKey: "2",
      groupCode: null,
      bonusKey: null,
      teamId: "team-ger",
    },
    {
      rowKey: "round_of_16|5",
      sectionLabel: "",
      slotLabel: "",
      predictionKind: "round_of_16",
      tournamentStageId: stageR16,
      slotKey: "5",
      groupCode: null,
      bonusKey: null,
      teamId: "team-fra",
    },
    {
      rowKey: "round_of_16|10",
      sectionLabel: "",
      slotLabel: "",
      predictionKind: "round_of_16",
      tournamentStageId: stageR16,
      slotKey: "10",
      groupCode: null,
      bonusKey: null,
      teamId: "team-par",
    },
    {
      rowKey: `round_of_32|${m82Top}`,
      sectionLabel: "",
      slotLabel: "",
      predictionKind: "round_of_32",
      tournamentStageId: stageR32,
      slotKey: m82Top,
      groupCode: null,
      bonusKey: null,
      teamId: "",
    },
    {
      rowKey: `round_of_32|${m82Bottom}`,
      sectionLabel: "",
      slotLabel: "",
      predictionKind: "round_of_32",
      tournamentStageId: stageR32,
      slotKey: m82Bottom,
      groupCode: null,
      bonusKey: null,
      teamId: "",
    },
    {
      rowKey: "quarterfinalist|1",
      sectionLabel: "",
      slotLabel: "",
      predictionKind: "quarterfinalist",
      tournamentStageId: stageR16,
      slotKey: "1",
      groupCode: null,
      bonusKey: null,
      teamId: "team-fra",
    },
  ];
  clientSlots = promoteGradualR32WinnersToRoundOf32Slots(
    clientSlots,
    lockedGradual,
    allTeams,
  );

  const m89Save = applyGradualKnockoutPickSaveGuards({
    incoming: payloadFromDrafts(clientSlots),
    existing: savedOnR16,
    teams: allTeams,
    matches: lockedMatches,
    fullRoundOf32Official: true,
    nowMs: lockedNowMs,
  });
  assert.strictEqual(
    m89Save.error,
    null,
    "M89 save succeeds when locked M82 rows carry promoted official sides",
  );
  assert.strictEqual(
    m89Save.slots.find(
      (s) => s.predictionKind === "quarterfinalist" && s.slotKey === "1",
    )?.teamId,
    "team-fra",
  );
  assert.strictEqual(
    m89Save.slots.find(
      (s) => s.predictionKind === "round_of_32" && s.slotKey === m82Bottom,
    )?.teamId,
    "",
    "locked M82 legacy R32 row is not rewritten when saved on round_of_16",
  );

  const clearedLegacy = applyGradualKnockoutPickSaveGuards({
    incoming: payloadFromDrafts([
      {
        rowKey: `round_of_32|${m82Top}`,
        sectionLabel: "",
        slotLabel: "",
        predictionKind: "round_of_32",
        tournamentStageId: stageR32,
        slotKey: m82Top,
        groupCode: null,
        bonusKey: null,
        teamId: "",
      },
      {
        rowKey: `round_of_32|${m82Bottom}`,
        sectionLabel: "",
        slotLabel: "",
        predictionKind: "round_of_32",
        tournamentStageId: stageR32,
        slotKey: m82Bottom,
        groupCode: null,
        bonusKey: null,
        teamId: "",
      },
      {
        rowKey: "quarterfinalist|1",
        sectionLabel: "",
        slotLabel: "",
        predictionKind: "quarterfinalist",
        tournamentStageId: stageR16,
        slotKey: "1",
        groupCode: null,
        bonusKey: null,
        teamId: "team-fra",
      },
    ]),
    existing: [
      {
        id: "p-r16-m74",
        poolId: "pool",
        participantId: "par",
        predictionKind: "round_of_16",
        teamId: "team-ger",
        tournamentStageId: stageR16,
        groupCode: null,
        slotKey: "2",
        bonusKey: null,
        valueText: null,
        createdAt: "",
        updatedAt: "",
      },
      {
        id: "p-r16-m77",
        poolId: "pool",
        participantId: "par",
        predictionKind: "round_of_16",
        teamId: "team-fra",
        tournamentStageId: stageR16,
        groupCode: null,
        slotKey: "5",
        bonusKey: null,
        valueText: null,
        createdAt: "",
        updatedAt: "",
      },
      ...savedOnR32,
    ],
    teams: allTeams,
    matches: lockedMatches,
    fullRoundOf32Official: true,
    nowMs: lockedNowMs,
  });
  assert.strictEqual(
    clearedLegacy.error,
    null,
    "auto-cleared locked M82 row is coerced back to saved value",
  );
  assert.strictEqual(
    clearedLegacy.slots.find(
      (s) => s.predictionKind === "round_of_32" && s.slotKey === m82Bottom,
    )?.teamId,
    "team-par",
  );

  const swapErr = validateFrozenKnockoutSwapAttempts({
    incoming: [
      {
        predictionKind: "round_of_32",
        tournamentStageId: stageR32,
        slotKey: m82Bottom,
        groupCode: null,
        bonusKey: null,
        teamId: "team-ger",
      },
    ],
    existing: savedOnR32,
    matches: lockedMatches,
    gradual: lockedGradual,
    nowMs: lockedNowMs,
  });
  assert.ok(swapErr?.includes("M82"), swapErr ?? "expected M82 swap error");

  const clearErr = validateKnockoutParticipantPickChanges({
    incoming: [
      {
        predictionKind: "round_of_32",
        tournamentStageId: stageR32,
        slotKey: m82Bottom,
        groupCode: null,
        bonusKey: null,
        teamId: "",
      },
    ],
    existing: savedOnR32,
    matches: lockedMatches,
    gradual: lockedGradual,
    fullRoundOf32Official: true,
    nowMs: lockedNowMs,
  });
  assert.ok(clearErr?.includes("M82"), clearErr ?? "expected M82 clear error");
}

console.log("validateGradualKnockoutPickSave.selftest.ts: ok");
