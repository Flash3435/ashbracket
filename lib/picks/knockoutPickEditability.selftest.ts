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
  readConfirmedR32MatchWinner,
  readOfficialR32MatchResultWinner,
  readParticipantR32MatchWinnerPick,
} from "./knockoutMatchPickRows";
import {
  isKnockoutMatchLockedForParticipant,
  isKnockoutPickEditableForParticipant,
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
];

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

console.log("knockoutPickEditability.selftest.ts: ok");
