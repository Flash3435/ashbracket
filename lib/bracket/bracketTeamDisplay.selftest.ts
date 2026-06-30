/**
 * Self-test: `npx tsx lib/bracket/bracketTeamDisplay.selftest.ts`
 */
import type { Team } from "../../src/types/domain";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import {
  bracketTeamDisplayStatus,
  buildEliminatedTeamIdSet,
  resolveBracketSideVisualState,
} from "./bracketTeamDisplay";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

function team(id: string, code: string): Team {
  return {
    id,
    name: code,
    countryCode: code,
    fifaCode: code,
    fifaRank: null,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  };
}

function knockoutMatch(
  overrides: Partial<TournamentMatchPublicRow> &
    Pick<TournamentMatchPublicRow, "match_id" | "match_code">,
): TournamentMatchPublicRow {
  return {
    edition_id: "ed-1",
    edition_code: "wc2026",
    stage_code: "round_of_16",
    stage_label: "Round of 16",
    stage_sort_order: 40,
    group_code: null,
    round_index: 1,
    kickoff_at: "2026-07-01T00:00:00Z",
    status: "finished",
    home_goals: 2,
    away_goals: 0,
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

void (async function main() {
  const teams = [team("team-bra", "BRA"), team("team-jpn", "JPN"), team("team-fra", "FRA")];

  const finished = knockoutMatch({ match_id: "r16-1", match_code: "R16-1" });
  const eliminated = buildEliminatedTeamIdSet([finished], teams);

  assert(eliminated.has("team-jpn"), "R16 loser is eliminated");
  assert(!eliminated.has("team-bra"), "R16 winner stays alive");
  assert(bracketTeamDisplayStatus("team-jpn", eliminated) === "eliminated", "status eliminated");
  assert(bracketTeamDisplayStatus("team-bra", eliminated) === "alive", "status alive");
  assert(bracketTeamDisplayStatus(null, eliminated) === "empty", "empty when no team");

  // Loser stays eliminated when referenced in a later bracket path (e.g. QF pick).
  assert(
    bracketTeamDisplayStatus("team-jpn", eliminated) === "eliminated",
    "eliminated team stays muted in later rounds",
  );

  const aliveSide = resolveBracketSideVisualState({
    teamId: "team-bra",
    eliminatedTeamIds: eliminated,
    participantPathWinnerTeamId: "team-bra",
  });
  assert(aliveSide.status === "alive", "alive team not muted");
  assert(aliveSide.emphasizePathWinner, "alive path winner gets emphasis");

  const deadSide = resolveBracketSideVisualState({
    teamId: "team-jpn",
    eliminatedTeamIds: eliminated,
    participantPathWinnerTeamId: "team-jpn",
  });
  assert(deadSide.status === "eliminated", "eliminated pick is muted");
  assert(!deadSide.emphasizePathWinner, "eliminated team does not get path-winner emphasis");

  const noMatches = buildEliminatedTeamIdSet(null, teams);
  assert(noMatches.size === 0, "no schedule => no eliminations");

  console.log("bracketTeamDisplay.selftest.ts: ok");
})();
