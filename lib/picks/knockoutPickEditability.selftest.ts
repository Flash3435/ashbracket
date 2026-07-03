import assert from "node:assert";
import type { Team } from "../../src/types/domain";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import type { Prediction } from "../../src/types/domain";
import {
  applyKnockoutPickCorrection,
  resolveKnockoutPickCorrectionMatch,
} from "../admin/knockoutPickCorrection";
import {
  applyGradualKnockoutPickSaveGuards,
  validateKnockoutParticipantPickChanges,
} from "../predictions/validateGradualKnockoutPickSave";
import {
  buildGradualR32MatchPickRows,
  getGradualKnockoutSelectionState,
} from "./gradualKnockoutUnlock";
import {
  buildKnockoutMatchPickRows,
  isKnockoutMatchDirectPickEligible,
  readConfirmedR32MatchWinner,
  readOfficialR32MatchResultWinner,
  readParticipantR32MatchWinnerPick,
} from "./knockoutMatchPickRows";
import {
  isKnockoutMatchLockedForParticipant,
  isKnockoutPickEditableForParticipant,
  isKnockoutPickFrozenForParticipant,
} from "./knockoutPickEditability";

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
    home_goals: partial.home_goals ?? null,
    away_goals: partial.away_goals ?? null,
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
    id: "team-nor",
    name: "Norway",
    countryCode: "NOR",
    fifaCode: "NOR",
    fifaRank: 45,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  },
];

function qfSlot(slotKey: string, teamId: string): KnockoutPickSlotDraft {
  return {
    rowKey: `quarterfinalist|${slotKey}`,
    sectionLabel: "Round of 16",
    slotLabel: `R16 winner ${slotKey}`,
    predictionKind: "quarterfinalist",
    tournamentStageId: stageR16,
    slotKey,
    groupCode: null,
    bonusKey: null,
    teamId,
  };
}

const stageR32 = "stage-r32";
const stageR16 = "stage-r16";

function r16Slot(slotKey: string, teamId: string): KnockoutPickSlotDraft {
  return {
    rowKey: `round_of_16|${slotKey}`,
    sectionLabel: "Round of 16",
    slotLabel: `Slot ${slotKey}`,
    predictionKind: "round_of_16",
    tournamentStageId: stageR16,
    slotKey,
    groupCode: null,
    bonusKey: null,
    teamId,
  };
}

const m73 = match({
  match_code: "M73",
  stage_code: "round_of_32",
  kickoff_at: "2026-06-28T19:00:00Z",
  status: "finished",
  home_country_code: "CAN",
  away_country_code: "RSA",
  home_team_name: "Canada",
  away_team_name: "South Africa",
  winner_country_code: "CAN",
});
const m75 = match({
  match_code: "M75",
  stage_code: "round_of_32",
  kickoff_at: "2026-06-29T19:00:00Z",
  status: "finished",
  home_country_code: "NED",
  away_country_code: "MAR",
  home_team_name: "Netherlands",
  away_team_name: "Morocco",
  winner_country_code: "MAR",
});
const m90 = match({
  match_code: "M90",
  stage_code: "round_of_16",
  kickoff_at: "2026-07-04T19:00:00Z",
  status: "scheduled",
  home_country_code: "CAN",
  away_country_code: "MAR",
  home_team_name: "Canada",
  away_team_name: "Morocco",
});
const tournamentMatches = [m73, m75, m90];
const nowMs = new Date("2026-06-30T12:00:00Z").getTime();

const gradual = getGradualKnockoutSelectionState({
  matches: tournamentMatches,
  teams,
  nowMs,
  fullRoundOf32Official: true,
});
const ctx = {
  teams,
  tournamentMatches,
  gradual,
  knockoutBracketPicksUnlocked: true,
};

const existing: Prediction[] = [
  {
    id: "p1",
    poolId: "pool",
    participantId: "par",
    predictionKind: "round_of_16",
    teamId: "team-ned",
    tournamentStageId: stageR16,
    groupCode: null,
    slotKey: "3",
    bonusKey: null,
    valueText: null,
    createdAt: "",
    updatedAt: "",
  },
];

// Official result locks match even when status is still scheduled
{
  const scheduledWithWinner = match({
    match_code: "M99",
    stage_code: "quarterfinal",
    kickoff_at: "2026-07-10T19:00:00Z",
    status: "scheduled",
    home_country_code: "CAN",
    away_country_code: "MAR",
    winner_country_code: "MAR",
  });
  assert.ok(
    isKnockoutMatchLockedForParticipant(scheduledWithWinner, nowMs),
    "official winner locks before kickoff",
  );
}

// Participant picked Netherlands; Morocco won — slot is not editable
{
  assert.strictEqual(
    readParticipantR32MatchWinnerPick(2, [r16Slot("3", "team-ned")], ctx),
    "team-ned",
    "participant path still shows Netherlands",
  );
  assert.strictEqual(
    readOfficialR32MatchResultWinner(2, ctx),
    "team-mar",
    "official advanced team is Morocco",
  );
  assert.strictEqual(
    readConfirmedR32MatchWinner(2, [r16Slot("3", "team-ned")], ctx),
    "team-mar",
    "bracket fixture uses official Morocco",
  );
  assert.strictEqual(
    isKnockoutPickEditableForParticipant({
      predictionKind: "round_of_16",
      slotKey: "3",
      tournamentMatches,
      gradual,
      fullRoundOf32Official: true,
      nowMs,
    }),
    false,
    "eliminated R32 pick cannot be changed to Morocco",
  );
  const uiRows = buildGradualR32MatchPickRows({
    slots: [r16Slot("3", "team-ned")],
    state: gradual,
    teams,
    fullRoundOf32Official: true,
  });
  const m75Row = uiRows.find((r) => r.fifaMatchNo === 75)!;
  assert.strictEqual(m75Row.winnerTeamId, "team-ned");
  assert.strictEqual(m75Row.officialResultTeamId, "team-mar");
  assert.strictEqual(m75Row.participantPickEliminated, true);
  assert.strictEqual(m75Row.lockReason, "started");
  const r16Rows = buildKnockoutMatchPickRows({
    bracketKind: "round_of_16",
    slots: [r16Slot("3", "team-ned"), r16Slot("1", "team-can")],
    teams,
    tournamentMatches,
    gradual,
    knockoutBracketPicksUnlocked: true,
    nowMs,
  });
  const r16M90 = r16Rows.find((r) => r.fifaMatchNo === 90)!;
  assert.strictEqual(r16M90.homeTeamId, "team-can");
  assert.strictEqual(r16M90.awayTeamId, "team-mar");
}

// Server rejects participant swap to official winner after result
{
  const err = validateKnockoutParticipantPickChanges({
    incoming: [
      {
        predictionKind: "round_of_16",
        tournamentStageId: stageR16,
        slotKey: "3",
        groupCode: null,
        bonusKey: null,
        teamId: "team-mar",
      },
    ],
    existing,
    matches: tournamentMatches,
    gradual,
    fullRoundOf32Official: true,
    nowMs,
  });
  assert.ok(err, "server blocks Morocco swap after Netherlands lost");
  const guarded = applyGradualKnockoutPickSaveGuards({
    incoming: [
      {
        predictionKind: "round_of_16",
        tournamentStageId: stageR16,
        slotKey: "3",
        groupCode: null,
        bonusKey: null,
        teamId: "team-mar",
      },
    ],
    existing,
    teams,
    matches: tournamentMatches,
    fullRoundOf32Official: true,
    nowMs,
  });
  assert.ok(guarded.error, "save guards reject Morocco swap");
}

// Admin correction still works on locked match
{
  const slots = [r16Slot("3", "team-ned")];
  const resolved = resolveKnockoutPickCorrectionMatch({
    matchCode: "M75",
    slots,
    teams,
    tournamentMatches,
    fullRoundOf32Official: true,
  });
  assert.ok(!("error" in resolved), "expected resolved match for admin correction");
  const applied = applyKnockoutPickCorrection({
    slots,
    match: resolved.match,
    newTeamId: "team-mar",
    teams,
    tournamentMatches,
    fullRoundOf32Official: true,
  });
  assert.strictEqual(
    applied.slots.find((s) => s.predictionKind === "round_of_16" && s.slotKey === "3")
      ?.teamId,
    "team-mar",
    "admin can correct locked eliminated pick",
  );
}

// Not-yet-started unlocked matchup remains editable
{
  const futureM75 = match({
    match_code: "M75",
    stage_code: "round_of_32",
    kickoff_at: "2026-08-01T19:00:00Z",
    status: "scheduled",
    home_country_code: "NED",
    away_country_code: "MAR",
    home_team_name: "Netherlands",
    away_team_name: "Morocco",
  });
  const futureGradual = getGradualKnockoutSelectionState({
    matches: [futureM75],
    teams,
    nowMs,
    fullRoundOf32Official: true,
  });
  assert.strictEqual(
    isKnockoutPickEditableForParticipant({
      predictionKind: "round_of_16",
      slotKey: "3",
      tournamentMatches: [futureM75],
      gradual: futureGradual,
      fullRoundOf32Official: true,
      nowMs,
    }),
    true,
    "future R32 matchup stays editable",
  );
}

// Live/final matchup is not editable even when participant pick is missing
{
  const liveM75 = match({
    match_code: "M75",
    stage_code: "round_of_32",
    kickoff_at: "2026-06-29T19:00:00Z",
    status: "live",
    home_country_code: "NED",
    away_country_code: "MAR",
  });
  const liveGradual = getGradualKnockoutSelectionState({
    matches: [liveM75],
    teams,
    nowMs,
    fullRoundOf32Official: true,
  });
  assert.strictEqual(
    isKnockoutPickEditableForParticipant({
      predictionKind: "round_of_16",
      slotKey: "3",
      tournamentMatches: [liveM75],
      gradual: liveGradual,
      fullRoundOf32Official: true,
      nowMs,
    }),
    false,
    "live match blocks missing pick",
  );
  const missingErr = validateKnockoutParticipantPickChanges({
    incoming: [
      {
        predictionKind: "round_of_16",
        tournamentStageId: stageR16,
        slotKey: "3",
        groupCode: null,
        bonusKey: null,
        teamId: "team-ned",
      },
    ],
    existing: [],
    matches: [liveM75],
    gradual: liveGradual,
    fullRoundOf32Official: true,
    nowMs,
  });
  assert.ok(missingErr, "cannot add first pick on live match");
}

// 1. Canada R16 pick frozen after Morocco eliminates Netherlands in R32 feeders
{
  const slots = [r16Slot("3", "team-ned"), qfSlot("2", "team-can")];
  const existingQf: Prediction[] = [
    {
      id: "p-qf",
      poolId: "pool",
      participantId: "par",
      predictionKind: "quarterfinalist",
      teamId: "team-can",
      tournamentStageId: stageR16,
      groupCode: null,
      slotKey: "2",
      bonusKey: null,
      valueText: null,
      createdAt: "",
      updatedAt: "",
    },
  ];
  const r16Rows = buildKnockoutMatchPickRows({
    bracketKind: "round_of_16",
    slots,
    teams,
    tournamentMatches,
    gradual,
    knockoutBracketPicksUnlocked: true,
    nowMs,
  });
  const m90 = r16Rows.find((r) => r.fifaMatchNo === 90)!;
  assert.strictEqual(m90.homeTeamId, "team-can");
  assert.strictEqual(m90.awayTeamId, "team-mar");
  assert.strictEqual(m90.winnerTeamId, "team-can");
  assert.strictEqual(m90.lockReason, "frozen");
  assert.strictEqual(isKnockoutMatchDirectPickEligible(m90), false);
  assert.strictEqual(
    isKnockoutPickEditableForParticipant({
      predictionKind: "quarterfinalist",
      slotKey: "2",
      tournamentMatches,
      gradual,
      fullRoundOf32Official: true,
      nowMs,
    }),
    false,
  );
  const swapErr = validateKnockoutParticipantPickChanges({
    incoming: [
      {
        predictionKind: "quarterfinalist",
        tournamentStageId: stageR16,
        slotKey: "2",
        groupCode: null,
        bonusKey: null,
        teamId: "team-mar",
      },
    ],
    existing: existingQf,
    matches: tournamentMatches,
    gradual,
    fullRoundOf32Official: true,
    nowMs,
  });
  assert.ok(swapErr, "cannot switch R16 winner from Canada to Morocco");
}

// 2. Norway R16 pick frozen when Brazil appears from official feeder
{
  const m76 = match({
    match_code: "M76",
    stage_code: "round_of_32",
    kickoff_at: "2026-06-28T19:00:00Z",
    status: "finished",
    home_country_code: "BRA",
    away_country_code: "JPN",
    home_team_name: "Brazil",
    away_team_name: "Japan",
    winner_country_code: "BRA",
  });
  const m78 = match({
    match_code: "M78",
    stage_code: "round_of_32",
    kickoff_at: "2026-06-29T19:00:00Z",
    status: "scheduled",
    home_country_code: "NOR",
    away_country_code: "SWE",
    home_team_name: "Norway",
    away_team_name: "Sweden",
  });
  const norMatches = [m76, m78];
  const norGradual = getGradualKnockoutSelectionState({
    matches: norMatches,
    teams,
    nowMs,
    fullRoundOf32Official: true,
  });
  const slots = [r16Slot("4", "team-bra"), r16Slot("6", "team-nor"), qfSlot("3", "team-nor")];
  const rows = buildKnockoutMatchPickRows({
    bracketKind: "round_of_16",
    slots,
    teams,
    tournamentMatches: norMatches,
    gradual: norGradual,
    knockoutBracketPicksUnlocked: true,
    nowMs,
  });
  const m91 = rows.find((r) => r.fifaMatchNo === 91)!;
  assert.strictEqual(m91.homeTeamId, "team-bra");
  assert.strictEqual(m91.awayTeamId, "team-nor");
  assert.strictEqual(m91.lockReason, "frozen");
  assert.strictEqual(
    isKnockoutPickFrozenForParticipant({
      predictionKind: "quarterfinalist",
      slotKey: "3",
      tournamentMatches: norMatches,
      gradual: norGradual,
      nowMs,
    }),
    true,
  );
  const swapErr = validateKnockoutParticipantPickChanges({
    incoming: [
      {
        predictionKind: "quarterfinalist",
        tournamentStageId: stageR16,
        slotKey: "3",
        groupCode: null,
        bonusKey: null,
        teamId: "team-bra",
      },
    ],
    existing: [
      {
        id: "p-qf3",
        poolId: "pool",
        participantId: "par",
        predictionKind: "quarterfinalist",
        teamId: "team-nor",
        tournamentStageId: stageR16,
        groupCode: null,
        slotKey: "3",
        bonusKey: null,
        valueText: null,
        createdAt: "",
        updatedAt: "",
      },
    ],
    matches: norMatches,
    gradual: norGradual,
    fullRoundOf32Official: true,
    nowMs,
  });
  assert.ok(swapErr, "cannot switch Norway pick to Brazil after feeder is official");
}

// 3. Clear is blocked for frozen later-round rows
{
  const clearErr = validateKnockoutParticipantPickChanges({
    incoming: [
      {
        predictionKind: "quarterfinalist",
        tournamentStageId: stageR16,
        slotKey: "2",
        groupCode: null,
        bonusKey: null,
        teamId: "",
      },
    ],
    existing: [
      {
        id: "p-qf",
        poolId: "pool",
        participantId: "par",
        predictionKind: "quarterfinalist",
        teamId: "team-can",
        tournamentStageId: stageR16,
        groupCode: null,
        slotKey: "2",
        bonusKey: null,
        valueText: null,
        createdAt: "",
        updatedAt: "",
      },
    ],
    matches: tournamentMatches,
    gradual,
    fullRoundOf32Official: true,
    nowMs,
  });
  assert.ok(clearErr, "clear blocked for frozen R16 match row");
  const guarded = applyGradualKnockoutPickSaveGuards({
    incoming: [
      {
        predictionKind: "quarterfinalist",
        tournamentStageId: stageR16,
        slotKey: "2",
        groupCode: null,
        bonusKey: null,
        teamId: "",
      },
    ],
    existing: [
      {
        id: "p-qf",
        poolId: "pool",
        participantId: "par",
        predictionKind: "quarterfinalist",
        teamId: "team-can",
        tournamentStageId: stageR16,
        groupCode: null,
        slotKey: "2",
        bonusKey: null,
        valueText: null,
        createdAt: "",
        updatedAt: "",
      },
    ],
    teams,
    matches: tournamentMatches,
    fullRoundOf32Official: true,
    nowMs,
  });
  assert.strictEqual(
    guarded.error,
    null,
    "save guards restore frozen clear instead of failing whole payload",
  );
  assert.strictEqual(
    guarded.slots.find((s) => s.predictionKind === "quarterfinalist" && s.slotKey === "2")
      ?.teamId,
    "team-can",
  );
}

// 4. Direct server mutation rejected for frozen later-round rows (covered above)

// 5. Future rows whose feeders are not locked remain editable
{
  const futureM74 = match({
    match_code: "M74",
    stage_code: "round_of_32",
    kickoff_at: "2026-08-01T19:00:00Z",
    status: "scheduled",
    home_country_code: "CAN",
    away_country_code: "NED",
    home_team_name: "Canada",
    away_team_name: "Netherlands",
  });
  const futureM77 = match({
    match_code: "M77",
    stage_code: "round_of_32",
    kickoff_at: "2026-08-02T19:00:00Z",
    status: "scheduled",
    home_country_code: "MAR",
    away_country_code: "BRA",
    home_team_name: "Morocco",
    away_team_name: "Brazil",
  });
  const futureMatches = [...tournamentMatches, futureM74, futureM77];
  const futureGradual = getGradualKnockoutSelectionState({
    matches: futureMatches,
    teams,
    nowMs,
    fullRoundOf32Official: true,
  });
  const futureSlots = [
    r16Slot("1", "team-can"),
    r16Slot("2", "team-can"),
    r16Slot("3", "team-ned"),
    r16Slot("5", "team-mar"),
    qfSlot("1", "team-can"),
    qfSlot("2", "team-can"),
  ];
  const futureRows = buildKnockoutMatchPickRows({
    bracketKind: "round_of_16",
    slots: futureSlots,
    teams,
    tournamentMatches: futureMatches,
    gradual: futureGradual,
    knockoutBracketPicksUnlocked: true,
    nowMs,
  });
  const m89 = futureRows.find((r) => r.fifaMatchNo === 89)!;
  const m90 = futureRows.find((r) => r.fifaMatchNo === 90)!;
  assert.strictEqual(m90.lockReason, "frozen", "M90 frozen after official R32 feeders");
  assert.strictEqual(m89.lockReason, "pickable", "M89 stays editable before feeder results");
  assert.strictEqual(m89.homeTeamId, "team-can");
  assert.strictEqual(m89.awayTeamId, "team-mar");
  assert.strictEqual(isKnockoutMatchDirectPickEligible(m89), true);
  assert.strictEqual(
    isKnockoutPickFrozenForParticipant({
      predictionKind: "quarterfinalist",
      slotKey: "1",
      tournamentMatches: futureMatches,
      gradual: futureGradual,
      nowMs,
    }),
    false,
  );
}

// 6. Admin correction still works on feeder-locked rows
{
  const slots = [r16Slot("3", "team-ned"), qfSlot("2", "team-can")];
  const resolved = resolveKnockoutPickCorrectionMatch({
    matchCode: "M90",
    slots,
    teams,
    tournamentMatches,
    fullRoundOf32Official: true,
    knockoutBracketPicksUnlocked: true,
    nowMs,
  });
  assert.ok(!("error" in resolved), "admin can open correction on frozen R16 row");
  const applied = applyKnockoutPickCorrection({
    slots,
    match: resolved.match,
    newTeamId: "team-mar",
    teams,
    tournamentMatches,
    fullRoundOf32Official: true,
  });
  assert.strictEqual(
    applied.slots.find((s) => s.predictionKind === "quarterfinalist" && s.slotKey === "2")
      ?.teamId,
    "team-mar",
    "admin can correct frozen R16 match winner",
  );
}

// 7. Save unlocked R16 pick when frozen row was auto-cleared in client payload
{
  const futureM74 = match({
    match_code: "M74",
    stage_code: "round_of_32",
    kickoff_at: "2026-08-01T19:00:00Z",
    status: "scheduled",
    home_country_code: "CAN",
    away_country_code: "NED",
    home_team_name: "Canada",
    away_team_name: "Netherlands",
  });
  const futureM77 = match({
    match_code: "M77",
    stage_code: "round_of_32",
    kickoff_at: "2026-08-02T19:00:00Z",
    status: "scheduled",
    home_country_code: "MAR",
    away_country_code: "SWE",
    home_team_name: "Morocco",
    away_team_name: "Sweden",
  });
  const futureMatches = [...tournamentMatches, futureM74, futureM77];
  const futureGradual = getGradualKnockoutSelectionState({
    matches: futureMatches,
    teams: [
      ...teams,
      {
        id: "team-swe",
        name: "Sweden",
        countryCode: "SWE",
        fifaCode: "SWE",
        fifaRank: 20,
        fifaRankAsOf: null,
        createdAt: "",
        updatedAt: "",
      },
    ],
    nowMs,
    fullRoundOf32Official: true,
  });
  const existingQf: Prediction[] = [
    {
      id: "p-qf2",
      poolId: "pool",
      participantId: "par",
      predictionKind: "quarterfinalist",
      teamId: "team-can",
      tournamentStageId: stageR16,
      groupCode: null,
      slotKey: "2",
      bonusKey: null,
      valueText: null,
      createdAt: "",
      updatedAt: "",
    },
  ];
  const guarded = applyGradualKnockoutPickSaveGuards({
    incoming: [
      {
        predictionKind: "quarterfinalist",
        tournamentStageId: stageR16,
        slotKey: "1",
        groupCode: null,
        bonusKey: null,
        teamId: "team-swe",
      },
      {
        predictionKind: "quarterfinalist",
        tournamentStageId: stageR16,
        slotKey: "2",
        groupCode: null,
        bonusKey: null,
        teamId: "",
      },
    ],
    existing: existingQf,
    teams: [
      ...teams,
      {
        id: "team-swe",
        name: "Sweden",
        countryCode: "SWE",
        fifaCode: "SWE",
        fifaRank: 20,
        fifaRankAsOf: null,
        createdAt: "",
        updatedAt: "",
      },
    ],
    matches: futureMatches,
    fullRoundOf32Official: true,
    nowMs,
  });
  assert.strictEqual(
    guarded.error,
    null,
    "unlocked M89 pick saves even when frozen M90 slot was cleared client-side",
  );
  assert.strictEqual(
    guarded.slots.find((s) => s.predictionKind === "quarterfinalist" && s.slotKey === "1")
      ?.teamId,
    "team-swe",
  );
  assert.strictEqual(
    guarded.slots.find((s) => s.predictionKind === "quarterfinalist" && s.slotKey === "2")
      ?.teamId,
    "team-can",
    "frozen saved pick is preserved in payload",
  );
}

// 8. Frozen swap still rejected with row label in error
{
  const swapErr = validateKnockoutParticipantPickChanges({
    incoming: [
      {
        predictionKind: "quarterfinalist",
        tournamentStageId: stageR16,
        slotKey: "2",
        groupCode: null,
        bonusKey: null,
        teamId: "team-mar",
      },
    ],
    existing: [
      {
        id: "p-qf",
        poolId: "pool",
        participantId: "par",
        predictionKind: "quarterfinalist",
        teamId: "team-can",
        tournamentStageId: stageR16,
        groupCode: null,
        slotKey: "2",
        bonusKey: null,
        valueText: null,
        createdAt: "",
        updatedAt: "",
      },
    ],
    matches: tournamentMatches,
    gradual,
    fullRoundOf32Official: true,
    nowMs,
  });
  assert.ok(swapErr?.includes("M90"), swapErr ?? "expected M90 in frozen swap error");
  assert.ok(
    swapErr?.includes("feeder match results are official"),
    swapErr ?? "expected feeder lock reason",
  );
}

console.log("knockoutPickEditability.selftest.ts: ok");
