/**
 * Self-test: `npx tsx components/bracket/posterBracketTracker.selftest.ts`
 */
import { renderToStaticMarkup } from "react-dom/server";
import type { Team } from "../../src/types/domain";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import { buildLiveBracketTracker } from "../../lib/bracket/liveBracketTracker";
import { splitR32Indices } from "../../lib/bracket/posterBracketLayout";
import { PosterBracketTracker } from "./PosterBracketTracker";

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
    slot("r32|2", "round_of_32", "team-tun", "2"),
    slot("r16|1", "round_of_16", "team-bra", "1"),
    slot("sf|1", "semifinalist", "team-bra", "1"),
    slot("sf|2", "semifinalist", "team-bra", "2"),
    slot("f|1", "finalist", "team-bra", "1"),
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
    PosterBracketTracker({ tracker, teamById, matchEditHref: null }),
  );

  assert(!html.includes("Follow your saved picks against live results."), "omits duplicate center subtitle");
  assert(html.includes("M73"), "renders match number");
  assert(html.includes("2 – 1"), "renders final score");
  assert(html.includes("Final"), "renders status label");
  assert(html.includes("Brazil"), "renders team name");
  assert(html.includes("Pick"), "renders compact pick badge");
  assert(html.includes("Advanced"), "renders advanced badge");
  assert(html.includes("Eliminated"), "renders eliminated badge");

  const { left, right } = splitR32Indices();
  for (const idx of left) {
    const m = tracker.roundOf32[idx]!;
    assert(html.includes(`M${m.fifaMatchNo}`), `left R32 M${m.fifaMatchNo} appears in markup`);
  }
  for (const idx of right) {
    const m = tracker.roundOf32[idx]!;
    assert(html.includes(`M${m.fifaMatchNo}`), `right R32 M${m.fifaMatchNo} appears in markup`);
  }

  assert(
    tracker.roundOf16.some(
      (m) => html.includes("Brazil") && (m.home.teamId === "team-bra" || m.away.teamId === "team-bra"),
    ),
    "future-round participant picks still render",
  );

  assert(html.includes("Champion"), "champion card renders when pick exists");

  // Eliminated pick styling
  const loserSlots: KnockoutPickSlotDraft[] = [
    slot("r32|1", "round_of_32", "team-bra", "1"),
    slot("r32|2", "round_of_32", "team-tun", "2"),
    slot("r16|1", "round_of_16", "team-tun", "1"),
  ];
  const loserTracker = buildLiveBracketTracker({
    slots: loserSlots,
    teams,
    knockoutBracketPicksUnlocked: false,
    tournamentMatches: [r32Finished],
  });
  const loserHtml = renderToStaticMarkup(
    PosterBracketTracker({ tracker: loserTracker, teamById, matchEditHref: null }),
  );
  assert(loserHtml.includes("Pick out"), "eliminated participant pick shows Pick out");
  assert(loserHtml.includes("Tunisia"), "eliminated pick team still visible");

  console.log("posterBracketTracker.selftest.ts: ok");
})();
