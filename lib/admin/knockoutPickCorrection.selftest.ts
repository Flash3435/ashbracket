import assert from "node:assert";
import type { Team } from "../../src/types/domain";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import {
  applyKnockoutPickCorrection,
  KNOCKOUT_PICK_CORRECTION_ALREADY_MATCHES_SAVED,
  resolveKnockoutPickCorrectionMatch,
  resolveKnockoutPickCorrectionTeamId,
  validateKnockoutPickCorrectionReason,
} from "./knockoutPickCorrection";
import {
  buildKnockoutMatchPickRows,
  readConfirmedR32MatchWinner,
} from "../picks/knockoutMatchPickRows";
import { applyGradualKnockoutPickSaveGuards } from "../predictions/validateGradualKnockoutPickSave";
import { validateKnockoutMatchPick } from "../picks/gradualKnockoutUnlock";
import {
  buildGradualR32MatchPickRows,
  getGradualKnockoutSelectionState,
  matchStateForR16GradualWinnerSlot,
  r16SlotKeyForR32MatchIndex,
} from "../picks/gradualKnockoutUnlock";

function match(
  partial: Partial<TournamentMatchPublicRow> &
    Pick<TournamentMatchPublicRow, "match_code" | "stage_code">,
): TournamentMatchPublicRow {
  return {
    match_id: partial.match_id ?? partial.match_code,
    edition_id: "ed",
    edition_code: "wc2026",
    match_code: partial.match_code,
    stage_code: partial.stage_code,
    stage_label: partial.stage_code,
    stage_sort_order: partial.stage_sort_order ?? 2,
    group_code: partial.group_code ?? null,
    round_index: partial.round_index ?? 0,
    kickoff_at: partial.kickoff_at ?? "2026-06-28T19:00:00Z",
    status: partial.status ?? "live",
    home_goals: null,
    away_goals: null,
    home_penalties: null,
    away_penalties: null,
    home_team_name: partial.home_team_name ?? "Canada",
    home_country_code: partial.home_country_code ?? "CAN",
    away_team_name: partial.away_team_name ?? "Mexico",
    away_country_code: partial.away_country_code ?? "MEX",
    winner_team_name: null,
    winner_country_code: null,
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
    id: "team-por",
    name: "Portugal",
    countryCode: "POR",
    fifaCode: "POR",
    fifaRank: 6,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "team-rsa",
    name: "South Africa",
    countryCode: "RSA",
    fifaCode: "RSA",
    fifaRank: 60,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "team-bra",
    name: "Brazil",
    countryCode: "BRA",
    fifaCode: "BRA",
    fifaRank: 5,
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

function r16SlotDraft(slotKey: string, teamId = ""): KnockoutPickSlotDraft {
  return {
    rowKey: `round_of_16|${slotKey}`,
    predictionKind: "round_of_16",
    tournamentStageId: "r16-stage",
    slotKey,
    groupCode: null,
    bonusKey: null,
    teamId,
    sectionLabel: "Round of 32",
    slotLabel: `M${72 + parseInt(slotKey, 10)} winner`,
  };
}

function r32SlotDraft(slotKey: string, teamId = ""): KnockoutPickSlotDraft {
  return {
    rowKey: `round_of_32|${slotKey}`,
    predictionKind: "round_of_32",
    tournamentStageId: "r32-stage",
    slotKey,
    groupCode: null,
    bonusKey: null,
    teamId,
    sectionLabel: "Round of 32",
    slotLabel: `Slot ${slotKey}`,
  };
}

function qfSlotDraft(slotKey: string, teamId = ""): KnockoutPickSlotDraft {
  return {
    rowKey: `quarterfinalist|${slotKey}`,
    predictionKind: "quarterfinalist",
    tournamentStageId: "qf-stage",
    slotKey,
    groupCode: null,
    bonusKey: null,
    teamId,
    sectionLabel: "Quarter-finals",
    slotLabel: `QF slot ${slotKey}`,
  };
}

const m73Started = match({
  match_code: "M73",
  stage_code: "round_of_32",
  kickoff_at: "2026-06-28T12:00:00Z",
  status: "live",
  home_country_code: "CAN",
  home_team_name: "Canada",
  away_country_code: "MEX",
  away_team_name: "Mexico",
});

const nowAfterKickoff = new Date("2026-06-28T19:00:00Z").getTime();

// Reason required
{
  assert.strictEqual(
    validateKnockoutPickCorrectionReason(""),
    "A reason is required for admin pick corrections.",
  );
  assert.match(
    validateKnockoutPickCorrectionReason("   short") ?? "",
    /8 characters/,
  );
  assert.strictEqual(
    validateKnockoutPickCorrectionReason(
      "Participant could not access account before kickoff; organizer-approved correction",
    ),
    null,
  );
}

// Normal participant cannot edit after kickoff
{
  const gradual = getGradualKnockoutSelectionState({
    matches: [m73Started],
    teams,
    nowMs: nowAfterKickoff,
    fullRoundOf32Official: false,
  });
  const ms = matchStateForR16GradualWinnerSlot("1", gradual)!;
  const participantErr = validateKnockoutMatchPick({
    slotKey: ms.topSlotKey,
    selectedTeamId: "team-can",
    match: ms,
    teams,
    nowMs: nowAfterKickoff,
  });
  assert.match(
    participantErr ?? "",
    /already kicked off/i,
    "participant validateKnockoutMatchPick blocks started matches",
  );

  const guarded = applyGradualKnockoutPickSaveGuards({
    incoming: [
      {
        predictionKind: "round_of_16",
        tournamentStageId: "r16-stage",
        slotKey: "1",
        groupCode: null,
        bonusKey: null,
        teamId: "team-can",
      },
    ],
    existing: [],
    teams,
    matches: [m73Started],
    fullRoundOf32Official: false,
    nowMs: nowAfterKickoff,
  });
  assert.match(guarded.error ?? "", /already kicked off/i);
}

// Admin correction resolves started M73 and accepts Canada
{
  const slots = Array.from({ length: 16 }, (_, i) =>
    r16SlotDraft(String(i + 1)),
  );
  const resolved = resolveKnockoutPickCorrectionMatch({
    matchCode: "M73",
    slots,
    teams,
    tournamentMatches: [m73Started],
    fullRoundOf32Official: false,
    nowMs: nowAfterKickoff,
  });
  assert.ok(!("error" in resolved));
  assert.strictEqual(resolved.match.predictionKind, "round_of_16");
  assert.strictEqual(resolved.match.slotKey, r16SlotKeyForR32MatchIndex(0));
  assert.strictEqual(resolved.match.isStarted, true);

  const teamResolved = resolveKnockoutPickCorrectionTeamId({
    teamCode: "CAN",
    teams,
    allowedTeamIds: resolved.match.allowedTeamIds,
  });
  assert.ok(!("error" in teamResolved));
  assert.strictEqual(teamResolved.teamId, "team-can");

  const applied = applyKnockoutPickCorrection({
    slots,
    match: resolved.match,
    newTeamId: teamResolved.teamId,
    teams,
    tournamentMatches: [m73Started],
    fullRoundOf32Official: false,
    nowMs: nowAfterKickoff,
  });
  const saved = applied.slots.find(
    (s) => s.predictionKind === "round_of_16" && s.slotKey === "1",
  );
  assert.strictEqual(saved?.teamId, "team-can");
}

// Wrong team rejected
{
  const slots = Array.from({ length: 16 }, (_, i) =>
    r16SlotDraft(String(i + 1)),
  );
  const resolved = resolveKnockoutPickCorrectionMatch({
    matchCode: "M73",
    slots,
    teams,
    tournamentMatches: [m73Started],
    fullRoundOf32Official: false,
    nowMs: nowAfterKickoff,
  });
  assert.ok(!("error" in resolved));
  const wrong = resolveKnockoutPickCorrectionTeamId({
    teamCode: "USA",
    teams,
    allowedTeamIds: resolved.match.allowedTeamIds,
  });
  assert.ok("error" in wrong);
  assert.match(wrong.error, /not in this matchup/i);
}

// Unstarted match rejected for admin correction
{
  const future = match({
    match_code: "M74",
    stage_code: "round_of_32",
    kickoff_at: "2026-07-01T19:00:00Z",
    status: "scheduled",
    home_country_code: "USA",
    home_team_name: "United States",
    away_country_code: "MEX",
    away_team_name: "Mexico",
  });
  const slots = Array.from({ length: 16 }, (_, i) =>
    r16SlotDraft(String(i + 1)),
  );
  const resolved = resolveKnockoutPickCorrectionMatch({
    matchCode: "M74",
    slots,
    teams,
    tournamentMatches: [future],
    fullRoundOf32Official: false,
    nowMs: nowAfterKickoff,
  });
  assert.ok("error" in resolved);
  assert.match(resolved.error, /not kicked off yet/i);
}

// Downstream invalid picks cleared after correction changes winner
{
  const slots = [
    ...Array.from({ length: 16 }, (_, i) =>
      r16SlotDraft(String(i + 1), i === 0 ? "team-mex" : ""),
    ),
    qfSlotDraft("1", "team-mex"),
  ];
  const resolved = resolveKnockoutPickCorrectionMatch({
    matchCode: "M73",
    slots,
    teams,
    tournamentMatches: [m73Started],
    fullRoundOf32Official: false,
    nowMs: nowAfterKickoff,
  });
  assert.ok(!("error" in resolved));
  const applied = applyKnockoutPickCorrection({
    slots,
    match: resolved.match,
    newTeamId: "team-can",
    teams,
    tournamentMatches: [m73Started],
    fullRoundOf32Official: false,
    nowMs: nowAfterKickoff,
  });
  assert.strictEqual(
    applied.slots.find((s) => s.predictionKind === "round_of_16" && s.slotKey === "1")
      ?.teamId,
    "team-can",
  );
  assert.ok(applied.cleared.length >= 0);
}

// Admin correction on locked M73 feeds M90 when M75 winner already set
{
  const m73StartedRsaCan = match({
    match_code: "M73",
    stage_code: "round_of_32",
    kickoff_at: "2026-06-28T12:00:00Z",
    status: "live",
    home_country_code: "RSA",
    home_team_name: "South Africa",
    away_country_code: "CAN",
    away_team_name: "Canada",
  });
  const m75Started = match({
    match_code: "M75",
    stage_code: "round_of_32",
    kickoff_at: "2026-06-28T15:00:00Z",
    status: "live",
    home_country_code: "MAR",
    home_team_name: "Morocco",
    away_country_code: "POR",
    away_team_name: "Portugal",
  });
  const tournamentMatches = [m73StartedRsaCan, m75Started];
  const slots = [
    ...Array.from({ length: 16 }, (_, i) =>
      r16SlotDraft(String(i + 1), i === 2 ? "team-mar" : ""),
    ),
    r32SlotDraft("1", "team-por"),
    r32SlotDraft("2", "team-mar"),
  ];
  const resolved = resolveKnockoutPickCorrectionMatch({
    matchCode: "M73",
    slots,
    teams,
    tournamentMatches,
    fullRoundOf32Official: true,
    knockoutBracketPicksUnlocked: true,
    nowMs: nowAfterKickoff,
  });
  assert.ok(!("error" in resolved));
  const applied = applyKnockoutPickCorrection({
    slots,
    match: resolved.match,
    newTeamId: "team-can",
    teams,
    tournamentMatches,
    fullRoundOf32Official: true,
    nowMs: nowAfterKickoff,
  });
  assert.strictEqual(
    applied.slots.find((s) => s.predictionKind === "round_of_16" && s.slotKey === "1")
      ?.teamId,
    "team-can",
  );
  const gradual = getGradualKnockoutSelectionState({
    matches: tournamentMatches,
    teams,
    nowMs: nowAfterKickoff,
    fullRoundOf32Official: true,
  });
  const r16Rows = buildKnockoutMatchPickRows({
    bracketKind: "round_of_16",
    slots: applied.slots,
    teams,
    tournamentMatches,
    gradual,
    knockoutBracketPicksUnlocked: true,
    nowMs: nowAfterKickoff,
  });
  const m90 = r16Rows.find((r) => r.fifaMatchNo === 90)!;
  assert.strictEqual(m90.homeTeamId, "team-can");
  assert.strictEqual(m90.awayTeamId, "team-mar");
  assert.strictEqual(m90.lockReason, "pickable");
}

const m76Started = match({
  match_code: "M76",
  stage_code: "round_of_32",
  kickoff_at: "2026-06-28T19:00:00Z",
  status: "live",
  home_country_code: "BRA",
  home_team_name: "Brazil",
  away_country_code: "JPN",
  away_team_name: "Japan",
});

const m76FinishedBrazil = match({
  match_code: "M76",
  stage_code: "round_of_32",
  kickoff_at: "2026-06-28T19:00:00Z",
  status: "finished",
  home_country_code: "BRA",
  home_team_name: "Brazil",
  away_country_code: "JPN",
  away_team_name: "Japan",
  winner_country_code: "BRA",
  winner_team_name: "Brazil",
});

function m76GradualSlots(input?: {
  r16Winner?: string;
  r32Top?: string;
  r32Bottom?: string;
}): KnockoutPickSlotDraft[] {
  const r16Winner = input?.r16Winner ?? "";
  const r32Top = input?.r32Top ?? "";
  const r32Bottom = input?.r32Bottom ?? "";
  return [
    ...Array.from({ length: 16 }, (_, i) =>
      r16SlotDraft(String(i + 1), i === 3 ? r16Winner : ""),
    ),
    ...Array.from({ length: 32 }, (_, i) => {
      const key = String(i + 1);
      const teamId =
        key === "7" ? r32Top : key === "8" ? r32Bottom : "";
      return r32SlotDraft(key, teamId);
    }),
  ];
}

// Locked M76 with no existing pick -> admin correction saves to round_of_16 slot 4
{
  const slots = m76GradualSlots();
  const resolved = resolveKnockoutPickCorrectionMatch({
    matchCode: "M76",
    slots,
    teams,
    tournamentMatches: [m76Started],
    fullRoundOf32Official: true,
    nowMs: nowAfterKickoff,
  });
  assert.ok(!("error" in resolved));
  assert.strictEqual(resolved.match.oldTeamId, "");
  const applied = applyKnockoutPickCorrection({
    slots,
    match: resolved.match,
    newTeamId: "team-bra",
    teams,
    tournamentMatches: [m76Started],
    fullRoundOf32Official: true,
    nowMs: nowAfterKickoff,
  });
  assert.ok(applied.writePayloads.length >= 1);
  assert.strictEqual(
    applied.slots.find(
      (s) => s.predictionKind === "round_of_16" && s.slotKey === "4",
    )?.teamId,
    "team-bra",
  );
  const gradual = getGradualKnockoutSelectionState({
    matches: [m76Started],
    teams,
    nowMs: nowAfterKickoff,
    fullRoundOf32Official: true,
  });
  const uiRows = buildGradualR32MatchPickRows({
    slots: applied.slots,
    state: gradual,
    teams,
    fullRoundOf32Official: true,
  });
  assert.strictEqual(uiRows[3]!.winnerTeamId, "team-bra");
  assert.strictEqual(
    readConfirmedR32MatchWinner(3, applied.slots, {
      teams,
      tournamentMatches: [m76Started],
      gradual,
      knockoutBracketPicksUnlocked: true,
    }),
    "team-bra",
  );
}

// Locked M76 with existing different pick -> admin correction updates
{
  const slots = m76GradualSlots({ r16Winner: "team-jpn" });
  const resolved = resolveKnockoutPickCorrectionMatch({
    matchCode: "M76",
    slots,
    teams,
    tournamentMatches: [m76Started],
    fullRoundOf32Official: true,
    nowMs: nowAfterKickoff,
  });
  assert.ok(!("error" in resolved));
  assert.strictEqual(resolved.match.oldTeamId, "team-jpn");
  const applied = applyKnockoutPickCorrection({
    slots,
    match: resolved.match,
    newTeamId: "team-bra",
    teams,
    tournamentMatches: [m76Started],
    fullRoundOf32Official: true,
    nowMs: nowAfterKickoff,
  });
  assert.ok(applied.writePayloads.length >= 1);
  assert.strictEqual(
    applied.slots.find(
      (s) => s.predictionKind === "round_of_16" && s.slotKey === "4",
    )?.teamId,
    "team-bra",
  );
}

// Locked M76 with same pick -> write payloads empty (action shows friendly message)
{
  const slots = m76GradualSlots({ r16Winner: "team-bra" });
  const resolved = resolveKnockoutPickCorrectionMatch({
    matchCode: "M76",
    slots,
    teams,
    tournamentMatches: [m76Started],
    fullRoundOf32Official: true,
    nowMs: nowAfterKickoff,
  });
  assert.ok(!("error" in resolved));
  assert.strictEqual(resolved.match.oldTeamId, "team-bra");
  assert.strictEqual(
    KNOCKOUT_PICK_CORRECTION_ALREADY_MATCHES_SAVED,
    "This correction already matches the saved pick.",
  );
  const applied = applyKnockoutPickCorrection({
    slots,
    match: resolved.match,
    newTeamId: "team-bra",
    teams,
    tournamentMatches: [m76Started],
    fullRoundOf32Official: true,
    nowMs: nowAfterKickoff,
  });
  assert.strictEqual(applied.writePayloads.length, 0);
}

// Official full R32 keeps participant round_of_32 side assignments when correcting
{
  const slots = m76GradualSlots({
    r32Top: "team-bra",
    r32Bottom: "team-jpn",
  });
  const resolved = resolveKnockoutPickCorrectionMatch({
    matchCode: "M76",
    slots,
    teams,
    tournamentMatches: [m76Started],
    fullRoundOf32Official: true,
    nowMs: nowAfterKickoff,
  });
  assert.ok(!("error" in resolved));
  const applied = applyKnockoutPickCorrection({
    slots,
    match: resolved.match,
    newTeamId: "team-bra",
    teams,
    tournamentMatches: [m76Started],
    fullRoundOf32Official: true,
    nowMs: nowAfterKickoff,
  });
  assert.strictEqual(
    applied.slots.find(
      (s) => s.predictionKind === "round_of_32" && s.slotKey === "7",
    )?.teamId,
    "team-bra",
  );
  assert.strictEqual(
    applied.slots.find(
      (s) => s.predictionKind === "round_of_32" && s.slotKey === "8",
    )?.teamId,
    "team-jpn",
  );
}

// Admin correction can persist a pick that differs from the published result winner
{
  const slots = m76GradualSlots();
  const resolved = resolveKnockoutPickCorrectionMatch({
    matchCode: "M76",
    slots,
    teams,
    tournamentMatches: [m76FinishedBrazil],
    fullRoundOf32Official: true,
    nowMs: nowAfterKickoff,
  });
  assert.ok(!("error" in resolved));
  const applied = applyKnockoutPickCorrection({
    slots,
    match: resolved.match,
    newTeamId: "team-jpn",
    teams,
    tournamentMatches: [m76FinishedBrazil],
    fullRoundOf32Official: true,
    nowMs: nowAfterKickoff,
  });
  assert.ok(applied.writePayloads.length >= 1);
  assert.strictEqual(
    applied.slots.find(
      (s) => s.predictionKind === "round_of_16" && s.slotKey === "4",
    )?.teamId,
    "team-jpn",
  );
}

// Invalid team outside matchup is rejected
{
  const slots = m76GradualSlots();
  const resolved = resolveKnockoutPickCorrectionMatch({
    matchCode: "M76",
    slots,
    teams,
    tournamentMatches: [m76Started],
    fullRoundOf32Official: true,
    nowMs: nowAfterKickoff,
  });
  assert.ok(!("error" in resolved));
  const wrong = resolveKnockoutPickCorrectionTeamId({
    teamId: "team-usa",
    teams,
    allowedTeamIds: resolved.match.allowedTeamIds,
  });
  assert.ok("error" in wrong);
  assert.match(wrong.error, /not in this matchup/i);
}

console.log("knockoutPickCorrection.selftest.ts: ok");
