/**
 * Self-test: `npx tsx lib/picks/inferAutoCarriedMatchSlotPick.selftest.ts`
 */
import assert from "node:assert";
import type { Team } from "../../src/types/domain";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import { getGradualKnockoutSelectionState } from "./gradualKnockoutUnlock";
import {
  buildKnockoutMatchPickRows,
  isKnockoutMatchDirectPickEligible,
  knockoutMatchSavedPickPresentation,
  validatedKnockoutMatchWinner,
} from "./knockoutMatchPickRows";
import { inferAutoCarriedMatchSlotPick } from "./inferAutoCarriedMatchSlotPick";

const teams: Team[] = [
  {
    id: "team-fra",
    name: "France",
    countryCode: "FRA",
    fifaCode: "FRA",
    fifaRank: 3,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "team-mar",
    name: "Morocco",
    countryCode: "MAR",
    fifaCode: "MAR",
    fifaRank: 13,
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
    id: "team-nor",
    name: "Norway",
    countryCode: "NOR",
    fifaCode: "NOR",
    fifaRank: 45,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "team-eng",
    name: "England",
    countryCode: "ENG",
    fifaCode: "ENG",
    fifaRank: 4,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "team-mex",
    name: "Mexico",
    countryCode: "MEX",
    fifaCode: "MEX",
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
    fifaRank: 5,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  },
];

function r16Slot(slotKey: string, teamId = ""): KnockoutPickSlotDraft {
  return {
    rowKey: `round_of_16|${slotKey}`,
    sectionLabel: "Round of 16",
    slotLabel: `Round of 16 · pick ${slotKey}`,
    predictionKind: "round_of_16",
    tournamentStageId: "r16",
    slotKey,
    groupCode: null,
    bonusKey: null,
    teamId,
  };
}

function qfSlot(slotKey: string, teamId = ""): KnockoutPickSlotDraft {
  return {
    rowKey: `quarterfinalist|${slotKey}`,
    sectionLabel: "Quarter-finals",
    slotLabel: `Quarter-finals · pick ${slotKey}`,
    predictionKind: "quarterfinalist",
    tournamentStageId: "qf",
    slotKey,
    groupCode: null,
    bonusKey: null,
    teamId,
  };
}

function sfSlot(
  slotKey: string,
  teamId = "",
  pickStatus?: "out",
): KnockoutPickSlotDraft {
  return {
    rowKey: `semifinalist|${slotKey}`,
    sectionLabel: "Semi-finals",
    slotLabel: `Semi-finals · pick ${slotKey}`,
    predictionKind: "semifinalist",
    tournamentStageId: "sf",
    slotKey,
    groupCode: null,
    bonusKey: null,
    teamId,
    pickStatus: pickStatus ?? null,
    invalidReason: pickStatus === "out" ? "not_in_official_matchup" : null,
  };
}

const baseR16 = Array.from({ length: 16 }, (_, i) =>
  r16Slot(String(i + 1), ""),
);

const m97FeederMatches: TournamentMatchPublicRow[] = [
  {
    match_id: "m89",
    edition_id: "ed",
    edition_code: "2026",
    match_code: "M89",
    stage_code: "round_of_16",
    stage_label: "Round of 16",
    stage_sort_order: 3,
    group_code: null,
    round_index: 0,
    kickoff_at: "2026-07-05T18:00:00Z",
    status: "finished",
    home_goals: 2,
    away_goals: 1,
    home_penalties: null,
    away_penalties: null,
    home_team_name: "France",
    home_country_code: "FRA",
    away_team_name: "Germany",
    away_country_code: "GER",
    winner_team_name: "France",
    winner_country_code: "FRA",
  },
  {
    match_id: "m90",
    edition_id: "ed",
    edition_code: "2026",
    match_code: "M90",
    stage_code: "round_of_16",
    stage_label: "Round of 16",
    stage_sort_order: 3,
    group_code: null,
    round_index: 0,
    kickoff_at: "2026-07-05T20:00:00Z",
    status: "finished",
    home_goals: 1,
    away_goals: 0,
    home_penalties: null,
    away_penalties: null,
    home_team_name: "Canada",
    home_country_code: "CAN",
    away_team_name: "Netherlands",
    away_country_code: "NED",
    winner_team_name: "Morocco",
    winner_country_code: "MAR",
  },
  {
    match_id: "m97",
    edition_id: "ed",
    edition_code: "2026",
    match_code: "M97",
    stage_code: "quarterfinal",
    stage_label: "Quarter-finals",
    stage_sort_order: 4,
    group_code: null,
    round_index: 0,
    kickoff_at: "2026-07-11T18:00:00Z",
    status: "scheduled",
    home_goals: null,
    away_goals: null,
    home_penalties: null,
    away_penalties: null,
    home_team_name: "France",
    home_country_code: "FRA",
    away_team_name: "Morocco",
    away_country_code: "MAR",
    winner_team_name: null,
    winner_country_code: null,
  },
];

const m99FeederMatches: TournamentMatchPublicRow[] = [
  {
    match_id: "m91",
    edition_id: "ed",
    edition_code: "2026",
    match_code: "M91",
    stage_code: "round_of_16",
    stage_label: "Round of 16",
    stage_sort_order: 3,
    group_code: null,
    round_index: 0,
    kickoff_at: "2026-07-05T18:00:00Z",
    status: "finished",
    home_goals: 2,
    away_goals: 1,
    home_penalties: null,
    away_penalties: null,
    home_team_name: "Norway",
    home_country_code: "NOR",
    away_team_name: "Colombia",
    away_country_code: "COL",
    winner_team_name: "Norway",
    winner_country_code: "NOR",
  },
  {
    match_id: "m92",
    edition_id: "ed",
    edition_code: "2026",
    match_code: "M92",
    stage_code: "round_of_16",
    stage_label: "Round of 16",
    stage_sort_order: 3,
    group_code: null,
    round_index: 0,
    kickoff_at: "2026-07-05T20:00:00Z",
    status: "finished",
    home_goals: 1,
    away_goals: 0,
    home_penalties: null,
    away_penalties: null,
    home_team_name: "Spain",
    home_country_code: "ESP",
    away_team_name: "England",
    away_country_code: "ENG",
    winner_team_name: "England",
    winner_country_code: "ENG",
  },
  {
    match_id: "m99",
    edition_id: "ed",
    edition_code: "2026",
    match_code: "M99",
    stage_code: "quarterfinal",
    stage_label: "Quarter-finals",
    stage_sort_order: 4,
    group_code: null,
    round_index: 0,
    kickoff_at: "2026-07-11T18:00:00Z",
    status: "scheduled",
    home_goals: null,
    away_goals: null,
    home_penalties: null,
    away_penalties: null,
    home_team_name: "Norway",
    home_country_code: "NOR",
    away_team_name: "England",
    away_country_code: "ENG",
    winner_team_name: null,
    winner_country_code: null,
  },
];

function gradualFor(matches: TournamentMatchPublicRow[], nowMs: number) {
  return getGradualKnockoutSelectionState({
    matches,
    teams,
    nowMs,
    fullRoundOf32Official: true,
  });
}

// A. M97 France vs Morocco — infer France from upstream only.
{
  const nowMs = new Date("2026-07-06T12:00:00Z").getTime();
  const slots = [
    ...baseR16,
    qfSlot("1", "team-fra"),
    qfSlot("2", "team-can"),
  ];
  const input = {
    bracketKind: "quarterfinalist" as const,
    slots,
    teams,
    tournamentMatches: m97FeederMatches,
    knockoutBracketPicksUnlocked: true,
    nowMs,
  };
  const m97 = buildKnockoutMatchPickRows(input).find((r) => r.fifaMatchNo === 97)!;
  assert.strictEqual(m97.lockReason, "frozen");
  assert.strictEqual(m97.winnerTeamId, "");
  assert.strictEqual(m97.autoCarriedPick?.status, "inferred_live");
  assert.strictEqual(m97.autoCarriedPick?.inferredTeamId, "team-fra");
  assert.strictEqual(m97.autoCarriedPick?.source, "persisted_upstream_pick");
  assert.strictEqual(m97.autoCarriedPick?.sourcePredictionKind, "quarterfinalist");
  assert.strictEqual(m97.autoCarriedPick?.sourceSlotKey, "1");
  assert.strictEqual(validatedKnockoutMatchWinner(m97), "team-fra");
  assert.strictEqual(isKnockoutMatchDirectPickEligible(m97), false);
  const presentation = knockoutMatchSavedPickPresentation(m97, teams);
  assert.strictEqual(presentation.savedPickStatus, "auto_carried");
  assert.match(presentation.savedPickSummaryLine, /Auto-carried pick: France/i);
  assert.match(
    presentation.savedPickWarning!,
    /only surviving original pick in this match/i,
  );
}

// B. M99 Norway vs England — infer Norway when upstream is Norway + Mexico.
{
  const nowMs = new Date("2026-07-06T12:00:00Z").getTime();
  const slots = [
    ...baseR16,
    qfSlot("3", "team-nor"),
    qfSlot("4", "team-mex"),
  ];
  const input = {
    bracketKind: "quarterfinalist" as const,
    slots,
    teams,
    tournamentMatches: m99FeederMatches,
    knockoutBracketPicksUnlocked: true,
    nowMs,
  };
  const m99 = buildKnockoutMatchPickRows(input).find((r) => r.fifaMatchNo === 99)!;
  assert.strictEqual(m99.lockReason, "frozen");
  assert.strictEqual(validatedKnockoutMatchWinner(m99), "team-nor");
  assert.strictEqual(isKnockoutMatchDirectPickEligible(m99), false);
  const presentation = knockoutMatchSavedPickPresentation(m99, teams);
  assert.strictEqual(presentation.savedPickStatus, "auto_carried");
}

// C. M99 Norway + England upstream — not inferable.
{
  const nowMs = new Date("2026-07-06T12:00:00Z").getTime();
  const gradual = gradualFor(m99FeederMatches, nowMs);
  const inferred = inferAutoCarriedMatchSlotPick({
    resultKind: "semifinalist",
    slotKey: "3",
    savedTeamId: "",
    homeTeamId: "team-nor",
    awayTeamId: "team-eng",
    slots: [...baseR16, qfSlot("3", "team-nor"), qfSlot("4", "team-eng")],
    teams,
    tournamentMatches: m99FeederMatches,
    gradual,
    nowMs,
  });
  assert.strictEqual(inferred.status, "not_inferable");
}

// D. M99 Mexico + Brazil upstream — not inferable.
{
  const nowMs = new Date("2026-07-06T12:00:00Z").getTime();
  const gradual = gradualFor(m99FeederMatches, nowMs);
  const inferred = inferAutoCarriedMatchSlotPick({
    resultKind: "semifinalist",
    slotKey: "3",
    savedTeamId: "",
    homeTeamId: "team-nor",
    awayTeamId: "team-eng",
    slots: [...baseR16, qfSlot("3", "team-mex"), qfSlot("4", "team-bra")],
    teams,
    tournamentMatches: m99FeederMatches,
    gradual,
    nowMs,
  });
  assert.strictEqual(inferred.status, "not_inferable");
}

// E. Saved England wins over inference.
{
  const nowMs = new Date("2026-07-06T12:00:00Z").getTime();
  const slots = [
    ...baseR16,
    qfSlot("3", "team-nor"),
    qfSlot("4", "team-mex"),
    sfSlot("3", "team-eng"),
  ];
  const m99 = buildKnockoutMatchPickRows({
    bracketKind: "quarterfinalist",
    slots,
    teams,
    tournamentMatches: m99FeederMatches,
    knockoutBracketPicksUnlocked: true,
    nowMs,
  }).find((r) => r.fifaMatchNo === 99)!;
  assert.strictEqual(m99.winnerTeamId, "team-eng");
  assert.strictEqual(m99.autoCarriedPick ?? null, null);
  assert.strictEqual(validatedKnockoutMatchWinner(m99), "team-eng");
  assert.strictEqual(
    knockoutMatchSavedPickPresentation(m99, teams).savedPickStatus,
    "valid",
  );
}

// F. Saved Mexico (out) wins over inference.
{
  const nowMs = new Date("2026-07-06T12:00:00Z").getTime();
  const slots = [
    ...baseR16,
    qfSlot("3", "team-nor"),
    qfSlot("4", "team-mex"),
    sfSlot("3", "team-mex", "out"),
  ];
  const m99 = buildKnockoutMatchPickRows({
    bracketKind: "quarterfinalist",
    slots,
    teams,
    tournamentMatches: m99FeederMatches,
    knockoutBracketPicksUnlocked: true,
    nowMs,
  }).find((r) => r.fifaMatchNo === 99)!;
  assert.strictEqual(m99.winnerTeamId, "team-mex");
  assert.strictEqual(m99.autoCarriedPick ?? null, null);
  assert.strictEqual(validatedKnockoutMatchWinner(m99), null);
  assert.strictEqual(
    knockoutMatchSavedPickPresentation(m99, teams).savedPickStatus,
    "stale",
  );
}

console.log("inferAutoCarriedMatchSlotPick.selftest.ts: ok");
