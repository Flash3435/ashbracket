import assert from "node:assert";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { Team } from "../../src/types/domain";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import {
  buildMatchBracketGuidance,
  eliminatedTeamIdsFromMatches,
  pickSideHighlightForMatch,
} from "./bracketMatchImpact";
import { buildRecapItemForMatch, recapBadgeKind } from "../dashboard/buildParticipantLatestRecap";
import { matchdayBracketWantsLabel } from "../account/buildMatchday";
import { buildCheerSuggestionForMatch } from "../account/buildWhoToCheerFor";

const teams = [
  {
    id: "team-bra",
    name: "Brazil",
    countryCode: "BRA",
    fifaCode: "BRA",
    fifaRank: 1,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "team-jpn",
    name: "Japan",
    countryCode: "JPN",
    fifaCode: "JPN",
    fifaRank: 2,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "team-ned",
    name: "Netherlands",
    countryCode: "NED",
    fifaCode: "NED",
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
    fifaRank: 4,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  },
] satisfies Team[];

function slot(
  overrides: Partial<KnockoutPickSlotDraft> &
    Pick<KnockoutPickSlotDraft, "predictionKind" | "teamId">,
): KnockoutPickSlotDraft {
  return {
    rowKey: overrides.rowKey ?? `${overrides.predictionKind}-${overrides.teamId}`,
    sectionLabel: "Knockout",
    slotLabel: "Pick",
    tournamentStageId: "stage-ko",
    slotKey: null,
    groupCode: null,
    bonusKey: null,
    ...overrides,
  };
}

function knockoutMatch(
  overrides: Partial<TournamentMatchPublicRow> &
    Pick<TournamentMatchPublicRow, "match_id" | "match_code">,
): TournamentMatchPublicRow {
  return {
    edition_id: "ed-1",
    edition_code: "wc2026",
    stage_code: "round_of_32",
    stage_label: "Round of 32",
    stage_sort_order: 30,
    group_code: null,
    round_index: 1,
    kickoff_at: "2026-06-29T20:00:00Z",
    status: "finished",
    home_goals: 2,
    away_goals: 1,
    home_penalties: null,
    away_penalties: null,
    home_team_name: "Brazil",
    home_country_code: "BRA",
    away_team_name: "Japan",
    away_country_code: "JPN",
    winner_team_name: "Brazil",
    winner_country_code: "BRA",
    ...overrides,
  };
}

// Brazil beats Japan; user picked Brazil champion + Japan R32
{
  const m = knockoutMatch({ match_id: "r32-bra-jpn", match_code: "R32-1" });
  const slots = [
    slot({ predictionKind: "champion", teamId: "team-bra", rowKey: "champ" }),
    slot({ predictionKind: "round_of_32", teamId: "team-jpn", rowKey: "r32-jpn" }),
  ];
  const guidance = buildMatchBracketGuidance(m, slots, teams, [m]);
  assert.equal(guidance.impact, "mixed");
  assert.equal(guidance.homeHighlight, "in_bracket");
  assert.equal(guidance.awayHighlight, "eliminated");
  assert.ok(guidance.explanation.includes("Brazil advancing keeps your champion pick alive"));
  assert.ok(guidance.explanation.includes("Japan is now eliminated"));
  assert.equal(guidance.wantsLabel.primary, "Mixed impact");

  const recap = buildRecapItemForMatch(m, slots, teams, undefined, [m]);
  assert.equal(recap.impact, "mixed");
  assert.equal(recapBadgeKind(recap), "mixed");
  assert.ok(!recap.explanation.includes("No strong angle"));

  const homeHighlight = pickSideHighlightForMatch(m, "home", slots, teams, [m]);
  const awayHighlight = pickSideHighlightForMatch(m, "away", slots, teams, [m]);
  assert.equal(homeHighlight, "in_bracket");
  assert.equal(awayHighlight, "eliminated");
}

// Brazil beats Japan; user only picked Japan to advance
{
  const m = knockoutMatch({ match_id: "r32-hurt", match_code: "R32-2" });
  const slots = [slot({ predictionKind: "round_of_32", teamId: "team-jpn", rowKey: "r32-jpn" })];
  const guidance = buildMatchBracketGuidance(m, slots, teams, [m]);
  assert.equal(guidance.impact, "hurt");
  assert.equal(guidance.wantsLabel.primary, "Japan");
  assert.ok(guidance.explanation.includes("Japan was eliminated, so this hurts your bracket"));

  const recap = buildRecapItemForMatch(m, slots, teams, undefined, [m]);
  assert.equal(recap.impact, "hurt");
  assert.equal(recapBadgeKind(recap), "hurt");
  assert.notEqual(recapBadgeKind(recap), "mixed");
}

// Upcoming Netherlands vs Morocco — mixed with named tradeoff
{
  const m = knockoutMatch({
    match_id: "r16-ned-mar",
    match_code: "R16-1",
    stage_code: "round_of_16",
    stage_label: "Round of 16",
    status: "scheduled",
    home_goals: null,
    away_goals: null,
    home_team_name: "Netherlands",
    home_country_code: "NED",
    away_team_name: "Morocco",
    away_country_code: "MAR",
    winner_team_name: null,
    winner_country_code: null,
  });
  const slots = [
    slot({ predictionKind: "round_of_16", teamId: "team-ned", rowKey: "r16-ned" }),
    slot({ predictionKind: "round_of_32", teamId: "team-mar", rowKey: "r32-mar" }),
  ];
  const guidance = buildMatchBracketGuidance(m, slots, teams, [m]);
  assert.equal(guidance.impact, "mixed");
  assert.equal(guidance.wantsLabel.primary, "Mixed impact");
  assert.ok(guidance.explanation.includes("Netherlands helps your Round of 16 pick"));
  assert.ok(guidance.explanation.includes("Morocco helps your Round of 32 pick"));

  const suggestion = buildCheerSuggestionForMatch(m, slots, teams, undefined, [m]);
  assert.equal(matchdayBracketWantsLabel(suggestion).primary, "Mixed impact");
  assert.ok(suggestion.reason.includes("Netherlands helps"));
}

// Neither team in meaningful picks
{
  const m = knockoutMatch({
    match_id: "r32-neutral",
    match_code: "R32-3",
    home_team_name: "France",
    home_country_code: "FRA",
    away_team_name: "Germany",
    away_country_code: "GER",
    winner_country_code: "FRA",
    winner_team_name: "France",
  });
  const slots = [slot({ predictionKind: "champion", teamId: "team-bra", rowKey: "champ" })];
  const guidance = buildMatchBracketGuidance(m, slots, teams, [m]);
  assert.equal(guidance.impact, "neutral");
  assert.equal(guidance.wantsLabel.primary, "No strong angle");
  assert.ok(guidance.explanation.includes("No strong angle for your bracket"));

  const recap = buildRecapItemForMatch(m, slots, teams, undefined, [m]);
  assert.equal(recapBadgeKind(recap), "no_strong_angle");
  assert.equal(recap.impact, "neutral");
}

// Badge and copy cannot contradict
{
  const m = knockoutMatch({ match_id: "r32-mixed", match_code: "R32-4" });
  const slots = [
    slot({ predictionKind: "champion", teamId: "team-bra", rowKey: "champ" }),
    slot({ predictionKind: "round_of_32", teamId: "team-jpn", rowKey: "r32-jpn" }),
  ];
  const recap = buildRecapItemForMatch(m, slots, teams, undefined, [m]);
  const badge = recapBadgeKind(recap);
  assert.equal(badge, "mixed");
  assert.ok(!recap.explanation.toLowerCase().includes("no strong angle"));
}

// Elimination tracking across schedule
{
  const finished = knockoutMatch({ match_id: "done", match_code: "R32-DONE" });
  const eliminated = eliminatedTeamIdsFromMatches([finished], teams);
  assert.ok(eliminated.has("team-jpn"));
  assert.ok(!eliminated.has("team-bra"));
}

console.log("bracketMatchImpact.selftest.ts: ok");
