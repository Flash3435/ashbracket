/**
 * Self-test: `npx tsx lib/bracket/liveBracketTracker.selftest.ts`
 */
import type { Team } from "../../src/types/domain";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import { buildLiveBracketTracker } from "./liveBracketTracker";
import {
  FINAL_FEEDER_NO_CHAMPION_HELPER,
  NO_CHAMPION_PICK_SAVED_LABEL,
} from "./knockoutBracketDisplayCopy";
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
    assert(tracker.champion.hasSavedPick, "saved champion flagged");
    assert(tracker.showChampionCard, "champion card shown when knockout picks exist");
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
    assert(m73.home.participantPick === "not_your_pick", "official winner not your pick");
    assert(liveSideNeedsMutedFlag(m73.away), "loser side muted");
  }

  // Official advancer when participant saved no R32 winner pick
  {
    const slots: KnockoutPickSlotDraft[] = [
      slot("r32|1", "round_of_32", "team-bra", "1"),
      slot("r32|2", "round_of_32", "team-tun", "2"),
    ];

    const tracker = buildLiveBracketTracker({
      slots,
      teams,
      knockoutBracketPicksUnlocked: false,
      tournamentMatches: [r32Finished],
    });

    const m73 = tracker.roundOf32[0]!;
    assert(m73.home.participantPick === "not_your_pick", "no saved winner shows not your pick");
    assert(m73.home.displayName === "Brazil", "official winner name shown");
    assert(m73.away.tournamentOutcome === "eliminated", "official loser eliminated");
    assert(m73.away.participantPick === null, "eliminated non-pick side has no pick badge");
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

  // Finalist slot (SF winner) without champion row — Ash-style incomplete bracket
  {
    const slots: KnockoutPickSlotDraft[] = [
      slot("sf|1", "semifinalist", "team-fra", "1"),
      slot("sf|3", "semifinalist", "team-ger", "3"),
      slot("f|1", "finalist", "team-fra", "1"),
    ];

    const tracker = buildLiveBracketTracker({
      slots,
      teams,
      knockoutBracketPicksUnlocked: true,
      tournamentMatches: [],
    });

    const m104 = tracker.final[0]!;
    assert(m104.home.teamId === "team-fra", "M104 home from SF winner slot");
    assert(m104.away.teamId == null, "M104 away TBD when SF slot 2 empty");
    assert(!tracker.champion.hasSavedPick, "no saved champion pick");
    assert(
      tracker.champion.displayName === NO_CHAMPION_PICK_SAVED_LABEL,
      "champion empty label",
    );
    assert(tracker.showChampionCard, "champion card visible with knockout picks");
    assert(
      tracker.finalHelperCopy === FINAL_FEEDER_NO_CHAMPION_HELPER,
      "final helper copy when feeders exist without champion",
    );

    const m101 = tracker.semifinals[0]!;
    assert(m101.home.teamId === "team-fra", "M101 home from feeder slots");
    assert(m101.away.teamId === "team-ger", "M101 away from feeder slots");
  }

  // Saved champion pick
  {
    const slots: KnockoutPickSlotDraft[] = [
      slot("f|1", "finalist", "team-fra", "1"),
      slot("f|2", "finalist", "team-ger", "2"),
      slot("champ", "champion", "team-fra"),
    ];

    const tracker = buildLiveBracketTracker({
      slots,
      teams,
      knockoutBracketPicksUnlocked: true,
      tournamentMatches: [],
    });

    assert(tracker.champion.teamId === "team-fra", "champion team id");
    assert(tracker.champion.displayName === "France", "champion display name");
    assert(tracker.champion.hasSavedPick, "has saved champion");
    assert(tracker.finalHelperCopy == null, "no helper when champion saved");
  }

  // Stale/eliminated champion still shows saved pick, not empty label
  {
    const slots: KnockoutPickSlotDraft[] = [
      slot("champ", "champion", "team-fra"),
    ];
    slots[0]!.pickStatus = "out";

    const tracker = buildLiveBracketTracker({
      slots,
      teams,
      knockoutBracketPicksUnlocked: true,
      tournamentMatches: [],
    });

    assert(tracker.champion.teamId === "team-fra", "stale champion team preserved");
    assert(tracker.champion.hasSavedPick, "stale champion counts as saved");
    assert(
      tracker.champion.displayName === "France",
      "stale champion shows team name not empty label",
    );
  }

  console.log("liveBracketTracker.selftest.ts: ok");
})();
