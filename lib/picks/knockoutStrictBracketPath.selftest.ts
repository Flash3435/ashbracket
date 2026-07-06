import assert from "node:assert/strict";
import type { Team } from "../../src/types/domain";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import {
  evaluateStrictBracketPathForMatch,
  isStrictBracketPathBlockedForParticipant,
  strictBracketPathBlockedCopy,
} from "./knockoutStrictBracketPath";

const teams: Team[] = [
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
];

function qfSlot(slotKey: string, teamId = ""): KnockoutPickSlotDraft {
  return {
    rowKey: `quarterfinalist|${slotKey}`,
    sectionLabel: "Quarter-finals",
    slotLabel: slotKey,
    predictionKind: "quarterfinalist",
    tournamentStageId: "qf",
    slotKey,
    groupCode: null,
    bonusKey: null,
    teamId,
  };
}

const tournamentMatches: TournamentMatchPublicRow[] = [
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
];

const gradual = {
  r32MatchCount: 16,
  confirmedCount: 16,
  pickableCount: 0,
  pendingCount: 0,
  allR32Confirmed: true,
  anyR32Started: true,
  earliestPickableKickoffIso: null,
  matchStates: [],
};

// Valid upstream path for M99 (QF match index 2).
{
  const evaluation = evaluateStrictBracketPathForMatch({
    wizardKind: "quarterfinalist",
    matchIndex: 2,
    slots: [qfSlot("3", "team-nor"), qfSlot("4", "team-eng")],
    teams,
    tournamentMatches,
    gradual,
    knockoutBracketPicksUnlocked: true,
  });
  assert.ok(evaluation?.allFeedersValid);
  assert.strictEqual(evaluation?.hasStalePath, false);
  assert.strictEqual(
    isStrictBracketPathBlockedForParticipant({
      wizardKind: "quarterfinalist",
      matchIndex: 2,
      slots: [qfSlot("3", "team-nor"), qfSlot("4", "team-eng")],
      teams,
      tournamentMatches,
      gradual,
      knockoutBracketPicksUnlocked: true,
    }),
    false,
  );
}

// Stale Mexico upstream blocks M99.
{
  const slots = [qfSlot("3", "team-nor"), qfSlot("4", "team-mex")];
  const evaluation = evaluateStrictBracketPathForMatch({
    wizardKind: "quarterfinalist",
    matchIndex: 2,
    slots,
    teams,
    tournamentMatches,
    gradual,
    knockoutBracketPicksUnlocked: true,
  });
  assert.strictEqual(evaluation?.hasStalePath, true);
  assert.match(
    strictBracketPathBlockedCopy(evaluation!, teams, "quarterfinalist"),
    /Mexico did not advance/i,
  );
  assert.strictEqual(
    isStrictBracketPathBlockedForParticipant({
      wizardKind: "quarterfinalist",
      matchIndex: 2,
      slots,
      teams,
      tournamentMatches,
      gradual,
      knockoutBracketPicksUnlocked: true,
    }),
    true,
  );
}

console.log("knockoutStrictBracketPath.selftest.ts: ok");
