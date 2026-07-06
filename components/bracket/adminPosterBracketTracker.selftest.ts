/**
 * Self-test: `npx tsx components/bracket/adminPosterBracketTracker.selftest.ts`
 */
import { renderToStaticMarkup } from "react-dom/server";
import type { Team } from "../../src/types/domain";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import { buildLiveBracketTracker } from "../../lib/bracket/liveBracketTracker";
import { AdminPosterBracketTracker } from "./admin/AdminPosterBracketTracker";

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
    away_team_name: "Tunisia",
    away_country_code: "TUN",
    winner_team_name: "Brazil",
    winner_country_code: "BRA",
    ...overrides,
  };
}

void (async function main() {
  const teams = [
    team("team-bra", "Brazil", "BRA"),
    team("team-tun", "Tunisia", "TUN"),
    team("team-fra", "France", "FRA"),
  ];

  const r32Finished = knockoutMatch({
    match_id: "m73",
    match_code: "M73",
    stage_code: "round_of_32",
  });

  const slots: KnockoutPickSlotDraft[] = [
    slot("r32|1", "round_of_32", "team-bra", "1"),
    slot("r32|2", "round_of_32", "team-tun", "2"),
    slot("r16|1", "round_of_16", "team-bra", "1"),
    slot("champ", "champion", "team-bra"),
  ];

  const tracker = buildLiveBracketTracker({
    slots,
    teams,
    knockoutBracketPicksUnlocked: false,
    tournamentMatches: [r32Finished],
  });

  const teamById = new Map(teams.map((t) => [t.id, t]));
  const html = renderToStaticMarkup(
    AdminPosterBracketTracker({ tracker, teamById, matchEditHref: null }),
  );

  assert(html.includes("Participant pick summary"), "renders summary panel");
  assert(html.includes("Champion pick: Brazil"), "renders champion summary line");
  assert(html.includes("Pick correct:"), "renders match outcome footer");
  assert(html.includes("Picked + advanced"), "uses combined badge");
  assert(!html.includes("Not your pick"), "omits noisy not-your-pick badge");
  assert(!html.includes(">Pick<"), "omits separate Pick badge without advanced combo");
  assert(html.includes("Champion"), "renders champion aside card");
  assert(!html.includes("BracketConnector"), "no connector tree in admin layout");

  console.log("adminPosterBracketTracker.selftest.ts: ok");
})();
