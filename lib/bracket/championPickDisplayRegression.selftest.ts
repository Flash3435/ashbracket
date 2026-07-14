/**
 * Regression: saved champion picks must survive display + topology repair.
 * Scenarios A–D from the Netherlands / admin champion card investigation.
 *
 * Run: `npx tsx lib/bracket/championPickDisplayRegression.selftest.ts`
 */
import assert from "node:assert";
import { renderToStaticMarkup } from "react-dom/server";
import type { Team } from "../../src/types/domain";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import { ChampionCard } from "../../components/bracket/ChampionCard";
import { ChampionSummaryCard } from "../../components/bracket/admin/ChampionSummaryCard";
import {
  buildAdminParticipantPicksSummary,
  resolveAdminChampionSummaryLine,
} from "./adminBracketDisplay";
import {
  auditKnockoutTopologyStalePicks,
} from "./auditKnockoutTopologyStalePicks";
import { buildLiveBracketTracker } from "./liveBracketTracker";
import {
  championPickEliminatedRoundCopy,
  championPickSavedLabel,
  NO_CHAMPION_PICK_SAVED_LABEL,
} from "./knockoutBracketDisplayCopy";
import {
  dedupeStaleFindingsForRepair,
  planClearsFromStaleFindings,
} from "./planKnockoutTopologyStalePickRepairs";

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
    kickoff_at: "2026-07-10T20:00:00Z",
    status: "finished",
    home_goals: 2,
    away_goals: 1,
    home_penalties: null,
    away_penalties: null,
    home_team_name: "Home",
    home_country_code: "HOM",
    away_team_name: "Away",
    away_country_code: "AWY",
    winner_team_name: "Home",
    winner_country_code: "HOM",
    ...overrides,
  };
}

const teams: Team[] = [
  team("team-ned", "Netherlands", "NED"),
  team("team-esp", "Spain", "ESP"),
  team("team-usa", "USA", "USA"),
  team("team-fra", "France", "FRA"),
  team("team-arg", "Argentina", "ARG"),
];
const teamById = new Map(teams.map((t) => [t.id, t]));

const nedOutR32 = knockoutMatch({
  match_id: "m73",
  match_code: "M73",
  stage_code: "round_of_32",
  stage_label: "Round of 32",
  status: "finished",
  home_country_code: "NED",
  home_team_name: "Netherlands",
  away_country_code: "USA",
  away_team_name: "USA",
  home_goals: 0,
  away_goals: 1,
  winner_country_code: "USA",
  winner_team_name: "USA",
});

// A. Persisted champion = Netherlands, eliminated in R32
{
  const slots: KnockoutPickSlotDraft[] = [
    slot("champ", "champion", "team-ned"),
    slot("sf|1", "semifinalist", "team-fra", "1"),
  ];
  const tracker = buildLiveBracketTracker({
    slots,
    teams,
    knockoutBracketPicksUnlocked: true,
    tournamentMatches: [nedOutR32],
  });

  assert.strictEqual(tracker.champion.hasSavedPick, true);
  assert.strictEqual(tracker.champion.teamId, "team-ned");
  assert.strictEqual(tracker.champion.displayName, "Netherlands");
  assert.strictEqual(tracker.champion.eliminatedFromTournament, true);
  assert.strictEqual(tracker.champion.eliminationRoundLabel, "Round of 32");
  assert.strictEqual(
    tracker.champion.outDetailCopy,
    championPickEliminatedRoundCopy("Round of 32"),
  );
  assert.notStrictEqual(tracker.champion.displayName, NO_CHAMPION_PICK_SAVED_LABEL);

  const adminLine = resolveAdminChampionSummaryLine(tracker.champion, teamById);
  assert.strictEqual(adminLine.line, championPickSavedLabel("Netherlands"));
  assert.strictEqual(
    adminLine.detail,
    championPickEliminatedRoundCopy("Round of 32"),
  );
  assert.ok(!adminLine.line.includes("No champion"));

  const summary = buildAdminParticipantPicksSummary(tracker, teamById);
  assert.strictEqual(summary.championPick, "Netherlands");
  assert.strictEqual(summary.championStatus, "unreachable");

  const adminHtml = renderToStaticMarkup(
    ChampionSummaryCard({ champion: tracker.champion, teamById }),
  );
  const participantHtml = renderToStaticMarkup(
    ChampionCard({ champion: tracker.champion, teamById }),
  );
  assert.ok(adminHtml.includes("Netherlands"), "admin card shows Netherlands");
  assert.ok(
    adminHtml.includes(championPickSavedLabel("Netherlands")),
    "admin card champion pick line",
  );
  assert.ok(
    adminHtml.includes("Out — eliminated in the Round of 32"),
    "admin card elimination detail",
  );
  assert.ok(!adminHtml.includes(NO_CHAMPION_PICK_SAVED_LABEL));
  assert.ok(participantHtml.includes("Netherlands"), "participant card shows Netherlands");
  assert.ok(!participantHtml.includes(NO_CHAMPION_PICK_SAVED_LABEL));

  // Topology repair must not delete this saved eliminated champion even if
  // unrelated finalists exist (historical production data-loss path).
  const slotsWithFinalists: KnockoutPickSlotDraft[] = [
    ...slots,
    slot("f|1", "finalist", "team-fra", "1"),
    slot("f|2", "finalist", "team-arg", "2"),
  ];
  const audit = auditKnockoutTopologyStalePicks({
    slots: slotsWithFinalists,
    teamName: (id) => teamById.get(id)?.name ?? id,
  });
  const actions = planClearsFromStaleFindings({
    poolId: "p",
    poolName: "Pool",
    participantId: "part",
    participantName: "P",
    participantEmail: null,
    slots: slotsWithFinalists,
    staleFindings: dedupeStaleFindingsForRepair(audit.stalePicks),
  });
  assert.ok(
    !actions.some((a) => a.predictionKind === "champion"),
    "A: topology repair never clears champion",
  );
}

// B. No persisted champion row
{
  const slots: KnockoutPickSlotDraft[] = [
    slot("sf|1", "semifinalist", "team-fra", "1"),
  ];
  const tracker = buildLiveBracketTracker({
    slots,
    teams,
    knockoutBracketPicksUnlocked: true,
    tournamentMatches: [],
  });
  assert.strictEqual(tracker.champion.hasSavedPick, false);
  assert.strictEqual(tracker.champion.teamId, null);
  assert.strictEqual(tracker.champion.displayName, NO_CHAMPION_PICK_SAVED_LABEL);

  const adminLine = resolveAdminChampionSummaryLine(tracker.champion, teamById);
  assert.strictEqual(adminLine.line, NO_CHAMPION_PICK_SAVED_LABEL);

  const adminHtml = renderToStaticMarkup(
    ChampionSummaryCard({ champion: tracker.champion, teamById }),
  );
  const participantHtml = renderToStaticMarkup(
    ChampionCard({ champion: tracker.champion, teamById }),
  );
  assert.ok(adminHtml.includes(NO_CHAMPION_PICK_SAVED_LABEL));
  assert.ok(participantHtml.includes(NO_CHAMPION_PICK_SAVED_LABEL));
}

// C. Persisted champion = Spain and still alive
{
  const slots: KnockoutPickSlotDraft[] = [
    slot("champ", "champion", "team-esp"),
  ];
  const tracker = buildLiveBracketTracker({
    slots,
    teams,
    knockoutBracketPicksUnlocked: true,
    tournamentMatches: [nedOutR32],
  });
  assert.strictEqual(tracker.champion.hasSavedPick, true);
  assert.strictEqual(tracker.champion.teamId, "team-esp");
  assert.strictEqual(tracker.champion.displayName, "Spain");
  assert.strictEqual(tracker.champion.eliminatedFromTournament, false);
  assert.strictEqual(tracker.champion.outDetailCopy, null);

  const adminLine = resolveAdminChampionSummaryLine(tracker.champion, teamById);
  assert.strictEqual(adminLine.line, championPickSavedLabel("Spain"));
  assert.strictEqual(adminLine.detail, null);
}

// D. Persisted champion = Netherlands; unrelated auto-carried Spain in SF slot
{
  const slots: KnockoutPickSlotDraft[] = [
    slot("champ", "champion", "team-ned"),
    // Persisted QF Spain can auto-carry into SF presentation; must not overwrite champion.
    slot("qf|5", "quarterfinalist", "team-esp", "5"),
    slot("sf|2", "semifinalist", "team-esp", "2"),
  ];
  const tracker = buildLiveBracketTracker({
    slots,
    teams,
    knockoutBracketPicksUnlocked: true,
    tournamentMatches: [nedOutR32],
  });
  assert.strictEqual(tracker.champion.teamId, "team-ned");
  assert.strictEqual(tracker.champion.hasSavedPick, true);
  assert.strictEqual(tracker.champion.displayName, "Netherlands");
  assert.notStrictEqual(tracker.champion.teamId, "team-esp");

  const adminLine = resolveAdminChampionSummaryLine(tracker.champion, teamById);
  assert.strictEqual(adminLine.line, championPickSavedLabel("Netherlands"));
  assert.ok(!adminLine.line.includes("Spain"));
}

console.log("championPickDisplayRegression.selftest.ts: ok");
