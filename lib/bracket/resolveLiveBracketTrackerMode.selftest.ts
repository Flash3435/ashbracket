/**
 * Self-test: `npx tsx lib/bracket/resolveLiveBracketTrackerMode.selftest.ts`
 */
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import {
  hasKnockoutScheduleActivity,
  shouldUseLiveBracketTracker,
} from "./resolveLiveBracketTrackerMode";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const slot: KnockoutPickSlotDraft = {
  rowKey: "qf|1",
  sectionLabel: "",
  slotLabel: "",
  predictionKind: "quarterfinalist",
  tournamentStageId: "s",
  slotKey: "1",
  groupCode: null,
  bonusKey: null,
  teamId: "team-bra",
};

const r32Fixture: TournamentMatchPublicRow = {
  match_id: "m73",
  edition_id: "ed",
  edition_code: "wc2026",
  match_code: "M73",
  stage_code: "round_of_32",
  stage_label: "Round of 32",
  stage_sort_order: 30,
  group_code: null,
  round_index: 1,
  kickoff_at: "2026-07-01T00:00:00Z",
  status: "scheduled",
  home_goals: null,
  away_goals: null,
  home_penalties: null,
  away_penalties: null,
  home_team_name: "Brazil",
  home_country_code: "BRA",
  away_team_name: "Tunisia",
  away_country_code: "TUN",
  winner_team_name: null,
  winner_country_code: null,
};

void (async function main() {
  assert(!shouldUseLiveBracketTracker({
    knockoutBracketPicksUnlocked: false,
    tournamentMatches: [],
    slots: [],
  }), "empty state stays preview");

  assert(
    shouldUseLiveBracketTracker({
      knockoutBracketPicksUnlocked: false,
      tournamentMatches: [r32Fixture],
      slots: [],
    }),
    "R32 fixtures enable live tracker even when organizer unlock is false",
  );

  assert(
    shouldUseLiveBracketTracker({
      knockoutBracketPicksUnlocked: false,
      tournamentMatches: [],
      slots: [slot],
    }),
    "saved later-round picks enable live tracker",
  );

  assert(hasKnockoutScheduleActivity([r32Fixture]), "fixture counts as knockout activity");

  console.log("resolveLiveBracketTrackerMode.selftest.ts: ok");
})();
