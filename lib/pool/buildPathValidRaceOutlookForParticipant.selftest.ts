import assert from "node:assert";
import type { Team } from "../../src/types/domain";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import {
  buildPathValidRaceOutlookForParticipant,
  liveRemainingTeamIdFromMatch,
  shortLabelForPredictionKind,
  TOP_REMAINING_PICKS_LIMIT,
} from "./buildPathValidRaceOutlookForParticipant";
import { countLiveKnockoutPicksRemaining } from "./buildParticipantRaceOutlook";

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

const teams = [
  team("team-bra", "Brazil", "BRA"),
  team("team-tun", "Tunisia", "TUN"),
  team("team-fra", "France", "FRA"),
  team("team-ger", "Germany", "GER"),
  team("team-nor", "Norway", "NOR"),
];

const r32Finished = knockoutMatch({
  match_id: "m73",
  match_code: "M73",
  stage_code: "round_of_32",
  stage_label: "Round of 32",
});

// Finished R32 loss: Tunisia downstream paths do not count (Brazil champion may still be live)
{
  const slots: KnockoutPickSlotDraft[] = [
    slot("r32|1", "round_of_32", "team-bra", "1"),
    slot("r32|2", "round_of_32", "team-tun", "2"),
    slot("r16|1", "round_of_16", "team-tun", "1"),
    slot("qf|1", "quarterfinalist", "team-tun", "1"),
    slot("champ", "champion", "team-tun"),
  ];

  const naive = countLiveKnockoutPicksRemaining(slots, new Set());
  assert.ok(naive >= 3, "naive counter overcounts invalid downstream paths");

  const outlook = buildPathValidRaceOutlookForParticipant({
    slots,
    teams,
    tournamentMatches: [r32Finished],
    knockoutBracketPicksUnlocked: false,
    championTeamId: "team-tun",
  });

  assert.strictEqual(
    outlook.pathValidLivePickCount,
    0,
    "lost R32 Tunisia paths should not count as live",
  );
  assert.strictEqual(outlook.championPathDead, true);
  assert.strictEqual(outlook.topRemainingPicks.length, 0);
}

// Naive counter stays high when Brazil champion is globally alive on a broken feeder path
{
  const slots: KnockoutPickSlotDraft[] = [
    slot("r32|1", "round_of_32", "team-bra", "1"),
    slot("r32|2", "round_of_32", "team-tun", "2"),
    slot("r16|1", "round_of_16", "team-tun", "1"),
    slot("qf|1", "quarterfinalist", "team-tun", "1"),
    slot("champ", "champion", "team-bra"),
  ];

  const naive = countLiveKnockoutPicksRemaining(slots, new Set());
  const outlook = buildPathValidRaceOutlookForParticipant({
    slots,
    teams,
    tournamentMatches: [r32Finished],
    knockoutBracketPicksUnlocked: false,
    championTeamId: "team-bra",
  });

  assert.ok(naive > outlook.pathValidLivePickCount);
  assert.ok(
    outlook.pathValidLivePickCount <= 1,
    "only Brazil champion path may remain after R32 win",
  );
}

// Finished R32 win: Brazil advanced supports downstream live champion path when final is open
{
  const slots: KnockoutPickSlotDraft[] = [
    slot("r32|1", "round_of_32", "team-bra", "1"),
    slot("r32|2", "round_of_32", "team-tun", "2"),
    slot("r16|1", "round_of_16", "team-bra", "1"),
    slot("sf|1", "semifinalist", "team-bra", "1"),
    slot("f|1", "finalist", "team-bra", "1"),
    slot("champ", "champion", "team-bra"),
  ];

  const outlook = buildPathValidRaceOutlookForParticipant({
    slots,
    teams,
    tournamentMatches: [r32Finished],
    knockoutBracketPicksUnlocked: false,
    championTeamId: "team-bra",
  });

  assert.ok(
    outlook.pathValidLivePickCount > 0,
    "advanced Brazil path should keep unresolved downstream picks alive",
  );
  assert.ok(
    outlook.topRemainingPicks.some((pick) => pick.predictionKind === "champion"),
    "champion should appear among top remaining picks",
  );
}

// Globally eliminated team does not count
{
  const slots: KnockoutPickSlotDraft[] = [
    slot("r32|1", "round_of_32", "team-tun", "1"),
    slot("champ", "champion", "team-tun"),
  ];

  const outlook = buildPathValidRaceOutlookForParticipant({
    slots,
    teams,
    tournamentMatches: [r32Finished],
    knockoutBracketPicksUnlocked: false,
    championTeamId: "team-tun",
  });

  assert.strictEqual(outlook.championPathDead, true);
  assert.strictEqual(outlook.pathValidLivePickCount, 0);
}

// Top remaining picks sorted by importance and limited
{
  const slots: KnockoutPickSlotDraft[] = [
    slot("r32|5", "round_of_32", "team-fra", "5"),
    slot("r16|2", "round_of_16", "team-fra", "2"),
    slot("qf|1", "quarterfinalist", "team-fra", "1"),
    slot("sf|1", "semifinalist", "team-fra", "1"),
    slot("f|1", "finalist", "team-fra", "1"),
    slot("champ", "champion", "team-fra"),
  ];

  const outlook = buildPathValidRaceOutlookForParticipant({
    slots,
    teams,
    tournamentMatches: [],
    knockoutBracketPicksUnlocked: false,
    championTeamId: "team-fra",
  });

  assert.ok(outlook.topRemainingPicks.length > 0);
  assert.ok(outlook.topRemainingPicks.length <= TOP_REMAINING_PICKS_LIMIT);
  assert.strictEqual(outlook.topRemainingPicks[0]?.predictionKind, "champion");
  assert.strictEqual(shortLabelForPredictionKind("quarterfinalist"), "quarterfinalist");
}

// liveRemainingTeamIdFromMatch only accepts alive unresolved picks
{
  assert.strictEqual(
    liveRemainingTeamIdFromMatch({
      matchKey: "M1",
      fifaMatchNo: 1,
      stageCode: "round_of_32",
      stageLabel: "Round of 32",
      status: "finished",
      scoreLine: "2 – 1",
      statusLabel: "Final",
      usesOfficialFixture: true,
      participantPickedWinnerId: "team-tun",
      home: {
        teamId: "team-bra",
        displayName: "Brazil",
        countryCode: "BRA",
        tournamentOutcome: "advanced",
        participantPick: "your_pick",
        eliminatedFromTournament: false,
        fillState: "team",
        helperTooltip: null,
      },
      away: {
        teamId: "team-tun",
        displayName: "Tunisia",
        countryCode: "TUN",
        tournamentOutcome: "eliminated",
        participantPick: "your_pick_eliminated",
        eliminatedFromTournament: false,
        fillState: "team",
        helperTooltip: null,
      },
    }),
    null,
  );
}

console.log("buildPathValidRaceOutlookForParticipant.selftest.ts: all passed");
