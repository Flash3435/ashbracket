import assert from "node:assert/strict";
import type { Team } from "../../src/types/domain";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import {
  evaluateMatchSlotSavedPick,
  evaluateStrictBracketPathForMatch,
  isStrictBracketPathBlockedForParticipant,
  matchSlotSavedPickStatusCopy,
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

function sfSlot(slotKey: string, teamId = ""): KnockoutPickSlotDraft {
  return {
    rowKey: `semifinalist|${slotKey}`,
    sectionLabel: "Quarter-finals",
    slotLabel: slotKey,
    predictionKind: "semifinalist",
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

// M99: Norway saved winner, official Norway vs England — live even with wrong upstream R16 path.
{
  const evaluation = evaluateMatchSlotSavedPick({
    wizardKind: "quarterfinalist",
    matchIndex: 2,
    slots: [sfSlot("3", "team-nor")],
    teams,
    tournamentMatches,
    gradual,
    knockoutBracketPicksUnlocked: true,
  });
  assert.strictEqual(evaluation?.status, "live");
  assert.strictEqual(evaluation?.savedTeamInOfficialMatchup, true);
  assert.match(
    matchSlotSavedPickStatusCopy(evaluation!, teams, "quarterfinalist")!,
    /still alive because Norway is in this match/i,
  );
  assert.strictEqual(
    isStrictBracketPathBlockedForParticipant({
      wizardKind: "quarterfinalist",
      matchIndex: 2,
      slots: [sfSlot("3", "team-nor")],
      teams,
      tournamentMatches,
      gradual,
      knockoutBracketPicksUnlocked: true,
    }),
    true,
  );
}

// M99: Mexico saved — out because Mexico is not in official M99 matchup.
{
  const evaluation = evaluateMatchSlotSavedPick({
    wizardKind: "quarterfinalist",
    matchIndex: 2,
    slots: [sfSlot("3", "team-mex")],
    teams,
    tournamentMatches,
    gradual,
    knockoutBracketPicksUnlocked: true,
  });
  assert.strictEqual(evaluation?.status, "out");
  assert.strictEqual(evaluation?.savedTeamInOfficialMatchup, false);
  assert.match(
    matchSlotSavedPickStatusCopy(evaluation!, teams, "quarterfinalist")!,
    /Mexico did not reach this match/i,
  );
  const legacy = evaluateStrictBracketPathForMatch({
    wizardKind: "quarterfinalist",
    matchIndex: 2,
    slots: [sfSlot("3", "team-mex")],
    teams,
    tournamentMatches,
    gradual,
    knockoutBracketPicksUnlocked: true,
  });
  assert.strictEqual(legacy?.hasStalePath, true);
  assert.strictEqual(
    isStrictBracketPathBlockedForParticipant({
      wizardKind: "quarterfinalist",
      matchIndex: 2,
      slots: [sfSlot("3", "team-mex")],
      teams,
      tournamentMatches,
      gradual,
      knockoutBracketPicksUnlocked: true,
    }),
    true,
  );
}

// M99: missing semifinalist pick — blocked once official matchup is set.
{
  const evaluation = evaluateMatchSlotSavedPick({
    wizardKind: "quarterfinalist",
    matchIndex: 2,
    slots: [],
    teams,
    tournamentMatches,
    gradual,
    knockoutBracketPicksUnlocked: true,
  });
  assert.strictEqual(evaluation?.status, "missing");
}

console.log("knockoutStrictBracketPath.selftest.ts: ok");
