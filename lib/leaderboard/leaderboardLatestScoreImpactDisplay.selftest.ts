/**
 * Run: npx tsx lib/leaderboard/leaderboardLatestScoreImpactDisplay.selftest.ts
 */
import assert from "node:assert/strict";
import {
  formatLatestMatchScoringLine,
  formatLeaderboardLatestImpactSummary,
  formatBracketImpactSummaryLines,
} from "./leaderboardBracketImpactDisplay";
import { parseLatestScoreEventContext } from "./parseLatestScoreEventContext";
import type { LeaderboardMomentumRow } from "./buildLeaderboardMomentum";
import type { BracketImpactParticipantRow } from "@/lib/poolActivity/scoreImpact/buildBracketImpact";
import { buildScoreImpactMetadata } from "@/lib/poolActivity/scoreImpact/buildScoreImpactMetadata";
import { detectScoreImpact } from "@/lib/poolActivity/scoreImpact/detectScoreImpact";
import { buildScoreImpactMatchResultsFromMatchCodes } from "@/lib/poolActivity/scoreImpact/buildScoreImpactMatchResults";

function momentum(points: number, rankChange = 0): LeaderboardMomentumRow {
  return {
    participantId: "p1",
    previousRank: 1,
    currentRank: 1,
    rankChange,
    previousPoints: 134,
    currentPoints: 134 + points,
    recentPointsGained: points,
    isNewEntry: false,
  };
}

const event = parseLatestScoreEventContext(
  {
    match_label: "Morocco 2–1 Canada",
    scoreline: "Morocco 2–1 Canada",
    match_codes: ["M90"],
  },
  { hasValidSnapshot: true },
);

assert.equal(event.eventKind, "single_match");
assert.equal(event.isSingleMatch, true);
assert.equal(event.winnerTeamName, "Morocco");
assert.equal(event.loserTeamName, "Canada");
assert.equal(event.matchupShortLabel, "Morocco def. Canada");

assert.equal(
  formatLatestMatchScoringLine(momentum(4), event),
  "Morocco def. Canada: +4",
  "single-match label with participant points",
);

assert.equal(
  formatLatestMatchScoringLine(momentum(0), event),
  "Morocco def. Canada: +0",
  "zero points still shows latest match",
);

const upsetBackerImpact: BracketImpactParticipantRow = {
  participantId: "p1",
  displayName: "Backer",
  livePathsBefore: 5,
  livePathsAfter: 6,
  livePathsDelta: 1,
  championAliveBefore: true,
  championAliveAfter: true,
  finalistPathAliveBefore: false,
  finalistPathAliveAfter: false,
  semifinalistPathAliveBefore: false,
  semifinalistPathAliveAfter: false,
  pickedUpsetWinner: true,
  pickedEliminatedTeam: false,
  upsetImpact: "benefited",
};

assert.equal(
  formatLatestMatchScoringLine(momentum(4), event, upsetBackerImpact),
  "Latest: Morocco upset +4",
  "upset backer gets upset-specific latest line",
);

const multiEvent = parseLatestScoreEventContext(
  {
    match_codes: ["M89", "M90"],
    match_label: "Knockout results",
  },
  { hasValidSnapshot: true },
);
assert.equal(multiEvent.eventKind, "multi_match");
assert.equal(
  formatLatestMatchScoringLine(momentum(8), multiEvent),
  "Latest update: +8 from 2 matches",
  "multi-match update label",
);

const noMatchEvent = parseLatestScoreEventContext(
  {
    match_codes: [],
    trigger: "tournament_sync",
    has_previous_snapshot: true,
  },
  { hasValidSnapshot: true },
);
assert.equal(noMatchEvent.eventKind, "scoring_refresh");
assert.equal(noMatchEvent.matchCount, 0);
const noMatchLine = formatLatestMatchScoringLine(momentum(4), noMatchEvent);
assert.equal(noMatchLine, "Scoring refresh: +4", "pool recalc without match metadata");
assert.ok(
  !noMatchLine?.includes("0-match"),
  "must never show 0-match update copy",
);

const refreshEvent = parseLatestScoreEventContext(
  {
    match_codes: [],
    trigger: "admin_manual_recompute",
  },
  { hasValidSnapshot: true },
);
assert.equal(refreshEvent.eventKind, "scoring_refresh");
assert.equal(
  formatLatestMatchScoringLine(momentum(4), refreshEvent),
  "Scoring refresh: +4",
  "manual recompute without match metadata",
);

const bracketImpactEvent = parseLatestScoreEventContext(
  {
    match_codes: [],
    bracket_impact: {
      winner_team_name: "Morocco",
      loser_team_name: "Canada",
    },
  },
  { hasValidSnapshot: true },
);
assert.equal(bracketImpactEvent.eventKind, "single_match");
assert.equal(
  formatLatestMatchScoringLine(momentum(4), bracketImpactEvent),
  "Morocco def. Canada: +4",
  "bracket_impact winner/loser fills single-match label",
);

const hurtImpact: BracketImpactParticipantRow = {
  ...upsetBackerImpact,
  participantId: "p2",
  displayName: "Hurt",
  livePathsBefore: 9,
  livePathsAfter: 6,
  livePathsDelta: -3,
  championAliveBefore: true,
  championAliveAfter: false,
  pickedUpsetWinner: false,
  pickedEliminatedTeam: true,
  upsetImpact: "hurt",
};

const summary = formatLeaderboardLatestImpactSummary({
  totalPoints: 138,
  momentum: momentum(4),
  event,
  bracketImpact: hurtImpact,
});

assert.equal(summary.latestLine, "Morocco def. Canada: +4");
assert.equal(summary.otherScoringLine, null);
assert.match(summary.impactLine ?? "", /6 live paths \(−3\)/);
assert.match(summary.impactLine ?? "", /Champion dead/);
assert.match(summary.impactLine ?? "", /Hurt by upset/);

const uniformLines = formatBracketImpactSummaryLines({
  uniformPointsDelta: 4,
  affectedCount: 42,
  summary: {
    champion_lost_count: 8,
    finalist_lost_count: 3,
    upset_winner_kept_count: 12,
    benefited_count: 12,
    hurt_count: 8,
    biggest_winners: [{ display_name: "A", live_paths_delta: 2 }],
    biggest_losers: [{ display_name: "B", live_paths_delta: -4 }],
  },
  hasRankMovement: false,
  event,
});

assert.match(
  uniformLines[0] ?? "",
  /All 42 participants gained \+4 from Morocco def\. Canada/,
);
assert.match(uniformLines[1] ?? "", /race changed through bracket paths/i);

const moroccoMatchResults = buildScoreImpactMatchResultsFromMatchCodes({
  matches: [
    {
      match_code: "M90",
      group_code: null,
      stage_code: "knockout",
      home_team_id: "team-morocco",
      away_team_id: "team-canada",
      home_goals: 2,
      away_goals: 1,
      winner_team_id: "team-morocco",
    },
  ],
  matchCodes: ["M90"],
  teamNameById: new Map([
    ["team-morocco", "Morocco"],
    ["team-canada", "Canada"],
  ]),
});
assert.equal(moroccoMatchResults.length, 1);
assert.equal(moroccoMatchResults[0]!.matchCode, "M90");
assert.match(moroccoMatchResults[0]!.label, /Morocco 2–1 Canada/);

const row = (
  participantId: string,
  displayName: string,
  totalPoints: number,
  rank: number,
) => ({
  participantId,
  displayName,
  totalPoints,
  rank,
});

const beforeRows = [row("p1", "Emil", 134, 1)];
const afterRows = [row("p1", "Emil", 138, 1)];
const analysis = detectScoreImpact({
  beforeRows,
  afterRows,
  matchResults: moroccoMatchResults,
});
const persistedMetadata = buildScoreImpactMetadata({
  analysis,
  beforeRows,
  afterRows,
  matchResults: moroccoMatchResults,
  participantNames: new Map([["p1", "Emil"]]),
  trigger: "tournament_sync",
  sourceKey: "test",
  standingsHash: "hash",
  scoreSignature: "sig",
});
assert.deepEqual(persistedMetadata.match_codes, ["M90"]);
assert.equal(persistedMetadata.match_id, "M90");
assert.match(persistedMetadata.match_label ?? "", /Morocco 2–1 Canada/);

// Single-match upset: mixed +4 / +0 with match label
const norwayEvent = parseLatestScoreEventContext(
  {
    match_label: "Brazil 1–2 Norway",
    scoreline: "Brazil 1–2 Norway",
    match_codes: ["M91"],
  },
  { hasValidSnapshot: true },
);
assert.equal(norwayEvent.matchupShortLabel, "Norway def. Brazil");
assert.equal(
  formatLatestMatchScoringLine(momentum(4), norwayEvent),
  "Norway def. Brazil: +4",
);
assert.equal(
  formatLatestMatchScoringLine(momentum(0), norwayEvent),
  "Norway def. Brazil: +0",
);

// Generic recompute without match metadata
const genericRecompute = parseLatestScoreEventContext(
  { match_codes: [], trigger: "admin_manual_recompute" },
  { hasValidSnapshot: true },
);
assert.equal(genericRecompute.eventKind, "scoring_refresh");
assert.equal(
  formatLatestMatchScoringLine(momentum(4), genericRecompute),
  "Scoring refresh: +4",
);

// Missing match metadata on tournament_sync — no match implication
const missingMeta = parseLatestScoreEventContext(
  { match_codes: [], trigger: "tournament_sync" },
  { hasValidSnapshot: true },
);
assert.equal(missingMeta.eventKind, "scoring_refresh");
assert.equal(missingMeta.isSingleMatch, false);
assert.equal(
  formatLatestMatchScoringLine(momentum(4), missingMeta),
  "Scoring refresh: +4",
);

console.log("leaderboardLatestScoreImpactDisplay.selftest.ts: ok");
