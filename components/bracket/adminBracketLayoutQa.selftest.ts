/**
 * Pre-production QA for admin-only bracket layout.
 * Run: `npx tsx components/bracket/adminBracketLayoutQa.selftest.ts`
 */
import { renderToStaticMarkup } from "react-dom/server";
import type { Team } from "../../src/types/domain";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import {
  buildAdminParticipantPicksSummary,
  resolveAdminMatchOutcomeSummary,
  resolveAdminTeamStatusBadge,
} from "../../lib/bracket/adminBracketDisplay";
import { buildLiveBracketTracker } from "../../lib/bracket/liveBracketTracker";
import { ADMIN_BRACKET_CARD_WIDTH_PX } from "./admin/adminBracketLayout";
import { AdminPosterBracketTracker } from "./admin/AdminPosterBracketTracker";
import { ParticipantBracketView } from "./ParticipantBracketView";
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
  extras: Partial<KnockoutPickSlotDraft> = {},
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
    ...extras,
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
    kickoff_at: "2026-07-10T20:00:00Z",
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

const LONG_NAME_TEAMS = [
  team("team-usa", "United States", "USA"),
  team("team-sui", "Switzerland", "SUI"),
  team("team-arg", "Argentina", "ARG"),
  team("team-ned", "Netherlands", "NED"),
  team("team-bra", "Brazil", "BRA"),
  team("team-tun", "Tunisia", "TUN"),
  team("team-fra", "France", "FRA"),
  team("team-ger", "Germany", "GER"),
  team("team-esp", "Spain", "ESP"),
  team("team-eng", "England", "ENG"),
  team("team-rsa", "South Africa", "RSA"),
  team("team-can", "Canada", "CAN"),
  team("team-mar", "Morocco", "MAR"),
];

function assertOneBadgePerTeamRow(html: string): void {
  const cards = html.split("rounded-lg border border-ash-border/55").slice(1);
  for (const card of cards) {
    if (!card.includes("min-h-[34px]") && !card.includes("min-h-[32px]")) continue;
    const badges = (
      card.match(/text-\[9px\] font-semibold uppercase tracking-wide ring-1/g) ?? []
    ).length;
    const rows = (card.match(/min-h-\[3[24]px\]/g) ?? []).length;
    assert(badges <= rows, `match card has at most one badge per team row (${badges} badges, ${rows} rows)`);
  }
}

function assertAdminLayout(html: string): void {
  assert(html.includes("Participant pick summary"), "summary panel present");
  assert(html.includes('aria-label="Admin participant bracket"'), "admin bracket region");
  assert(html.includes("overflow-x-auto"), "horizontal scroll container");
  assert(html.includes("Champion"), "champion column present");
  assert(html.includes("sticky top-20"), "champion sticky near final");
  assert(html.includes("border-l border-ash-border/45"), "champion separated from final column");
  assert(!html.includes("BracketConnector"), "no connector tree");
  assert(!html.includes("grid-cols-[auto_280px_auto]"), "no poster center grid");
  assertOneBadgePerTeamRow(html);
}

function assertParticipantLayout(html: string): void {
  assert(html.includes("grid-cols-[auto_280px_auto]"), "poster center grid present");
  assert(!html.includes("Participant pick summary"), "no admin summary panel");
}

void (async function main() {
  const r32Finished = knockoutMatch({
    match_id: "m73",
    match_code: "M73",
    stage_code: "round_of_32",
    home_team_name: "United States",
    home_country_code: "USA",
    away_team_name: "Switzerland",
    away_country_code: "SUI",
    winner_team_name: "United States",
    winner_country_code: "USA",
  });

  // 1. Fully complete bracket
  const completeSlots: KnockoutPickSlotDraft[] = [
    slot("r32|1", "round_of_32", "team-usa", "1"),
    slot("r16|1", "round_of_16", "team-usa", "1"),
    slot("champ", "champion", "team-usa"),
  ];
  const completeTracker = buildLiveBracketTracker({
    slots: completeSlots,
    teams: LONG_NAME_TEAMS,
    knockoutBracketPicksUnlocked: true,
    tournamentMatches: [r32Finished],
  });
  const teamById = new Map(LONG_NAME_TEAMS.map((t) => [t.id, t]));
  const completeHtml = renderToStaticMarkup(
    AdminPosterBracketTracker({ tracker: completeTracker, teamById, matchEditHref: null }),
  );
  assertAdminLayout(completeHtml);
  assert(completeHtml.includes("United States"), "long team name renders");
  assert(completeHtml.includes("Champion pick: United States"), "complete champion line");

  const completeSummary = buildAdminParticipantPicksSummary(completeTracker, teamById);
  assert(completeSummary.championPick === "United States", "summary champion for complete bracket");
  assert(completeHtml.includes("Remaining live picks ("), "live picks count in heading");

  // 2. No champion pick
  const noChampSlots: KnockoutPickSlotDraft[] = [
    slot("r32|1", "round_of_32", "team-arg", "1"),
    slot("r16|1", "round_of_16", "team-arg", "1"),
  ];
  const noChampTracker = buildLiveBracketTracker({
    slots: noChampSlots,
    teams: LONG_NAME_TEAMS,
    knockoutBracketPicksUnlocked: true,
    tournamentMatches: [r32Finished],
  });
  const noChampHtml = renderToStaticMarkup(
    AdminPosterBracketTracker({ tracker: noChampTracker, teamById, matchEditHref: null }),
  );
  assert(noChampHtml.includes("No champion pick saved"), "missing champion copy");
  const noChampSummary = buildAdminParticipantPicksSummary(noChampTracker, teamById);
  assert(noChampSummary.championPick === null, "summary shows no champion");

  // 3. Missing final pick — SF picks exist, no finalist/champion
  const missingFinalSlots: KnockoutPickSlotDraft[] = [
    slot("sf|1", "semifinalist", "team-ned", "1"),
    slot("sf|2", "semifinalist", "team-arg", "2"),
  ];
  const missingFinalTracker = buildLiveBracketTracker({
    slots: missingFinalSlots,
    teams: LONG_NAME_TEAMS,
    knockoutBracketPicksUnlocked: true,
    tournamentMatches: [],
  });
  const missingFinalSummary = buildAdminParticipantPicksSummary(missingFinalTracker, teamById);
  assert(missingFinalSummary.finalPicks.length === 0, "no final pick when finalist slots empty");
  assert(missingFinalSummary.missingSlots.some((s) => s.includes("Final")), "final slot missing");

  // 4. Correct R32/R16 picks
  const correctSlots: KnockoutPickSlotDraft[] = [
    slot("r32|1", "round_of_32", "team-usa", "1"),
    slot("r16|1", "round_of_16", "team-usa", "1"),
  ];
  const correctTracker = buildLiveBracketTracker({
    slots: correctSlots,
    teams: LONG_NAME_TEAMS,
    knockoutBracketPicksUnlocked: false,
    tournamentMatches: [r32Finished],
  });
  const m73 = correctTracker.roundOf32.find((m) => m.fifaMatchNo === 73)!;
  const r32Summary = resolveAdminMatchOutcomeSummary(m73, teamById);
  assert(r32Summary.text === "Pick correct: United States", "R32 correct footer");
  const usaBadge = resolveAdminTeamStatusBadge(
    m73.home.teamId === "team-usa" ? m73.home : m73.away,
  );
  assert(usaBadge?.label === "Picked + advanced", "R32 correct badge");

  // 5. Picked-out teams
  const pickedOutSlots: KnockoutPickSlotDraft[] = [
    slot("r32|1", "round_of_32", "team-sui", "1"),
    slot("r32|2", "round_of_32", "team-tun", "2"),
    slot("r16|1", "round_of_16", "team-sui", "1"),
  ];
  const pickedOutTracker = buildLiveBracketTracker({
    slots: pickedOutSlots,
    teams: LONG_NAME_TEAMS,
    knockoutBracketPicksUnlocked: false,
    tournamentMatches: [r32Finished],
  });
  const pickedOutHtml = renderToStaticMarkup(
    AdminPosterBracketTracker({ tracker: pickedOutTracker, teamById, matchEditHref: null }),
  );
  assert(pickedOutHtml.includes("Picked out"), "picked-out badge");
  assert(pickedOutHtml.includes("Pick missed:"), "picked-out footer");
  const pickedOutSummary = buildAdminParticipantPicksSummary(pickedOutTracker, teamById);
  assert(
    pickedOutSummary.eliminatedPicks.includes("Switzerland"),
    "summary lists eliminated pick",
  );

  // 6. Stale / no-longer-reachable picks (topology-corrected SF slots)
  const staleSlots: KnockoutPickSlotDraft[] = [
    slot("r16|1", "round_of_16", "team-fra", "1"),
    slot("r16|2", "round_of_16", "team-ger", "2"),
    slot("qf|1", "quarterfinalist", "team-fra", "1"),
    slot("qf|2", "quarterfinalist", "team-ger", "2"),
    slot("sf|1", "semifinalist", "team-fra", "1", {
      pickStatus: "out",
      invalidReason: "not_in_official_matchup",
    }),
    slot("champ", "champion", "team-fra", null, {
      pickStatus: "out",
      invalidReason: "not_in_official_matchup",
    }),
  ];
  const staleTracker = buildLiveBracketTracker({
    slots: staleSlots,
    teams: LONG_NAME_TEAMS,
    knockoutBracketPicksUnlocked: true,
    tournamentMatches: [],
  });
  const staleHtml = renderToStaticMarkup(
    AdminPosterBracketTracker({ tracker: staleTracker, teamById, matchEditHref: null }),
  );
  assert(
    staleHtml.includes("Champion pick: France") &&
      staleHtml.includes("Out — champion pick eliminated."),
    "stale champion copy",
  );
  const staleSummary = buildAdminParticipantPicksSummary(staleTracker, teamById);
  assert(
    staleSummary.stalePicks.includes("France") || staleSummary.championStatus === "unreachable",
    "summary reflects stale/unreachable state",
  );

  // 7. Upcoming matches with no official result
  const r32Upcoming = knockoutMatch({
    match_id: "m74",
    match_code: "M74",
    stage_code: "round_of_32",
    status: "scheduled",
    home_goals: null,
    away_goals: null,
    home_team_name: "Netherlands",
    home_country_code: "NED",
    away_team_name: "Argentina",
    away_country_code: "ARG",
    winner_team_name: null,
    winner_country_code: null,
  });
  const upcomingTracker = buildLiveBracketTracker({
    slots: [slot("r32|3", "round_of_32", "team-ned", "3")],
    teams: LONG_NAME_TEAMS,
    knockoutBracketPicksUnlocked: true,
    tournamentMatches: [r32Upcoming],
  });
  const upcomingMatch = upcomingTracker.roundOf32.find((m) => m.fifaMatchNo === 74)!;
  assert(
    resolveAdminMatchOutcomeSummary(upcomingMatch, teamById).text.includes("Waiting for result"),
    "upcoming match footer from helper",
  );
  const upcomingHtml = renderToStaticMarkup(
    AdminPosterBracketTracker({ tracker: upcomingTracker, teamById, matchEditHref: null }),
  );
  assert(upcomingHtml.includes("Waiting for result"), "upcoming match footer in markup");
  assert(upcomingHtml.includes("Upcoming"), "upcoming status label on card");

  // 8. Long team names
  const longNameHtml = renderToStaticMarkup(
    AdminPosterBracketTracker({ tracker: upcomingTracker, teamById, matchEditHref: null }),
  );
  assert(completeHtml.includes("United States"), "long name United States in complete bracket");
  assert(longNameHtml.includes("Netherlands"), "long name Netherlands in upcoming match");
  assert(longNameHtml.includes("Argentina"), "long name Argentina in upcoming match");
  assert(longNameHtml.includes(String(ADMIN_BRACKET_CARD_WIDTH_PX)), "readable card width constant");
  assert(!longNameHtml.includes("South Af…"), "no aggressive truncation ellipsis in markup");
  assert(longNameHtml.includes("truncate"), "truncation class on long names");

  // Routing: participant pages use poster layout, admin uses admin layout
  const participantHtml = renderToStaticMarkup(
    ParticipantBracketView({
      slots: correctSlots,
      teams: LONG_NAME_TEAMS,
      knockoutBracketPicksUnlocked: false,
      tournamentMatches: [r32Finished],
      readOnly: true,
    }),
  );
  assertParticipantLayout(participantHtml);

  const adminViaViewHtml = renderToStaticMarkup(
    ParticipantBracketView({
      slots: correctSlots,
      teams: LONG_NAME_TEAMS,
      knockoutBracketPicksUnlocked: false,
      tournamentMatches: [r32Finished],
      readOnly: true,
      adminMode: true,
      showIntro: false,
    }),
  );
  assertAdminLayout(adminViaViewHtml);
  assert(!adminViaViewHtml.includes("Knockout Bracket Tracker"), "admin hides participant intro");

  const posterOnlyHtml = renderToStaticMarkup(
    PosterBracketTracker({ tracker: correctTracker, teamById, matchEditHref: null }),
  );
  assertParticipantLayout(posterOnlyHtml);

  // Summary consistency: rendered summary lists match computed summary
  const summaryHtml = renderToStaticMarkup(
    AdminPosterBracketTracker({ tracker: pickedOutTracker, teamById, matchEditHref: null }),
  );
  for (const name of pickedOutSummary.eliminatedPicks) {
    assert(summaryHtml.includes(name), `summary panel shows eliminated ${name}`);
  }

  // Bracket view is read-only on admin page; editing stays on list view (unchanged route split).
  assert(!adminViaViewHtml.includes('href="/admin'), "bracket view does not link to edit href");

  console.log("adminBracketLayoutQa.selftest.ts: all checks passed");
})();
