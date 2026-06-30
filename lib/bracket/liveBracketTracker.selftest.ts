/**
 * Self-test: `npx tsx lib/bracket/liveBracketTracker.selftest.ts`
 */
import type { Team } from "../../src/types/domain";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import { buildLiveBracketTracker } from "./liveBracketTracker";
import { liveSideNeedsMutedFlag } from "./liveBracketSideStyles";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

function team(id: string, name: string, code: string): Team {
  return {
    id,
    name,
    countryCode: code,
    fifaCode: code,
    fifaRank: null,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  };
}

function slot(
  rowKey: string,
  kind: KnockoutPickSlotDraft["predictionKind"],
  teamId: string,
  slotKey: string | null = null,
): KnockoutPickSlotDraft {
  return {
    rowKey,
    sectionLabel: "",
    slotLabel: "",
    predictionKind: kind,
    tournamentStageId: "s",
    slotKey,
    groupCode: null,
    bonusKey: null,
    teamId,
  };
}

function knockoutMatch(
  overrides: Partial<TournamentMatchPublicRow> &
    Pick<TournamentMatchPublicRow, "match_id" | "match_code" | "stage_code">,
): TournamentMatchPublicRow {
  return {
    edition_id: "ed-1",
    edition_code: "wc2026",
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

void (async function main() {
  const teams = [
    team("team-bra", "Brazil", "BRA"),
    team("team-jpn", "Japan", "JPN"),
    team("team-fra", "France", "FRA"),
    team("team-ger", "Germany", "GER"),
  ];

  const r32Finished = knockoutMatch({
    match_id: "m73",
    match_code: "M73",
    stage_code: "round_of_32",
    stage_label: "Round of 32",
  });

  const slots: KnockoutPickSlotDraft[] = [
    slot("r32|1", "round_of_32", "team-bra", "1"),
    slot("r32|2", "round_of_32", "team-jpn", "2"),
    slot("r16|1", "round_of_16", "team-jpn", "1"),
  ];

  const tracker = buildLiveBracketTracker({
    slots,
    teams,
    knockoutBracketPicksUnlocked: true,
    tournamentMatches: [r32Finished],
  });

  const m73 = tracker.roundOf32[0]!;
  assert(m73.usesOfficialFixture, "M73 uses official fixture");
  assert(m73.home.teamId === "team-bra", "official home is Brazil");
  assert(m73.away.teamId === "team-jpn", "official away is Japan");
  assert(m73.home.tournamentOutcome === "advanced", "winner marked advanced");
  assert(m73.away.tournamentOutcome === "eliminated", "loser marked eliminated");
  assert(m73.away.participantPick === "your_pick_eliminated", "picked loser gets your pick eliminated");
  assert(m73.scoreLine === "2 – 1", "shows final score");
  assert(m73.status === "finished", "match status finished");

  assert(tracker.eliminatedTeamIds.has("team-jpn"), "Japan eliminated in tracker set");
  assert(liveSideNeedsMutedFlag(m73.away), "loser side muted");

  const aliveLater = tracker.roundOf16.find((m) =>
    [m.home.teamId, m.away.teamId].includes("team-bra"),
  );
  if (aliveLater?.home.teamId === "team-bra") {
    assert(!liveSideNeedsMutedFlag(aliveLater.home), "alive Brazil not muted in later round");
  }

  console.log("liveBracketTracker.selftest.ts: ok");
})();
