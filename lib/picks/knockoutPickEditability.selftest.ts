import assert from "node:assert";
import type { Team } from "../../src/types/domain";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import type { Prediction, Result } from "../../src/types/domain";
import { computePoolScores } from "../../src/lib/scoring/computePoolScores";
import {
  applyKnockoutPickCorrection,
  resolveKnockoutPickCorrectionMatch,
} from "../admin/knockoutPickCorrection";
import {
  applyGradualKnockoutPickSaveGuards,
  validateKnockoutParticipantPickChanges,
} from "../predictions/validateGradualKnockoutPickSave";
import { applyKnockoutPathInvalidation } from "../predictions/knockoutPathInvalidation";
import { pruneOfficialKnockoutPathPicks } from "../predictions/pruneOfficialKnockoutPathPicks";
import { pruneParticipantPicks } from "../predictions/knockoutPickConsistency";
import { diagnoseKnockoutR16MatchRow } from "./knockoutR16RowDiagnostic";
import {
  buildGradualR32MatchPickRows,
  getGradualKnockoutSelectionState,
  gradualR32MatchSavedPickPresentation,
} from "./gradualKnockoutUnlock";
import {
  buildKnockoutMatchPickRows,
  isKnockoutMatchDirectPickEligible,
  knockoutMatchSavedPickPresentation,
  readConfirmedR32MatchWinner,
  readOfficialR32MatchResultWinner,
  readParticipantR32MatchWinnerPick,
  validateKnockoutLaterMatchPick,
  validatedKnockoutMatchWinner,
} from "./knockoutMatchPickRows";
import {
  isKnockoutMatchLockedForParticipant,
  isKnockoutPickEditableForParticipant,
  isKnockoutPickFrozenForParticipant,
  KNOCKOUT_R16_MISSING_PICK_OPEN_UNTIL_KICKOFF,
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

function sfSlot(slotKey: string, teamId: string): KnockoutPickSlotDraft {
  return {
    rowKey: `semifinalist|${slotKey}`,
    sectionLabel: "Semi-finals",
    slotLabel: `SF winner ${slotKey}`,
    predictionKind: "semifinalist",
    tournamentStageId: stageR16,
    slotKey,
    groupCode: null,
    bonusKey: null,
    teamId,
  };
}

function finSlot(slotKey: string, teamId: string): KnockoutPickSlotDraft {
  return {
    rowKey: `finalist|${slotKey}`,
    sectionLabel: "Final",
    slotLabel: `Final winner ${slotKey}`,
    predictionKind: "finalist",
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

// 1. No saved M90 pick, feeders official, M90 not started → first-time pick allowed
{
  const emptyM90Slots = [r16Slot("1", "team-can"), r16Slot("3", "team-mar")];
  const rows = buildKnockoutMatchPickRows({
    bracketKind: "round_of_16",
    slots: emptyM90Slots,
    teams,
    tournamentMatches,
    gradual,
    knockoutBracketPicksUnlocked: true,
    nowMs,
  });
  const m90Row = rows.find((r) => r.fifaMatchNo === 90)!;
  assert.strictEqual(m90Row.homeTeamId, "team-can");
  assert.strictEqual(m90Row.awayTeamId, "team-mar");
  assert.strictEqual(m90Row.winnerTeamId, "");
  assert.strictEqual(m90Row.lockReason, "pickable");
  assert.strictEqual(isKnockoutMatchDirectPickEligible(m90Row), true);
  assert.strictEqual(
    validateKnockoutLaterMatchPick(m90Row, "team-can"),
    null,
    "can pick Canada",
  );
  assert.strictEqual(
    validateKnockoutLaterMatchPick(m90Row, "team-mar"),
    null,
    "can pick Morocco",
  );
  assert.strictEqual(
    isKnockoutPickEditableForParticipant({
      predictionKind: "quarterfinalist",
      slotKey: "2",
      tournamentMatches,
      gradual,
      fullRoundOf32Official: true,
      savedTeamId: "",
      nowMs,
    }),
    true,
  );
  const backfillOk = applyGradualKnockoutPickSaveGuards({
    incoming: [
      {
        predictionKind: "quarterfinalist",
        tournamentStageId: stageR16,
        slotKey: "2",
        groupCode: null,
        bonusKey: null,
        teamId: "team-can",
      },
    ],
    existing: [
      {
        id: "p-r16-1",
        poolId: "pool",
        participantId: "par",
        predictionKind: "round_of_16",
        teamId: "team-can",
        tournamentStageId: stageR16,
        groupCode: null,
        slotKey: "1",
        bonusKey: null,
        valueText: null,
        createdAt: "",
        updatedAt: "",
      },
      {
        id: "p-r16-3",
        poolId: "pool",
        participantId: "par",
        predictionKind: "round_of_16",
        teamId: "team-mar",
        tournamentStageId: stageR16,
        groupCode: null,
        slotKey: "3",
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
  assert.strictEqual(backfillOk.error, null, "server allows first-time M90 pick");
  assert.strictEqual(
    backfillOk.slots.find((s) => s.predictionKind === "quarterfinalist" && s.slotKey === "2")
      ?.teamId,
    "team-can",
  );
}

// Wrong upstream Netherlands does not block M90 when saved winner is in official matchup.
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
  assert.strictEqual(m90.lockReason, "pickable");
  assert.strictEqual(validatedKnockoutMatchWinner(m90), "team-can");
  assert.strictEqual(isKnockoutMatchDirectPickEligible(m90), false);
  assert.strictEqual(
    isKnockoutPickEditableForParticipant({
      predictionKind: "quarterfinalist",
      slotKey: "2",
      tournamentMatches,
      gradual,
      fullRoundOf32Official: true,
      savedTeamId: "team-can",
      progressionRows: slots,
      teams,
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
    existing: [
      {
        id: "p-r16-3",
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
      ...existingQf,
    ],
    matches: tournamentMatches,
    gradual,
    fullRoundOf32Official: true,
    teams,
    nowMs,
  });
  assert.ok(swapErr, "cannot switch M90 winner when upstream path is broken");
}

// 2. Saved M90 Canada with valid upstream, feeders official, M90 not started → can switch or clear
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
        id: "p-r16-1",
        poolId: "pool",
        participantId: "par",
        predictionKind: "round_of_16",
        teamId: "team-can",
        tournamentStageId: stageR16,
        groupCode: null,
        slotKey: "1",
        bonusKey: null,
        valueText: null,
        createdAt: "",
        updatedAt: "",
      },
      {
        id: "p-r16-3",
        poolId: "pool",
        participantId: "par",
        predictionKind: "round_of_16",
        teamId: "team-mar",
        tournamentStageId: stageR16,
        groupCode: null,
        slotKey: "3",
        bonusKey: null,
        valueText: null,
        createdAt: "",
        updatedAt: "",
      },
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
    teams,
    nowMs,
  });
  assert.ok(clearErr, "clear blocked — original M90 pick is locked");
}

// 3. Saved stale M90 Netherlands (not in official matchup) → out and locked.
{
  const staleSlots = [r16Slot("3", "team-ned"), qfSlot("2", "team-ned")];
  const staleRows = buildKnockoutMatchPickRows({
    bracketKind: "round_of_16",
    slots: staleSlots,
    teams,
    tournamentMatches,
    gradual,
    knockoutBracketPicksUnlocked: true,
    nowMs,
  });
  const staleM90 = staleRows.find((r) => r.fifaMatchNo === 90)!;
  assert.strictEqual(staleM90.homeTeamId, "team-can");
  assert.strictEqual(staleM90.awayTeamId, "team-mar");
  assert.strictEqual(staleM90.winnerTeamId, "team-ned");
  assert.strictEqual(staleM90.lockReason, "frozen");
  assert.match(staleM90.display.statusLine!, /Netherlands did not reach this match/i);
  assert.strictEqual(isKnockoutMatchDirectPickEligible(staleM90), false);
  const presentation = knockoutMatchSavedPickPresentation(staleM90, teams);
  assert.strictEqual(presentation.savedPickStatus, "stale");
  assert.ok(
    validateKnockoutLaterMatchPick(staleM90, "team-mar"),
    "participant cannot repair stale M90 when upstream path is broken",
  );
  const repairOk = applyGradualKnockoutPickSaveGuards({
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
        id: "p-r16-3",
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
      {
        id: "p-stale",
        poolId: "pool",
        participantId: "par",
        predictionKind: "quarterfinalist",
        teamId: "team-ned",
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
  assert.ok(
    repairOk.error,
    "server blocks replacing stale Netherlands pick when upstream path is broken",
  );
}

// 3b. Production wizard load path: path repair must not lock stale M90 as out before kickoff
{
  const wizardSlots = [r16Slot("1", "team-can"), r16Slot("3", "team-ned"), qfSlot("2", "team-ned")];
  const diagnostic = diagnoseKnockoutR16MatchRow({
    fifaMatchNo: 90,
    slots: wizardSlots,
    teams,
    tournamentMatches,
    knockoutBracketPicksUnlocked: true,
    participantId: "par",
    poolId: "pool",
    nowMs,
    simulateWizardLoadRepair: true,
  })!;
  assert.strictEqual(diagnostic.resolvedSideTeamIds.homeTeamId, "team-can");
  assert.strictEqual(diagnostic.resolvedSideTeamIds.awayTeamId, "team-mar");
  assert.strictEqual(diagnostic.matchupLine, "Canada vs Morocco");
  assert.strictEqual(diagnostic.validSavedPick, false);
  assert.strictEqual(diagnostic.lockReason, "frozen");
  assert.strictEqual(diagnostic.directPickEligible, false);
  assert.strictEqual(
    diagnostic.editabilityReason,
    "saved_pick_marked_out",
  );
  assert.strictEqual(diagnostic.storedPickStatus, "out");

  const pruned = pruneOfficialKnockoutPathPicks(wizardSlots, ctx);
  const repaired = applyKnockoutPathInvalidation(pruned.slots, pruned.cleared, {
    teams,
    tournamentMatches,
    knockoutBracketPicksUnlocked: true,
    nowMs,
  });
  const qf2 = repaired.find(
    (s) => s.predictionKind === "quarterfinalist" && s.slotKey === "2",
  );
  assert.strictEqual(qf2?.teamId, "team-ned", "original M90 pick preserved on load");
  assert.strictEqual(qf2?.pickStatus, "out");

  const displaySlots = pruneParticipantPicks(repaired, { r32WinnerContext: ctx });
  const wizardRows = buildKnockoutMatchPickRows({
    bracketKind: "round_of_16",
    slots: displaySlots,
    teams,
    tournamentMatches,
    gradual,
    knockoutBracketPicksUnlocked: true,
    nowMs,
  });
  const wizardM90 = wizardRows.find((r) => r.fifaMatchNo === 90)!;
  assert.strictEqual(wizardM90.homeTeamId, "team-can");
  assert.strictEqual(wizardM90.awayTeamId, "team-mar");
  assert.strictEqual(wizardM90.lockReason, "frozen");
  assert.strictEqual(wizardM90.display.emptyPrimaryLine, "Canada vs Morocco");
  assert.strictEqual(isKnockoutMatchDirectPickEligible(wizardM90), false);
  assert.strictEqual(validatedKnockoutMatchWinner(wizardM90), null);
  assert.match(
    wizardM90.display.statusLine!,
    /Netherlands did not reach this match/i,
  );
}

// 4. No saved M90 pick, M90 started/live/final → cannot backfill
{
  const liveM90 = match({
    match_code: "M90",
    stage_code: "round_of_16",
    kickoff_at: "2026-07-04T19:00:00Z",
    status: "live",
    home_country_code: "CAN",
    away_country_code: "MAR",
    home_team_name: "Canada",
    away_team_name: "Morocco",
  });
  const liveMatches = [m73, m75, liveM90];
  const liveGradual = getGradualKnockoutSelectionState({
    matches: liveMatches,
    teams,
    nowMs: new Date("2026-07-04T20:00:00Z").getTime(),
    fullRoundOf32Official: true,
  });
  const liveRows = buildKnockoutMatchPickRows({
    bracketKind: "round_of_16",
    slots: [r16Slot("1", "team-can"), r16Slot("3", "team-mar")],
    teams,
    tournamentMatches: liveMatches,
    gradual: liveGradual,
    knockoutBracketPicksUnlocked: true,
    nowMs: new Date("2026-07-04T20:00:00Z").getTime(),
  });
  const liveM90Row = liveRows.find((r) => r.fifaMatchNo === 90)!;
  assert.strictEqual(liveM90Row.lockReason, "started");
  assert.strictEqual(isKnockoutMatchDirectPickEligible(liveM90Row), false);
  const backfillErr = validateKnockoutParticipantPickChanges({
    incoming: [
      {
        predictionKind: "quarterfinalist",
        tournamentStageId: stageR16,
        slotKey: "2",
        groupCode: null,
        bonusKey: null,
        teamId: "team-can",
      },
    ],
    existing: [],
    matches: liveMatches,
    gradual: liveGradual,
    fullRoundOf32Official: true,
    nowMs: new Date("2026-07-04T20:00:00Z").getTime(),
  });
  assert.ok(backfillErr, "cannot backfill M90 after kickoff");
}

// 4b. Stale saved M90 Netherlands after kickoff → locked, admin correction only
{
  const finishedM90 = match({
    match_code: "M90",
    stage_code: "round_of_16",
    kickoff_at: "2026-07-04T19:00:00Z",
    status: "finished",
    home_country_code: "CAN",
    away_country_code: "MAR",
    home_team_name: "Canada",
    away_team_name: "Morocco",
    winner_country_code: "MAR",
  });
  const afterKickoffMatches = [m73, m75, finishedM90];
  const afterKickoffGradual = getGradualKnockoutSelectionState({
    matches: afterKickoffMatches,
    teams,
    nowMs: new Date("2026-07-05T12:00:00Z").getTime(),
    fullRoundOf32Official: true,
  });
  const staleSlots = [r16Slot("1", "team-can"), r16Slot("3", "team-mar"), qfSlot("2", "team-ned")];
  const staleRows = buildKnockoutMatchPickRows({
    bracketKind: "round_of_16",
    slots: staleSlots,
    teams,
    tournamentMatches: afterKickoffMatches,
    gradual: afterKickoffGradual,
    knockoutBracketPicksUnlocked: true,
    nowMs: new Date("2026-07-05T12:00:00Z").getTime(),
  });
  const staleM90 = staleRows.find((r) => r.fifaMatchNo === 90)!;
  assert.strictEqual(staleM90.lockReason, "started");
  assert.strictEqual(isKnockoutMatchDirectPickEligible(staleM90), false);
  const presentation = knockoutMatchSavedPickPresentation(staleM90, teams);
  assert.strictEqual(presentation.savedPickStatus, "stale");
  assert.match(
    presentation.savedPickWarning!,
    /Netherlands did not reach this match/i,
  );
  const repairErr = validateKnockoutParticipantPickChanges({
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
        id: "p-stale-after",
        poolId: "pool",
        participantId: "par",
        predictionKind: "quarterfinalist",
        teamId: "team-ned",
        tournamentStageId: stageR16,
        groupCode: null,
        slotKey: "2",
        bonusKey: null,
        valueText: null,
        createdAt: "",
        updatedAt: "",
      },
    ],
    matches: afterKickoffMatches,
    gradual: afterKickoffGradual,
    fullRoundOf32Official: true,
    teams,
    nowMs: new Date("2026-07-05T12:00:00Z").getTime(),
  });
  assert.ok(repairErr, "cannot repair stale M90 pick after kickoff");
}

// Norway R16 pick stays editable before M91 kickoff when Brazil is official feeder
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
  assert.strictEqual(m91.lockReason, "pickable");
  assert.strictEqual(
    isKnockoutPickFrozenForParticipant({
      predictionKind: "quarterfinalist",
      slotKey: "3",
      tournamentMatches: norMatches,
      gradual: norGradual,
      savedTeamId: "team-nor",
      nowMs,
    }),
    true,
    "saved original pick is locked before kickoff",
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
  assert.ok(
    swapErr,
    "cannot switch locked original Norway pick before M91 kickoff",
  );
}

// 3. Clear is blocked on later-round rows when an original pick is saved
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
        id: "p-r16-1",
        poolId: "pool",
        participantId: "par",
        predictionKind: "round_of_16",
        teamId: "team-can",
        tournamentStageId: stageR16,
        groupCode: null,
        slotKey: "1",
        bonusKey: null,
        valueText: null,
        createdAt: "",
        updatedAt: "",
      },
      {
        id: "p-r16-3",
        poolId: "pool",
        participantId: "par",
        predictionKind: "round_of_16",
        teamId: "team-mar",
        tournamentStageId: stageR16,
        groupCode: null,
        slotKey: "3",
        bonusKey: null,
        valueText: null,
        createdAt: "",
        updatedAt: "",
      },
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
    teams,
    nowMs,
  });
  assert.ok(clearErr, "clear blocked — original M90 pick is locked");
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
        id: "p-r16-1",
        poolId: "pool",
        participantId: "par",
        predictionKind: "round_of_16",
        teamId: "team-can",
        tournamentStageId: stageR16,
        groupCode: null,
        slotKey: "1",
        bonusKey: null,
        valueText: null,
        createdAt: "",
        updatedAt: "",
      },
      {
        id: "p-r16-3",
        poolId: "pool",
        participantId: "par",
        predictionKind: "round_of_16",
        teamId: "team-mar",
        tournamentStageId: stageR16,
        groupCode: null,
        slotKey: "3",
        bonusKey: null,
        valueText: null,
        createdAt: "",
        updatedAt: "",
      },
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
  assert.strictEqual(guarded.error, null);
  assert.strictEqual(
    guarded.slots.find((s) => s.predictionKind === "quarterfinalist" && s.slotKey === "2")
      ?.teamId,
    "team-can",
    "coerce restores locked original pick",
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
  assert.strictEqual(
    m90.lockReason,
    "pickable",
    "M90 stays open before kickoff when saved winner matches official matchup",
  );
  assert.strictEqual(m89.lockReason, "pickable", "M89 stays editable before feeder results");
  assert.strictEqual(m89.homeTeamId, "team-can");
  assert.strictEqual(m89.awayTeamId, "team-mar");
  assert.strictEqual(isKnockoutMatchDirectPickEligible(m89), false);
  assert.strictEqual(isKnockoutMatchDirectPickEligible(m90), false);
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

// 6. Admin correction after kickoff; pre-kickoff only when match is started/live
{
  const slots = [r16Slot("3", "team-ned"), qfSlot("2", "team-ned")];
  const preKickoff = resolveKnockoutPickCorrectionMatch({
    matchCode: "M90",
    slots,
    teams,
    tournamentMatches,
    fullRoundOf32Official: true,
    knockoutBracketPicksUnlocked: true,
    nowMs,
  });
  assert.ok(
    !("error" in preKickoff),
    "admin correction available before kickoff for out-of-slot picks",
  );

  const liveM90 = {
    ...m90,
    status: "live" as const,
  };
  const liveMatches = [m73, m75, liveM90];
  const resolved = resolveKnockoutPickCorrectionMatch({
    matchCode: "M90",
    slots: [r16Slot("3", "team-ned"), qfSlot("2", "team-ned")],
    teams,
    tournamentMatches: liveMatches,
    fullRoundOf32Official: true,
    knockoutBracketPicksUnlocked: true,
    nowMs: new Date("2026-07-04T20:00:00Z").getTime(),
  });
  assert.ok(!("error" in resolved), "admin can open correction after kickoff");
  const applied = applyKnockoutPickCorrection({
    slots,
    match: resolved.match,
    newTeamId: "team-mar",
    teams,
    tournamentMatches: liveMatches,
    fullRoundOf32Official: true,
  });
  assert.strictEqual(
    applied.slots.find((s) => s.predictionKind === "quarterfinalist" && s.slotKey === "2")
      ?.teamId,
    "team-mar",
    "admin can correct started R16 match winner",
  );
}

// 7. Save unlocked R16 pick alongside an intentional clear of another open row
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
      id: "p-r16-1",
      poolId: "pool",
      participantId: "par",
      predictionKind: "round_of_16",
      teamId: "team-can",
      tournamentStageId: stageR16,
      groupCode: null,
      slotKey: "1",
      bonusKey: null,
      valueText: null,
      createdAt: "",
      updatedAt: "",
    },
    {
      id: "p-r16-3",
      poolId: "pool",
      participantId: "par",
      predictionKind: "round_of_16",
      teamId: "team-mar",
      tournamentStageId: stageR16,
      groupCode: null,
      slotKey: "3",
      bonusKey: null,
      valueText: null,
      createdAt: "",
      updatedAt: "",
    },
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
    "locked original M90 pick is restored on save",
  );
}

// 8. Started-match swap still rejected with row label in error
{
  const liveMatches = [m73, m75, { ...m90, status: "live" as const }];
  const liveGradual = getGradualKnockoutSelectionState({
    matches: liveMatches,
    teams,
    nowMs: new Date("2026-07-04T20:00:00Z").getTime(),
    fullRoundOf32Official: true,
  });
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
    matches: liveMatches,
    gradual: liveGradual,
    fullRoundOf32Official: true,
    nowMs: new Date("2026-07-04T20:00:00Z").getTime(),
  });
  assert.ok(swapErr?.includes("M90"), swapErr ?? "expected M90 in started swap error");
  assert.ok(
    swapErr?.includes("kicked off"),
    swapErr ?? "expected kickoff lock reason",
  );
}

// Partial-complete participant: missing M94 stays pickable until R16 kickoff
{
  const teamUs: Team = {
    id: "team-us",
    name: "United States",
    countryCode: "USA",
    fifaCode: "USA",
    fifaRank: 15,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  };
  const teamBel: Team = {
    id: "team-bel",
    name: "Belgium",
    countryCode: "BEL",
    fifaCode: "BEL",
    fifaRank: 12,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  };
  const teamFra: Team = {
    id: "team-fra",
    name: "France",
    countryCode: "FRA",
    fifaCode: "FRA",
    fifaRank: 2,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  };
  const teamEng: Team = {
    id: "team-eng",
    name: "England",
    countryCode: "ENG",
    fifaCode: "ENG",
    fifaRank: 4,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  };
  const seemaTeams = [...teams, teamUs, teamBel, teamFra, teamEng];
  const m81 = match({
    match_code: "M81",
    stage_code: "round_of_32",
    kickoff_at: "2026-07-01T19:00:00Z",
    status: "finished",
    home_country_code: "USA",
    away_country_code: "BIH",
    home_team_name: "United States",
    away_team_name: "Bosnia and Herzegovina",
    winner_country_code: "USA",
  });
  const m82 = match({
    match_code: "M82",
    stage_code: "round_of_32",
    kickoff_at: "2026-07-01T22:00:00Z",
    status: "finished",
    home_country_code: "BEL",
    away_country_code: "SEN",
    home_team_name: "Belgium",
    away_team_name: "Senegal",
    winner_country_code: "BEL",
  });
  const seemaMatches = [
    m81,
    m82,
    match({
      match_code: "M94",
      stage_code: "round_of_16",
      kickoff_at: "2026-07-06T19:00:00Z",
      status: "scheduled",
      home_country_code: "USA",
      away_country_code: "BEL",
      home_team_name: "United States",
      away_team_name: "Belgium",
      winner_country_code: null,
    }),
  ];
  const seemaGradual = getGradualKnockoutSelectionState({
    matches: seemaMatches,
    teams: seemaTeams,
    nowMs,
    fullRoundOf32Official: true,
  });
  const partialCompleteSlots = [
    r16Slot("9", "team-us"),
    r16Slot("10", "team-bel"),
    qfSlot("1", "team-fra"),
    qfSlot("2", "team-mar"),
    qfSlot("5", "team-bra"),
    qfSlot("6", ""),
    qfSlot("7", "team-bra"),
    qfSlot("8", "team-can"),
    sfSlot("1", "team-fra"),
    sfSlot("3", "team-eng"),
    finSlot("1", "team-eng"),
  ];
  const m94Rows = buildKnockoutMatchPickRows({
    bracketKind: "round_of_16",
    slots: partialCompleteSlots,
    teams: seemaTeams,
    tournamentMatches: seemaMatches,
    gradual: seemaGradual,
    knockoutBracketPicksUnlocked: true,
    nowMs,
  });
  const m94 = m94Rows.find((r) => r.fifaMatchNo === 94)!;
  assert.strictEqual(m94.homeTeamId, "team-us");
  assert.strictEqual(m94.awayTeamId, "team-bel");
  assert.strictEqual(m94.winnerTeamId, "");
  assert.strictEqual(m94.lockReason, "pickable");
  assert.strictEqual(isKnockoutMatchDirectPickEligible(m94), true);
  assert.strictEqual(
    m94.display.statusLine,
    "Pick still open until this match kicks off.",
  );
  const missingPresentation = knockoutMatchSavedPickPresentation(m94, seemaTeams);
  assert.strictEqual(missingPresentation.savedPickStatus, "missing");
  assert.strictEqual(missingPresentation.savedPickSummaryLine, "No pick saved");
  assert.strictEqual(missingPresentation.lockStatusLine, null);
  assert.strictEqual(
    isKnockoutPickEditableForParticipant({
      predictionKind: "quarterfinalist",
      slotKey: "6",
      tournamentMatches: seemaMatches,
      gradual: seemaGradual,
      fullRoundOf32Official: true,
      savedTeamId: "",
      progressionRows: partialCompleteSlots,
      nowMs,
    }),
    true,
  );
  assert.strictEqual(
    isKnockoutPickFrozenForParticipant({
      predictionKind: "quarterfinalist",
      slotKey: "6",
      tournamentMatches: seemaMatches,
      gradual: seemaGradual,
      savedTeamId: "",
      progressionRows: partialCompleteSlots,
      nowMs,
    }),
    false,
  );
  const partialExisting: Prediction[] = [
    {
      id: "p-qf1",
      poolId: "pool",
      participantId: "par",
      predictionKind: "quarterfinalist",
      teamId: "team-fra",
      tournamentStageId: stageR16,
      groupCode: null,
      slotKey: "1",
      bonusKey: null,
      valueText: null,
      createdAt: "",
      updatedAt: "",
    },
    {
      id: "p-sf1",
      poolId: "pool",
      participantId: "par",
      predictionKind: "semifinalist",
      teamId: "team-fra",
      tournamentStageId: stageR16,
      groupCode: null,
      slotKey: "1",
      bonusKey: null,
      valueText: null,
      createdAt: "",
      updatedAt: "",
    },
    {
      id: "p-fin1",
      poolId: "pool",
      participantId: "par",
      predictionKind: "finalist",
      teamId: "team-eng",
      tournamentStageId: stageR16,
      groupCode: null,
      slotKey: "1",
      bonusKey: null,
      valueText: null,
      createdAt: "",
      updatedAt: "",
    },
  ];
  const backfillErr = validateKnockoutParticipantPickChanges({
    incoming: [
      {
        predictionKind: "quarterfinalist",
        tournamentStageId: stageR16,
        slotKey: "6",
        groupCode: null,
        bonusKey: null,
        teamId: "team-bel",
      },
    ],
    existing: partialExisting,
    matches: seemaMatches,
    gradual: seemaGradual,
    fullRoundOf32Official: true,
    nowMs,
  });
  assert.strictEqual(backfillErr, null, "server allows M94 backfill before kickoff");
  assert.strictEqual(
    partialExisting.find(
      (p) => p.predictionKind === "quarterfinalist" && p.slotKey === "6",
    )?.teamId,
    undefined,
  );
  const backfillApplied = applyGradualKnockoutPickSaveGuards({
    incoming: [
      {
        predictionKind: "quarterfinalist",
        tournamentStageId: stageR16,
        slotKey: "6",
        groupCode: null,
        bonusKey: null,
        teamId: "team-bel",
      },
    ],
    existing: partialExisting,
    teams: seemaTeams,
    matches: seemaMatches,
    fullRoundOf32Official: true,
    nowMs,
  });
  assert.strictEqual(backfillApplied.error, null, "server saves missing M94 pick");
  assert.strictEqual(
    backfillApplied.slots.find(
      (s) => s.predictionKind === "quarterfinalist" && s.slotKey === "6",
    )?.teamId,
    "team-bel",
  );

  // After kickoff, missing M94 is locked and admin can still backfill.
  const afterKickoffMs = Date.parse("2026-07-07T12:00:00Z");
  const adminResolved = resolveKnockoutPickCorrectionMatch({
    matchCode: "M94",
    slots: partialCompleteSlots,
    teams: seemaTeams,
    tournamentMatches: seemaMatches,
    fullRoundOf32Official: true,
    knockoutBracketPicksUnlocked: true,
    nowMs: afterKickoffMs,
  });
  assert.ok(!("error" in adminResolved), "admin can open correction on started missing M94");
  const adminApplied = applyKnockoutPickCorrection({
    slots: partialCompleteSlots,
    match: adminResolved.match,
    newTeamId: "team-us",
    teams: seemaTeams,
    tournamentMatches: seemaMatches,
    fullRoundOf32Official: true,
    nowMs: afterKickoffMs,
  });
  assert.strictEqual(
    adminApplied.slots.find(
      (s) => s.predictionKind === "quarterfinalist" && s.slotKey === "6",
    )?.teamId,
    "team-us",
    "admin can backfill started missing M94 row",
  );
}

// --- Admin R32 correction requirements (Seema review flow) ---

// 1. Participant cannot edit final R32 match
{
  const finishedM75 = match({
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
  const finishedGradual = getGradualKnockoutSelectionState({
    matches: [finishedM75],
    teams,
    nowMs,
    fullRoundOf32Official: true,
  });
  assert.strictEqual(
    isKnockoutPickEditableForParticipant({
      predictionKind: "round_of_16",
      slotKey: "3",
      tournamentMatches: [finishedM75],
      gradual: finishedGradual,
      fullRoundOf32Official: true,
      savedTeamId: "team-ned",
      nowMs,
    }),
    false,
    "finished R32 match is not editable by participant",
  );
}

// 2. Admin can correct missing final R32 pick
{
  const finishedM75 = match({
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
  const slots = [r16Slot("3", "")];
  const resolved = resolveKnockoutPickCorrectionMatch({
    matchCode: "M75",
    slots,
    teams,
    tournamentMatches: [finishedM75],
    fullRoundOf32Official: true,
    nowMs,
  });
  assert.ok(!("error" in resolved), "admin can open missing final R32 pick");
  assert.strictEqual(resolved.match.oldTeamId, "");
  const applied = applyKnockoutPickCorrection({
    slots,
    match: resolved.match,
    newTeamId: "team-mar",
    teams,
    tournamentMatches: [finishedM75],
    fullRoundOf32Official: true,
    nowMs,
  });
  assert.ok(applied.writePayloads.length >= 1);
  assert.strictEqual(
    applied.slots.find((s) => s.predictionKind === "round_of_16" && s.slotKey === "3")
      ?.teamId,
    "team-mar",
  );
  const gradual = getGradualKnockoutSelectionState({
    matches: [finishedM75],
    teams,
    nowMs,
    fullRoundOf32Official: true,
  });
  const uiRowsBefore = buildGradualR32MatchPickRows({
    slots,
    state: gradual,
    teams,
    fullRoundOf32Official: true,
  });
  const missingPresentation = gradualR32MatchSavedPickPresentation(
    uiRowsBefore.find((r) => r.fifaMatchNo === 75)!,
    teams,
  );
  assert.strictEqual(missingPresentation.savedPickStatus, "missing");
  assert.strictEqual(missingPresentation.savedPickSummaryLine, "No pick saved");
  const uiRows = buildGradualR32MatchPickRows({
    slots: applied.slots,
    state: gradual,
    teams,
    fullRoundOf32Official: true,
  });
  const m75Row = uiRows.find((r) => r.fifaMatchNo === 75)!;
  const presentation = gradualR32MatchSavedPickPresentation(m75Row, teams);
  assert.strictEqual(presentation.savedPickStatus, "valid");
  assert.strictEqual(presentation.savedPickSummaryLine, "Saved pick: Morocco");
}

// 3. Admin can correct stale/incorrect final R32 pick
{
  const finishedM75 = match({
    match_code: "M75",
    stage_code: "round_of_32",
    kickoff_at: "2026-06-29T19:00:00Z",
    status: "finished",
    home_country_code: "NED",
    away_country_code: "MAR",
    winner_country_code: "MAR",
  });
  const slots = [r16Slot("3", "team-ned")];
  const gradual = getGradualKnockoutSelectionState({
    matches: [finishedM75],
    teams,
    nowMs,
    fullRoundOf32Official: true,
  });
  const beforeRows = buildGradualR32MatchPickRows({
    slots,
    state: gradual,
    teams,
    fullRoundOf32Official: true,
  });
  const beforePresentation = gradualR32MatchSavedPickPresentation(
    beforeRows.find((r) => r.fifaMatchNo === 75)!,
    teams,
  );
  assert.strictEqual(beforePresentation.savedPickStatus, "stale");
  const resolved = resolveKnockoutPickCorrectionMatch({
    matchCode: "M75",
    slots,
    teams,
    tournamentMatches: [finishedM75],
    fullRoundOf32Official: true,
    nowMs,
  });
  assert.ok(!("error" in resolved));
  const applied = applyKnockoutPickCorrection({
    slots,
    match: resolved.match,
    newTeamId: "team-mar",
    teams,
    tournamentMatches: [finishedM75],
    fullRoundOf32Official: true,
    nowMs,
  });
  assert.strictEqual(
    applied.slots.find((s) => s.predictionKind === "round_of_16" && s.slotKey === "3")
      ?.teamId,
    "team-mar",
  );
}

// 4. Correction produces auditable before/after metadata
{
  const finishedM75 = match({
    match_code: "M75",
    stage_code: "round_of_32",
    kickoff_at: "2026-06-29T19:00:00Z",
    status: "finished",
    home_country_code: "NED",
    away_country_code: "MAR",
    winner_country_code: "MAR",
  });
  const before = [r16Slot("3", "team-ned")];
  const resolved = resolveKnockoutPickCorrectionMatch({
    matchCode: "M75",
    slots: before,
    teams,
    tournamentMatches: [finishedM75],
    fullRoundOf32Official: true,
    nowMs,
  });
  assert.ok(!("error" in resolved));
  const applied = applyKnockoutPickCorrection({
    slots: before,
    match: resolved.match,
    newTeamId: "team-mar",
    teams,
    tournamentMatches: [finishedM75],
    fullRoundOf32Official: true,
    nowMs,
  });
  const auditInput = {
    poolId: "pool",
    participantId: "par",
    matchCode: resolved.match.matchCode,
    oldTeamId: resolved.match.oldTeamId || null,
    newTeamId: "team-mar",
    oldTeamCountryCode: "NED",
    newTeamCountryCode: "MAR",
    reason: "Participant could not access account before kickoff; organizer-approved correction",
    clearedPickCount: applied.cleared.length,
  };
  assert.strictEqual(auditInput.matchCode, "M75");
  assert.strictEqual(auditInput.oldTeamId, "team-ned");
  assert.strictEqual(auditInput.newTeamId, "team-mar");
  assert.ok(auditInput.reason.length >= 8);
  assert.ok(applied.writePayloads.length >= 1);
}

// 5. Scoring updates from corrected R32 pick
{
  const poolId = "pool";
  const participantId = "par";
  const stageR16Id = "stage-r16";
  const finishedM75 = match({
    match_code: "M75",
    stage_code: "round_of_32",
    kickoff_at: "2026-06-29T19:00:00Z",
    status: "finished",
    home_country_code: "NED",
    away_country_code: "MAR",
    winner_country_code: "MAR",
  });
  const slotsBefore = [r16Slot("3", "")];
  const resolved = resolveKnockoutPickCorrectionMatch({
    matchCode: "M75",
    slots: slotsBefore,
    teams,
    tournamentMatches: [finishedM75],
    fullRoundOf32Official: true,
    nowMs,
  });
  assert.ok(!("error" in resolved));
  const applied = applyKnockoutPickCorrection({
    slots: slotsBefore,
    match: resolved.match,
    newTeamId: "team-mar",
    teams,
    tournamentMatches: [finishedM75],
    fullRoundOf32Official: true,
    nowMs,
  });
  const correctedRow = applied.slots.find(
    (s) => s.predictionKind === "round_of_16" && s.slotKey === "3",
  )!;
  const predictionsBefore: Prediction[] = [];
  const predictionsAfter: Prediction[] = [
    {
      id: "pred-r16-3",
      poolId,
      participantId,
      predictionKind: "round_of_16",
      teamId: correctedRow.teamId,
      tournamentStageId: stageR16Id,
      groupCode: null,
      slotKey: "3",
      bonusKey: null,
      valueText: null,
      createdAt: "",
      updatedAt: "",
    },
  ];
  const officialResults: Result[] = [
    {
      id: "res-mar-r16",
      tournamentStageId: stageR16Id,
      kind: "round_of_16",
      teamId: "team-mar",
      groupCode: null,
      slotKey: null,
      valueText: null,
      resolvedAt: "",
      createdAt: "",
    },
  ];
  const scoringRules = [
    {
      id: "rule-r16",
      poolId,
      predictionKind: "round_of_16" as const,
      bonusKey: null,
      points: 4,
      createdAt: "",
      updatedAt: "",
    },
  ];
  const beforeScore = computePoolScores({
    poolId,
    predictions: predictionsBefore,
    results: officialResults,
    scoringRules,
    groupStageScoring: null,
  });
  const afterScore = computePoolScores({
    poolId,
    predictions: predictionsAfter,
    results: officialResults,
    scoringRules,
    groupStageScoring: null,
  });
  assert.strictEqual(beforeScore.totalsByParticipantId[participantId] ?? 0, 0);
  assert.strictEqual(afterScore.totalsByParticipantId[participantId] ?? 0, 4);
}

// 6. Later-round admin correction works after kickoff, not before
{
  const slots = [r16Slot("3", "team-ned"), qfSlot("2", "team-ned")];
  const preKickoff = resolveKnockoutPickCorrectionMatch({
    matchCode: "M90",
    slots,
    teams,
    tournamentMatches,
    fullRoundOf32Official: true,
    knockoutBracketPicksUnlocked: true,
    nowMs,
  });
  assert.ok(!("error" in preKickoff), "pre-kickoff M90 out-of-slot pick uses admin correction");

  const liveMatches = [m73, m75, { ...m90, status: "live" as const }];
  const resolved = resolveKnockoutPickCorrectionMatch({
    matchCode: "M90",
    slots,
    teams,
    tournamentMatches: liveMatches,
    fullRoundOf32Official: true,
    knockoutBracketPicksUnlocked: true,
    nowMs: new Date("2026-07-04T20:00:00Z").getTime(),
  });
  assert.ok(!("error" in resolved), "later-round admin correction still resolves");
  const applied = applyKnockoutPickCorrection({
    slots,
    match: resolved.match,
    newTeamId: "team-mar",
    teams,
    tournamentMatches: liveMatches,
    fullRoundOf32Official: true,
  });
  assert.strictEqual(
    applied.slots.find((s) => s.predictionKind === "quarterfinalist" && s.slotKey === "2")
      ?.teamId,
    "team-mar",
    "later-round started row correction still applies",
  );
}

// --- M99 quarter-final: match-slot editability (Norway vs England) ---

{
  const teamEng: Team = {
    id: "team-eng",
    name: "England",
    countryCode: "ENG",
    fifaCode: "ENG",
    fifaRank: 4,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  };
  const m99Teams = [...teams, teamEng];
  const m99NowMs = new Date("2026-07-06T12:00:00Z").getTime();
  const m99Matches: TournamentMatchPublicRow[] = [
    match({
      match_code: "M91",
      stage_code: "round_of_16",
      kickoff_at: "2026-07-05T18:00:00Z",
      status: "finished",
      home_country_code: "NOR",
      away_country_code: "COL",
      home_team_name: "Norway",
      away_team_name: "Colombia",
      winner_country_code: "NOR",
    }),
    match({
      match_code: "M92",
      stage_code: "round_of_16",
      kickoff_at: "2026-07-05T20:00:00Z",
      status: "finished",
      home_country_code: "ESP",
      away_country_code: "ENG",
      home_team_name: "Spain",
      away_team_name: "England",
      winner_country_code: "ENG",
    }),
    match({
      match_code: "M99",
      stage_code: "quarterfinal",
      kickoff_at: "2026-07-11T18:00:00Z",
      status: "scheduled",
      home_country_code: "NOR",
      away_country_code: "ENG",
      home_team_name: "Norway",
      away_team_name: "England",
    }),
  ];
  const m99Gradual = getGradualKnockoutSelectionState({
    matches: m99Matches,
    teams: m99Teams,
    nowMs: m99NowMs,
    fullRoundOf32Official: true,
  });
  const m99RowInput = {
    bracketKind: "quarterfinalist" as const,
    teams: m99Teams,
    tournamentMatches: m99Matches,
    gradual: m99Gradual,
    knockoutBracketPicksUnlocked: true,
    nowMs: m99NowMs,
  };
  const savedNorwaySlots = [
    r16Slot("1", ""),
    sfSlot("3", "team-nor"),
  ];
  const missingM99Slots = [r16Slot("1", "")];

  // 1. Saved Norway on upcoming M99 — participant cannot change or clear before kickoff.
  {
    const rows = buildKnockoutMatchPickRows({
      ...m99RowInput,
      slots: savedNorwaySlots,
    });
    const m99 = rows.find((r) => r.fifaMatchNo === 99)!;
    assert.strictEqual(m99.homeTeamId, "team-nor");
    assert.strictEqual(m99.awayTeamId, "team-eng");
    assert.strictEqual(m99.winnerTeamId, "team-nor");
    assert.strictEqual(validatedKnockoutMatchWinner(m99), "team-nor");
    assert.strictEqual(isKnockoutMatchDirectPickEligible(m99), false);
    assert.strictEqual(
      isKnockoutPickEditableForParticipant({
        predictionKind: "semifinalist",
        slotKey: "3",
        tournamentMatches: m99Matches,
        gradual: m99Gradual,
        fullRoundOf32Official: true,
        savedTeamId: "team-nor",
        progressionRows: savedNorwaySlots,
        nowMs: m99NowMs,
      }),
      false,
      "saved M99 Norway pick is not editable before kickoff",
    );
    assert.strictEqual(
      isKnockoutPickFrozenForParticipant({
        predictionKind: "semifinalist",
        slotKey: "3",
        tournamentMatches: m99Matches,
        gradual: m99Gradual,
        savedTeamId: "team-nor",
        progressionRows: savedNorwaySlots,
        nowMs: m99NowMs,
      }),
      true,
      "saved M99 Norway pick is frozen for participant before kickoff",
    );
    const swapErr = validateKnockoutParticipantPickChanges({
      incoming: [
        {
          predictionKind: "semifinalist",
          tournamentStageId: stageR16,
          slotKey: "3",
          groupCode: null,
          bonusKey: null,
          teamId: "team-eng",
        },
      ],
      existing: [
        {
          id: "p-m99-nor",
          poolId: "pool",
          participantId: "par",
          predictionKind: "semifinalist",
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
      matches: m99Matches,
      gradual: m99Gradual,
      fullRoundOf32Official: true,
      teams: m99Teams,
      nowMs: m99NowMs,
    });
    assert.ok(
      swapErr?.includes("M99"),
      swapErr ?? "participant cannot swap saved M99 Norway to England",
    );
    const clearErr = validateKnockoutParticipantPickChanges({
      incoming: [
        {
          predictionKind: "semifinalist",
          tournamentStageId: stageR16,
          slotKey: "3",
          groupCode: null,
          bonusKey: null,
          teamId: "",
        },
      ],
      existing: [
        {
          id: "p-m99-nor",
          poolId: "pool",
          participantId: "par",
          predictionKind: "semifinalist",
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
      matches: m99Matches,
      gradual: m99Gradual,
      fullRoundOf32Official: true,
      teams: m99Teams,
      nowMs: m99NowMs,
    });
    assert.ok(clearErr, "participant cannot clear saved M99 Norway pick");
    const guardedClear = applyGradualKnockoutPickSaveGuards({
      incoming: [
        {
          predictionKind: "semifinalist",
          tournamentStageId: stageR16,
          slotKey: "3",
          groupCode: null,
          bonusKey: null,
          teamId: "",
        },
      ],
      existing: [
        {
          id: "p-m99-nor",
          poolId: "pool",
          participantId: "par",
          predictionKind: "semifinalist",
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
      teams: m99Teams,
      matches: m99Matches,
      fullRoundOf32Official: true,
      nowMs: m99NowMs,
    });
    assert.strictEqual(guardedClear.error, null);
    assert.strictEqual(
      guardedClear.slots.find(
        (s) => s.predictionKind === "semifinalist" && s.slotKey === "3",
      )?.teamId,
      "team-nor",
      "coercion restores locked M99 Norway pick on save",
    );
  }

  // 2. Missing M99 pick — participant may still pick before kickoff when deadline allows.
  {
    const rows = buildKnockoutMatchPickRows({
      ...m99RowInput,
      slots: missingM99Slots,
    });
    const m99 = rows.find((r) => r.fifaMatchNo === 99)!;
    assert.strictEqual(m99.winnerTeamId, "");
    assert.strictEqual(m99.lockReason, "pickable");
    assert.strictEqual(isKnockoutMatchDirectPickEligible(m99), true);
    assert.strictEqual(
      m99.display.statusLine,
      KNOCKOUT_R16_MISSING_PICK_OPEN_UNTIL_KICKOFF,
    );
    assert.strictEqual(
      isKnockoutPickEditableForParticipant({
        predictionKind: "semifinalist",
        slotKey: "3",
        tournamentMatches: m99Matches,
        gradual: m99Gradual,
        fullRoundOf32Official: true,
        savedTeamId: "",
        progressionRows: missingM99Slots,
        nowMs: m99NowMs,
      }),
      true,
      "missing M99 pick stays editable before kickoff",
    );
    assert.strictEqual(
      isKnockoutPickFrozenForParticipant({
        predictionKind: "semifinalist",
        slotKey: "3",
        tournamentMatches: m99Matches,
        gradual: m99Gradual,
        savedTeamId: "",
        progressionRows: missingM99Slots,
        nowMs: m99NowMs,
      }),
      false,
    );
    const firstPickOk = applyGradualKnockoutPickSaveGuards({
      incoming: [
        {
          predictionKind: "semifinalist",
          tournamentStageId: stageR16,
          slotKey: "3",
          groupCode: null,
          bonusKey: null,
          teamId: "team-nor",
        },
      ],
      existing: [],
      teams: m99Teams,
      matches: m99Matches,
      fullRoundOf32Official: true,
      nowMs: m99NowMs,
    });
    assert.strictEqual(firstPickOk.error, null, "server allows first M99 pick");
    assert.strictEqual(
      firstPickOk.slots.find(
        (s) => s.predictionKind === "semifinalist" && s.slotKey === "3",
      )?.teamId,
      "team-nor",
    );
    assert.strictEqual(
      validateKnockoutParticipantPickChanges({
        incoming: [
          {
            predictionKind: "semifinalist",
            tournamentStageId: stageR16,
            slotKey: "3",
            groupCode: null,
            bonusKey: null,
            teamId: "team-eng",
          },
        ],
        existing: [],
        matches: m99Matches,
        gradual: m99Gradual,
        fullRoundOf32Official: true,
        nowMs: m99NowMs,
      }),
      null,
      "server allows choosing either side on missing M99 pick",
    );
  }

  // 3. Admin correction: unavailable for live saved picks before kickoff; available
  // after kickoff and for out-of-slot (frozen) picks before kickoff.
  {
    const preKickoffLive = resolveKnockoutPickCorrectionMatch({
      matchCode: "M99",
      slots: savedNorwaySlots,
      teams: m99Teams,
      tournamentMatches: m99Matches,
      fullRoundOf32Official: true,
      knockoutBracketPicksUnlocked: true,
      nowMs: m99NowMs,
    });
    assert.ok(
      "error" in preKickoffLive,
      "admin correction UI stays closed for live saved M99 pick before kickoff",
    );
    assert.match(
      preKickoffLive.error,
      /has not kicked off yet/i,
    );

    const liveM99Matches = m99Matches.map((m) =>
      m.match_code === "M99"
        ? { ...m, status: "live" as const, kickoff_at: "2026-07-06T10:00:00Z" }
        : m,
    );
    const afterKickoffMs = new Date("2026-07-06T12:00:00Z").getTime();
    const postKickoff = resolveKnockoutPickCorrectionMatch({
      matchCode: "M99",
      slots: savedNorwaySlots,
      teams: m99Teams,
      tournamentMatches: liveM99Matches,
      fullRoundOf32Official: true,
      knockoutBracketPicksUnlocked: true,
      nowMs: afterKickoffMs,
    });
    assert.ok(!("error" in postKickoff), "admin can open M99 correction after kickoff");
    assert.strictEqual(postKickoff.match.oldTeamId, "team-nor");
    const postApplied = applyKnockoutPickCorrection({
      slots: savedNorwaySlots,
      match: postKickoff.match,
      newTeamId: "team-eng",
      teams: m99Teams,
      tournamentMatches: liveM99Matches,
      fullRoundOf32Official: true,
    });
    assert.strictEqual(
      postApplied.slots.find(
        (s) => s.predictionKind === "semifinalist" && s.slotKey === "3",
      )?.teamId,
      "team-eng",
      "admin can change saved M99 pick after kickoff",
    );

    const teamMex: Team = {
      id: "team-mex",
      name: "Mexico",
      countryCode: "MEX",
      fifaCode: "MEX",
      fifaRank: 14,
      fifaRankAsOf: null,
      createdAt: "",
      updatedAt: "",
    };
    const staleMexicoSlots = [r16Slot("1", ""), sfSlot("3", "team-mex")];
    const staleRows = buildKnockoutMatchPickRows({
      ...m99RowInput,
      slots: staleMexicoSlots,
      teams: [...m99Teams, teamMex],
    });
    const staleM99 = staleRows.find((r) => r.fifaMatchNo === 99)!;
    assert.strictEqual(staleM99.lockReason, "frozen");
    const preKickoffStale = resolveKnockoutPickCorrectionMatch({
      matchCode: "M99",
      slots: staleMexicoSlots,
      teams: [...m99Teams, teamMex],
      tournamentMatches: m99Matches,
      fullRoundOf32Official: true,
      knockoutBracketPicksUnlocked: true,
      nowMs: m99NowMs,
    });
    assert.ok(
      !("error" in preKickoffStale),
      "admin can open M99 correction for out-of-slot frozen pick before kickoff",
    );
    const staleApplied = applyKnockoutPickCorrection({
      slots: staleMexicoSlots,
      match: preKickoffStale.match,
      newTeamId: "team-nor",
      teams: [...m99Teams, teamMex],
      tournamentMatches: m99Matches,
      fullRoundOf32Official: true,
    });
    assert.strictEqual(
      staleApplied.slots.find(
        (s) => s.predictionKind === "semifinalist" && s.slotKey === "3",
      )?.teamId,
      "team-nor",
      "admin can correct out-of-slot M99 pick before kickoff",
    );
  }
}

console.log("knockoutPickEditability.selftest.ts: ok");
