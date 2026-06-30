/**
 * Self-test: `npx tsx lib/bracket/liveBracketTracker.selftest.ts`
 */
import type { Team } from "../../src/types/domain";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import { buildLiveBracketTracker } from "./liveBracketTracker";
import { liveSideNeedsMutedFlag } from "./liveBracketSideStyles";
import { shouldUseLiveBracketTracker } from "./resolveLiveBracketTrackerMode";

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

  // Participant picked Brazil — winner
  {
    const slots: KnockoutPickSlotDraft[] = [
      slot("r32|1", "round_of_32", "team-bra", "1"),
      slot("r32|2", "round_of_32", "team-tun", "2"),
      slot("r16|1", "round_of_16", "team-bra", "1"),
      slot("sf|1", "semifinalist", "team-bra", "1"),
      slot("sf|2", "semifinalist", "team-bra", "2"),
      slot("f|1", "finalist", "team-bra", "1"),
      slot("champ", "champion", "team-bra"),
    ];

    assert(
      shouldUseLiveBracketTracker({
        knockoutBracketPicksUnlocked: false,
        tournamentMatches: [r32Finished],
        slots,
      }),
      "live mode with fixtures even when organizer unlock false",
    );

    const tracker = buildLiveBracketTracker({
      slots,
      teams,
      knockoutBracketPicksUnlocked: false,
      tournamentMatches: [r32Finished],
    });

    const m73 = tracker.roundOf32[0]!;
    assert(m73.usesOfficialFixture, "M73 uses official fixture");
    assert(m73.home.teamId === "team-bra", "official home is Brazil");
    assert(m73.away.teamId === "team-tun", "official away is Tunisia");
    assert(m73.home.tournamentOutcome === "advanced", "winner marked advanced");
    assert(m73.away.tournamentOutcome === "eliminated", "loser marked eliminated");
    assert(m73.home.participantPick === "your_pick", "picked winner gets Your pick");
    assert(m73.statusLabel === "Final", "shows Final status");
    assert(m73.scoreLine === "2 – 1", "shows final score");

    assert(
      tracker.roundOf16.some(
        (m) => m.home.teamId === "team-bra" || m.away.teamId === "team-bra",
      ),
      "R16 shows Brazil from participant path",
    );
    assert(tracker.champion.teamId === "team-bra", "champion pick renders");
  }

  // Participant picked Tunisia — loser
  {
    const slots: KnockoutPickSlotDraft[] = [
      slot("r32|1", "round_of_32", "team-bra", "1"),
      slot("r32|2", "round_of_32", "team-tun", "2"),
      slot("r16|1", "round_of_16", "team-tun", "1"),
    ];

    const tracker = buildLiveBracketTracker({
      slots,
      teams,
      knockoutBracketPicksUnlocked: false,
      tournamentMatches: [r32Finished],
    });

    const m73 = tracker.roundOf32[0]!;
    assert(m73.away.participantPick === "your_pick_eliminated", "picked loser flagged");
    assert(liveSideNeedsMutedFlag(m73.away), "loser side muted");
  }

  // Upcoming match still shows participant pick
  {
    const upcoming = knockoutMatch({
      match_id: "m73",
      match_code: "M73",
      stage_code: "round_of_32",
      status: "scheduled",
      home_goals: null,
      away_goals: null,
      winner_country_code: null,
      winner_team_name: null,
    });
    const slots: KnockoutPickSlotDraft[] = [
      slot("r32|1", "round_of_32", "team-bra", "1"),
      slot("r32|2", "round_of_32", "team-tun", "2"),
      slot("r16|1", "round_of_16", "team-bra", "1"),
    ];

    const tracker = buildLiveBracketTracker({
      slots,
      teams,
      knockoutBracketPicksUnlocked: false,
      tournamentMatches: [upcoming],
    });

    const m73 = tracker.roundOf32[0]!;
    const pickedSide = [m73.home, m73.away].find((s) => s.participantPick === "your_pick_alive");
    assert(pickedSide?.teamId === "team-bra", "upcoming match shows participant pick");
    assert(m73.statusLabel === "Upcoming", "upcoming status shown");
  }

  console.log("liveBracketTracker.selftest.ts: ok");
})();
