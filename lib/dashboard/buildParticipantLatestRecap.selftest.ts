import assert from "node:assert";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { Team } from "../../src/types/domain";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import {
  buildParticipantLatestRecap,
  buildRecapItemForMatch,
  pointsByMatchCodeFromScoreImpactActivities,
  recentCompletedOfficialMatches,
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
  assert.equal(recap.items[0]!.matchId, "m-new");
  assert.equal(recap.items[0]!.impact, "helped");
  assert.ok(recap.items[0]!.explanation.includes("Mexico"));
  assert.ok(recap.items[0]!.explanation.includes("helped your bracket"));
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

// completed match with no relevant pick -> compact state
{
  const recap = buildParticipantLatestRecap({
    matches: [finishedMatch({ match_id: "m1", match_code: "M1" })],
    slots: [slot({ predictionKind: "group_winner", teamId: "team-fra", groupCode: "B" })],
    teams,
  });
  assert.equal(recap.showCard, true);
  assert.equal(recap.variant, "compact_neutral");
  assert.equal(recap.items.every((i) => !i.hasRelevantPick), true);
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

// score-impact activity maps points by match code
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
}

console.log("buildParticipantLatestRecap.selftest.ts: ok");
