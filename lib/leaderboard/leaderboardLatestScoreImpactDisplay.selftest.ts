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
    match_codes: ["M-UPSET"],
  },
  { hasValidSnapshot: true },
);

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
    match_codes: ["M1", "M2"],
    match_label: "Knockout results",
  },
  { hasValidSnapshot: true },
);
assert.equal(
  formatLatestMatchScoringLine(momentum(8), multiEvent),
  "Latest: +8 from 2-match update",
  "multi-match update label",
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

console.log("leaderboardLatestScoreImpactDisplay.selftest.ts: ok");
