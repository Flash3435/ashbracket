/**
 * Run: npx tsx lib/poolActivity/scoreImpact/buildBracketImpact.selftest.ts
 */
import assert from "node:assert/strict";
import type { PilotStandingsRow } from "@/lib/admin/pilotStandingsSnapshot";
import type { ChampionPickInput } from "@/lib/account/buildPoolReveal";
import type { Team } from "../../../src/types/domain";
import type { KnockoutPickSlotDraft } from "../../../types/adminKnockoutPicks";
import type { TournamentMatchPublicRow } from "../../../types/tournamentPublic";
import {
  buildBracketImpactForPool,
  classifyUpsetImpact,
  detectUniformPointsDelta,
  revertMatchesToBeforeResult,
} from "./buildBracketImpact";
import { buildParticipantTeamPicksFromPredictions as buildPicks } from "./buildSoftImpact";
import type { ParticipantBracketForExposure } from "@/lib/pool/buildKnockoutMatchExposure";
import { formatLeaderboardLatestImpactSummary } from "@/lib/leaderboard/leaderboardBracketImpactDisplay";
import { parseLatestScoreEventContext } from "@/lib/leaderboard/parseLatestScoreEventContext";

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
    home_team_name: "Underdog",
    home_country_code: "UND",
    away_team_name: "Favorite",
    away_country_code: "FAV",
    winner_team_name: "Underdog",
    winner_country_code: "UND",
    ...overrides,
  };
}

function standingsRow(
  participantId: string,
  displayName: string,
  totalPoints: number,
  rank: number,
): PilotStandingsRow {
  return { participantId, displayName, totalPoints, rank };
}

const teams = [
  team("team-und", "Underdog", "UND"),
  team("team-fav", "Favorite", "FAV"),
  team("team-neu", "Neutral", "NEU"),
];

const upsetMatch = knockoutMatch({
  match_id: "m-upset",
  match_code: "M-UPSET",
  stage_code: "round_of_32",
});

const beneficiaryBracket: ParticipantBracketForExposure = {
  participantId: "p-beneficiary",
  slots: [
    slot("r32|1", "round_of_32", "team-und", "1"),
    slot("r16|1", "round_of_16", "team-und", "1"),
    slot("champ", "champion", "team-und"),
  ],
};

const hurtBracket: ParticipantBracketForExposure = {
  participantId: "p-hurt",
  slots: [
    slot("r32|1", "round_of_32", "team-fav", "1"),
    slot("r16|1", "round_of_16", "team-fav", "1"),
    slot("champ", "champion", "team-fav"),
  ],
};

const neutralBracket: ParticipantBracketForExposure = {
  participantId: "p-neutral",
  slots: [slot("r32|1", "round_of_32", "team-neu", "1")],
};

const championPicks: ChampionPickInput[] = [
  {
    participantId: "p-beneficiary",
    participantDisplayName: "Beneficiary",
    teamId: "team-und",
    teamName: "Underdog",
    teamCode: "UND",
  },
  {
    participantId: "p-hurt",
    participantDisplayName: "Hurt",
    teamId: "team-fav",
    teamName: "Favorite",
    teamCode: "FAV",
  },
];

const predictions = [
  { participantId: "p-beneficiary", teamId: "team-und", predictionKind: "champion" },
  { participantId: "p-beneficiary", teamId: "team-und", predictionKind: "round_of_32" },
  { participantId: "p-hurt", teamId: "team-fav", predictionKind: "champion" },
  { participantId: "p-hurt", teamId: "team-fav", predictionKind: "round_of_32" },
  { participantId: "p-neutral", teamId: "team-neu", predictionKind: "round_of_32" },
];
const participantPicks = buildPicks(predictions);
const participantNames = new Map([
  ["p-beneficiary", "Beneficiary"],
  ["p-hurt", "Hurt"],
  ["p-neutral", "Neutral"],
]);

const beforeRows = [
  standingsRow("p-beneficiary", "Beneficiary", 134, 1),
  standingsRow("p-hurt", "Hurt", 134, 1),
  standingsRow("p-neutral", "Neutral", 134, 1),
];
const afterRows = beforeRows.map((row) => ({
  ...row,
  totalPoints: row.totalPoints + 4,
}));

assert.equal(
  detectUniformPointsDelta({ beforeRows, afterRows }),
  4,
  "uniform +4 detected for all participants",
);

const impact = buildBracketImpactForPool({
  participantBrackets: [beneficiaryBracket, hurtBracket, neutralBracket],
  participantNames,
  participantPicks,
  championPicks,
  teams,
  tournamentMatches: [upsetMatch],
  knockoutBracketPicksUnlocked: true,
  matchResults: [
    {
      matchCode: "M-UPSET",
      label: "Underdog 2–1 Favorite",
      groupCode: null,
      winnerTeamId: "team-und",
      homeTeamId: "team-und",
      awayTeamId: "team-fav",
      stageCode: "round_of_32",
    },
  ],
  beforeRows,
  afterRows,
});

assert.ok(impact, "upset produces meaningful bracket impact");
assert.equal(impact!.uniformPointsDelta, 4, "impact run records uniform points");

const beneficiary = impact!.rows.find((row) => row.participantId === "p-beneficiary");
const hurt = impact!.rows.find((row) => row.participantId === "p-hurt");
assert.ok(beneficiary?.pickedUpsetWinner, "beneficiary picked upset winner");
assert.ok(hurt?.pickedEliminatedTeam, "hurt participant had eliminated favorite");
assert.equal(hurt?.upsetImpact, "hurt", "favorite backer marked hurt");
assert.equal(beneficiary?.upsetImpact, "benefited", "upset backer marked benefited");
assert.equal(hurt?.championAliveBefore, true, "hurt had champion alive before");
assert.equal(hurt?.championAliveAfter, false, "hurt lost champion after upset");

const reverted = revertMatchesToBeforeResult([upsetMatch], ["M-UPSET"]);
assert.equal(reverted[0]!.status, "scheduled", "reverted match is no longer finished");
assert.equal(reverted[0]!.home_goals, null, "reverted match clears goals");

const event = parseLatestScoreEventContext(
  {
    match_label: "Underdog 2–1 Favorite",
    scoreline: "Underdog 2–1 Favorite",
    match_codes: ["M-UPSET"],
  },
  { hasValidSnapshot: true },
);

const hurtSummary = formatLeaderboardLatestImpactSummary({
  totalPoints: 138,
  momentum: {
    participantId: "p-hurt",
    previousRank: 1,
    currentRank: 1,
    rankChange: 0,
    previousPoints: 134,
    currentPoints: 138,
    recentPointsGained: 4,
    isNewEntry: false,
  },
  event,
  bracketImpact: hurt!,
});
assert.match(hurtSummary.latestLine ?? "", /Underdog def\. Favorite: \+4/);
assert.match(hurtSummary.impactLine ?? "", /Hurt by upset/);
assert.match(hurtSummary.impactLine ?? "", /Champion dead/);

assert.equal(
  classifyUpsetImpact({
    before: {
      livePathCount: 6,
      championAlive: true,
      finalistPathAlive: true,
      semifinalistPathAlive: false,
    },
    after: {
      livePathCount: 3,
      championAlive: false,
      finalistPathAlive: false,
      semifinalistPathAlive: false,
    },
    pickedUpsetWinner: false,
    pickedEliminatedTeam: true,
  }),
  "hurt",
  "classify hurt when champion and paths collapse",
);

console.log("buildBracketImpact.selftest.ts: ok");
