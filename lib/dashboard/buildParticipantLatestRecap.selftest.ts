import assert from "node:assert";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { Team } from "../../src/types/domain";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import {
  buildParticipantLatestRecap,
  buildRecapItemForMatch,
  formatRecapMatchDaySubtitle,
  formatRecapMatchHeadline,
  LATEST_RECAP_DASHBOARD_LIMIT,
  pointsByMatchCodeFromScoreImpactActivities,
  recapBadgeKind,
  recapBadgeAlignsWithExplanation,
  recentCompletedOfficialMatches,
  selectBestRecapItem,
  selectRecentRecapItemsForDashboard,
} from "./buildParticipantLatestRecap";

const teams = [
  {
    id: "team-mex",
    name: "Mexico",
    countryCode: "MEX",
    fifaCode: "MEX",
    fifaRank: 1,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "team-rsa",
    name: "South Africa",
    countryCode: "RSA",
    fifaCode: "RSA",
    fifaRank: 2,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "team-kor",
    name: "Korea Republic",
    countryCode: "KOR",
    fifaCode: "KOR",
    fifaRank: 3,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "team-fra",
    name: "France",
    countryCode: "FRA",
    fifaCode: "FRA",
    fifaRank: 4,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  },
] satisfies Team[];

function slot(
  overrides: Partial<KnockoutPickSlotDraft> &
    Pick<KnockoutPickSlotDraft, "predictionKind" | "teamId">,
): KnockoutPickSlotDraft {
  return {
    rowKey: overrides.rowKey ?? `${overrides.predictionKind}-${overrides.teamId}`,
    sectionLabel: "Group",
    slotLabel: "Pick",
    tournamentStageId: "stage-1",
    slotKey: null,
    groupCode: overrides.groupCode ?? "A",
    bonusKey: null,
    ...overrides,
  };
}

function finishedMatch(
  overrides: Partial<TournamentMatchPublicRow> &
    Pick<TournamentMatchPublicRow, "match_id" | "match_code">,
): TournamentMatchPublicRow {
  return {
    edition_id: "ed-1",
    edition_code: "wc2026",
    stage_code: "group",
    stage_label: "Group stage",
    stage_sort_order: 1,
    group_code: "A",
    round_index: 1,
    kickoff_at: "2026-06-12T20:00:00Z",
    status: "finished",
    home_goals: 2,
    away_goals: 1,
    home_penalties: null,
    away_penalties: null,
    home_team_name: "Mexico",
    home_country_code: "MEX",
    away_team_name: "Korea Republic",
    away_country_code: "KOR",
    winner_team_name: "Mexico",
    winner_country_code: "MEX",
    ...overrides,
  };
}

// no completed matches -> no card
{
  const recap = buildParticipantLatestRecap({
    matches: [
      {
        ...finishedMatch({ match_id: "m1", match_code: "M1" }),
        status: "scheduled",
        home_goals: null,
        away_goals: null,
      },
    ],
    slots: [slot({ predictionKind: "group_winner", teamId: "team-mex" })],
    teams,
  });
  assert.equal(recap.showCard, false);
  assert.equal(recentCompletedOfficialMatches([]).length, 0);
}

// completed match with participant group pick helped
{
  const matches = [
    finishedMatch({ match_id: "m-old", match_code: "M-OLD", kickoff_at: "2026-06-10T20:00:00Z" }),
    finishedMatch({ match_id: "m-new", match_code: "M-NEW", kickoff_at: "2026-06-12T20:00:00Z" }),
  ];
  const recap = buildParticipantLatestRecap({
    matches,
    slots: [slot({ predictionKind: "group_winner", teamId: "team-mex", groupCode: "A" })],
    teams,
  });
  assert.equal(recap.showCard, true);
  assert.equal(recap.variant, "matches");
  assert.equal(recap.items.length, 1);
  assert.equal(recap.items[0]!.matchId, "m-new");
  assert.equal(recap.items[0]!.impact, "helped");
  assert.ok(recap.items[0]!.explanation.includes("Mexico"));
  assert.ok(recap.items[0]!.explanation.includes("helped your bracket"));
}

// multiple completed matches on same day returns multiple recap items
{
  const matches = [
    finishedMatch({ match_id: "m1", match_code: "M1", kickoff_at: "2026-06-12T22:00:00Z" }),
    finishedMatch({ match_id: "m2", match_code: "M2", kickoff_at: "2026-06-12T20:00:00Z" }),
    finishedMatch({ match_id: "m3", match_code: "M3", kickoff_at: "2026-06-10T20:00:00Z" }),
  ];
  const recap = buildParticipantLatestRecap({
    matches,
    slots: [slot({ predictionKind: "group_winner", teamId: "team-mex", groupCode: "A" })],
    teams,
  });
  assert.equal(recap.items.length, 2);
  assert.equal(recap.items[0]!.matchId, "m1");
  assert.equal(recap.items[1]!.matchId, "m2");
  assert.equal(recap.items.some((i) => i.matchId === "m3"), false);
}

// max 4 items on latest match day
{
  const matches = Array.from({ length: 6 }, (_, i) =>
    finishedMatch({
      match_id: `m-${i}`,
      match_code: `M-${i}`,
      kickoff_at: `2026-06-12T${String(10 + i).padStart(2, "0")}:00:00Z`,
    }),
  );
  const recap = buildParticipantLatestRecap({
    matches,
    slots: [slot({ predictionKind: "group_winner", teamId: "team-mex", groupCode: "A" })],
    teams,
  });
  assert.equal(recap.items.length, LATEST_RECAP_DASHBOARD_LIMIT);
}

// most recent completed match day selected (not older day)
{
  const olderDay = finishedMatch({
    match_id: "m-old",
    match_code: "M-OLD",
    kickoff_at: "2026-06-10T20:00:00Z",
  });
  const newerDayA = finishedMatch({
    match_id: "m-new-a",
    match_code: "M-NEW-A",
    kickoff_at: "2026-06-12T20:00:00Z",
  });
  const newerDayB = finishedMatch({
    match_id: "m-new-b",
    match_code: "M-NEW-B",
    kickoff_at: "2026-06-12T22:00:00Z",
  });
  const { items, matchDayYmd } = selectRecentRecapItemsForDashboard(
    [olderDay, newerDayA, newerDayB],
    (m) =>
      buildRecapItemForMatch(
        m,
        [slot({ predictionKind: "group_winner", teamId: "team-mex", groupCode: "A" })],
        teams,
      ),
  );
  assert.equal(items.length, 2);
  assert.equal(matchDayYmd, "2026-06-12");
  assert.equal(items.some((i) => i.matchId === "m-old"), false);
}

// does not pull older matches when latest day has fewer than 4
{
  const recap = buildParticipantLatestRecap({
    matches: [
      finishedMatch({ match_id: "m-latest", match_code: "M-L", kickoff_at: "2026-06-12T20:00:00Z" }),
      finishedMatch({ match_id: "m-older", match_code: "M-O", kickoff_at: "2026-06-10T20:00:00Z" }),
    ],
    slots: [slot({ predictionKind: "group_winner", teamId: "team-mex", groupCode: "A" })],
    teams,
  });
  assert.equal(recap.items.length, 1);
  assert.equal(recap.items[0]!.matchId, "m-latest");
}

// includes neutral/no-strong-angle rows
{
  const neutralMatch = finishedMatch({
    match_id: "m-neutral",
    match_code: "M-NEU",
    kickoff_at: "2026-06-12T22:00:00Z",
    home_team_name: "France",
    home_country_code: "FRA",
    away_team_name: "Korea Republic",
    away_country_code: "KOR",
    home_goals: 2,
    away_goals: 0,
    winner_team_name: "France",
    winner_country_code: "FRA",
  });
  const helpedMatch = finishedMatch({
    match_id: "m-helped",
    match_code: "M-HELP",
    kickoff_at: "2026-06-12T20:00:00Z",
  });
  const recap = buildParticipantLatestRecap({
    matches: [neutralMatch, helpedMatch],
    slots: [slot({ predictionKind: "group_winner", teamId: "team-mex", groupCode: "A" })],
    teams,
  });
  assert.equal(recap.items.length, 2);
  const neutralItem = recap.items.find((i) => i.matchId === "m-neutral");
  assert.equal(neutralItem?.impact, "neutral");
  assert.equal(recapBadgeKind(neutralItem!), "no_strong_angle");
  assert.ok(neutralItem?.explanation.includes("No strong angle"));
}

// helped/hurt/mixed copy still works
{
  const hurtMatch = finishedMatch({
    match_id: "m-hurt",
    match_code: "M-HURT",
    kickoff_at: "2026-06-12T20:00:00Z",
    home_goals: 0,
    away_goals: 2,
    winner_team_name: "Korea Republic",
    winner_country_code: "KOR",
  });
  const item = buildRecapItemForMatch(
    hurtMatch,
    [slot({ predictionKind: "group_winner", teamId: "team-mex", groupCode: "A" })],
    teams,
  );
  assert.equal(item.impact, "hurt");
  assert.ok(item.explanation.includes("hurt your bracket"));
}

// single-match case still works
{
  const recap = buildParticipantLatestRecap({
    matches: [finishedMatch({ match_id: "m1", match_code: "M1" })],
    slots: [slot({ predictionKind: "group_winner", teamId: "team-mex", groupCode: "A" })],
    teams,
  });
  assert.equal(recap.items.length, 1);
  assert.equal(recap.items[0]!.impact, "helped");
}

// completed match with third-place pick still alive/helped
{
  const draw = finishedMatch({
    match_id: "m-draw",
    match_code: "M-DRAW",
    home_goals: 1,
    away_goals: 1,
    winner_team_name: null,
    winner_country_code: null,
    home_team_name: "South Africa",
    home_country_code: "RSA",
    away_team_name: "France",
    away_country_code: "FRA",
  });
  const recap = buildParticipantLatestRecap({
    matches: [draw],
    slots: [
      slot({
        predictionKind: "third_place_qualifier",
        teamId: "team-rsa",
        groupCode: null,
      }),
    ],
    teams,
  });
  assert.equal(recap.items[0]!.impact, "neutral");
  assert.ok(recap.items[0]!.explanation.includes("keeps that path alive"));
}

// completed match with no relevant pick still shows neutral row
{
  const recap = buildParticipantLatestRecap({
    matches: [finishedMatch({ match_id: "m1", match_code: "M1" })],
    slots: [slot({ predictionKind: "group_winner", teamId: "team-fra", groupCode: "B" })],
    teams,
  });
  assert.equal(recap.showCard, true);
  assert.equal(recap.variant, "matches");
  assert.equal(recap.items.length, 1);
  assert.equal(recap.items[0]!.impact, "neutral");
  assert.equal(recapBadgeKind(recap.items[0]!), "no_strong_angle");
}

// no scoring yet badge for group pick with neutral sentiment
{
  const draw = finishedMatch({
    match_id: "m-draw",
    match_code: "M-DRAW",
    home_goals: 1,
    away_goals: 1,
    winner_team_name: null,
    winner_country_code: null,
  });
  const item = buildRecapItemForMatch(
    draw,
    [slot({ predictionKind: "group_winner", teamId: "team-mex", groupCode: "A" })],
    teams,
  );
  assert.equal(item.impact, "neutral");
  assert.equal(recapBadgeKind(item), "no_scoring_yet");
  assert.ok(item.explanation.includes("No pool points yet"));
}

// selectBestRecapItem tie-breaks by match code (legacy single-pick helper)
{
  const a = buildRecapItemForMatch(
    finishedMatch({ match_id: "m-a", match_code: "M-A", kickoff_at: "2026-06-12T20:00:00Z" }),
    [slot({ predictionKind: "group_winner", teamId: "team-mex" })],
    teams,
  );
  const b = buildRecapItemForMatch(
    finishedMatch({ match_id: "m-b", match_code: "M-B", kickoff_at: "2026-06-12T20:00:00Z" }),
    [slot({ predictionKind: "group_winner", teamId: "team-mex" })],
    teams,
  );
  const picked = selectBestRecapItem([b, a]);
  assert.equal(picked?.matchCode, "M-A");
}

// match-level points only shown when available
{
  const itemNoPoints = buildRecapItemForMatch(
    finishedMatch({ match_id: "m1", match_code: "M1" }),
    [slot({ predictionKind: "group_winner", teamId: "team-mex" })],
    teams,
  );
  assert.equal(itemNoPoints.pointsEarned, null);

  const itemWithPoints = buildRecapItemForMatch(
    finishedMatch({ match_id: "m2", match_code: "M2" }),
    [slot({ predictionKind: "group_winner", teamId: "team-mex" })],
    teams,
    new Map([["M2", 3]]),
  );
  assert.equal(itemWithPoints.pointsEarned, 3);

  const itemZeroPoints = buildRecapItemForMatch(
    finishedMatch({ match_id: "m3", match_code: "M3" }),
    [slot({ predictionKind: "group_winner", teamId: "team-mex" })],
    teams,
    new Map([["M3", 0]]),
  );
  assert.equal(itemZeroPoints.pointsEarned, null);
}

// rank movement omitted when unavailable
{
  const recap = buildParticipantLatestRecap({
    matches: [finishedMatch({ match_id: "m1", match_code: "M1" })],
    slots: [slot({ predictionKind: "group_winner", teamId: "team-mex" })],
    teams,
  });
  assert.equal(recap.items[0]!.rankMovement, null);
}

// no picks -> no card
{
  const recap = buildParticipantLatestRecap({
    matches: [finishedMatch({ match_id: "m1", match_code: "M1" })],
    slots: [slot({ predictionKind: "group_winner", teamId: "" })],
    teams,
  });
  assert.equal(recap.showCard, false);
}

// match day subtitle formatting
{
  assert.ok(formatRecapMatchDaySubtitle("2026-06-12", Date.parse("2026-06-12T18:00:00Z")).includes("Today"));
  assert.ok(
    formatRecapMatchDaySubtitle("2026-06-11", Date.parse("2026-06-12T18:00:00Z")).includes("Yesterday"),
  );
}

// compact headline uses team names and score
{
  const headline = formatRecapMatchHeadline(
    finishedMatch({ match_id: "m1", match_code: "M1" }),
  );
  assert.ok(headline.includes("Mexico"));
  assert.ok(headline.includes("Korea Republic"));
}

// score-impact activity maps points by match code (participant-specific)
{
  const map = pointsByMatchCodeFromScoreImpactActivities(
    [
      {
        type: "ash_score_impact",
        metadata_json: {
          match_codes: ["M-NEW"],
          point_gainers: [
            { participant_id: "p1", points_gained: 3 },
            { participant_id: "p2", points_gained: 1 },
          ],
        },
      },
    ],
    "p1",
  );
  assert.equal(map.get("M-NEW"), 3);
  assert.equal(map.get("M-OTHER"), undefined);
}

// knockout completed match — helped when preferred winner wins despite other path eliminated
{
  const bra = {
    id: "team-bra",
    name: "Brazil",
    countryCode: "BRA",
    fifaCode: "BRA",
    fifaRank: 1,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  };
  const jpn = {
    id: "team-jpn",
    name: "Japan",
    countryCode: "JPN",
    fifaCode: "JPN",
    fifaRank: 2,
    fifaRankAsOf: null,
    createdAt: "",
    updatedAt: "",
  };
  const koTeams = [bra, jpn] satisfies Team[];
  const koMatch = finishedMatch({
    match_id: "r32-bra-jpn",
    match_code: "R32-BRA-JPN",
    stage_code: "round_of_32",
    stage_label: "Round of 32",
    group_code: null,
    home_team_name: "Brazil",
    home_country_code: "BRA",
    away_team_name: "Japan",
    away_country_code: "JPN",
    winner_team_name: "Brazil",
    winner_country_code: "BRA",
  });
  const koSlots = [
    slot({ predictionKind: "champion", teamId: "team-bra", groupCode: null }),
    slot({ predictionKind: "round_of_32", teamId: "team-jpn", groupCode: null }),
  ];
  const item = buildRecapItemForMatch(koMatch, koSlots, koTeams, undefined, [koMatch]);
  assert.equal(item.impact, "helped");
  assert.equal(recapBadgeKind(item), "helped");
  assert.ok(item.explanation.includes("Brazil advancing keeps your champion pick alive"));
  assert.ok(item.explanation.includes("Japan is now eliminated"));
  assert.ok(recapBadgeAlignsWithExplanation(item));
}

console.log("buildParticipantLatestRecap.selftest.ts: ok");
