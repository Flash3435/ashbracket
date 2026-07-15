/**
 * Run: npx tsx lib/poolActivity/scoreImpact/deriveScoreImpactAttribution.selftest.ts
 */
import assert from "node:assert/strict";
import {
  buildScoreImpactMatchResultsFromMatchCodes,
  scoreImpactSignatureFromMatchResults,
} from "./buildScoreImpactMatchResults";
import {
  didThirdPlaceQualifiersNewlyScore,
  matchCodesForGroupAdvancementChanges,
  matchCodesForKnockoutFurthestChanges,
  resolveScoreImpactMatchCodes,
  resolveScoreImpactRunAttribution,
  snapshotThirdPlaceAdvancers,
  type MatchAttributionLike,
  type ResultAttributionSnapshot,
} from "./deriveScoreImpactAttribution";
import {
  buildLatestPointsBreakdownForParticipant,
  computeKnockoutOncePerTeamProgressionDelta,
} from "@/lib/leaderboard/computeLatestMatchPointsBreakdown";
import {
  formatLeaderboardLatestImpactSummary,
  formatThirdPlaceScoringCorrectionLine,
} from "@/lib/leaderboard/leaderboardBracketImpactDisplay";
import { parseLatestScoreEventContext } from "@/lib/leaderboard/parseLatestScoreEventContext";
import { THIRD_PLACE_SCORING_CORRECTION_LABEL } from "@/lib/leaderboard/scoringCorrectionDisplay";
import type { LeaderboardMomentumRow } from "@/lib/leaderboard/buildLeaderboardMomentum";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

let failed = 0;
function t(cond: boolean, msg: string) {
  if (!cond) {
    failed += 1;
    console.error(`FAIL: ${msg}`);
  } else {
    console.log(`ok — ${msg}`);
  }
}

const SPAIN = "team-spain";
const FRANCE = "team-france";
const ARGENTINA = "team-argentina";
const ENGLAND = "team-england";

const eightThirdPlace = Array.from({ length: 8 }, (_, i) => ({
  kind: "third_place_qualifier",
  teamId: `tp-${i}`,
  slotKey: String(i + 1),
  groupCode: null,
})) satisfies ResultAttributionSnapshot[];

const m101: MatchAttributionLike = {
  matchCode: "M101",
  stageCode: "semifinal",
  groupCode: null,
  winnerTeamId: SPAIN,
  scoringResultKind: "finalist",
  homeGoals: 0,
  awayGoals: 2,
};

const m100: MatchAttributionLike = {
  matchCode: "M100",
  stageCode: "semifinal",
  groupCode: null,
  winnerTeamId: ARGENTINA,
  scoringResultKind: "finalist",
  homeGoals: 3,
  awayGoals: 1,
};

const m99: MatchAttributionLike = {
  matchCode: "M99",
  stageCode: "quarterfinal",
  groupCode: null,
  winnerTeamId: ENGLAND,
  scoringResultKind: "semifinalist",
  homeGoals: 1,
  awayGoals: 2,
};

// --- 1. Identical third-place recreate: upsert analog but newly-scored false ---
{
  const before = snapshotThirdPlaceAdvancers(eightThirdPlace);
  const after = snapshotThirdPlaceAdvancers(eightThirdPlace);
  t(before.settled && after.settled, "identical third-place snapshots are settled");
  t(
    didThirdPlaceQualifiersNewlyScore(before, after) === false,
    "recreated identical advancers → correction flag false",
  );
  const run = resolveScoreImpactRunAttribution({
    beforeResults: [
      ...eightThirdPlace,
      { kind: "semifinalist", teamId: SPAIN, slotKey: "2", groupCode: null },
      { kind: "finalist", teamId: SPAIN, slotKey: "1", groupCode: null },
    ],
    afterResults: [
      ...eightThirdPlace,
      { kind: "semifinalist", teamId: SPAIN, slotKey: "2", groupCode: null },
      { kind: "finalist", teamId: SPAIN, slotKey: "1", groupCode: null },
    ],
    matches: [m101],
  });
  t(
    run.thirdPlaceQualifiersNewlyScored === false,
    "idempotent sync with upsert-style recreate → thirdPlaceQualifiersNewlyScored false",
  );
  t(run.matchCodes.length === 0, "idempotent result state → no match attribution");
}

// --- 2. Legitimate first-time delayed third-place scoring ---
{
  const before = snapshotThirdPlaceAdvancers([
    { kind: "semifinalist", teamId: SPAIN, slotKey: "2", groupCode: null },
  ]);
  const after = snapshotThirdPlaceAdvancers(eightThirdPlace);
  t(before.settled === false, "before third-place unsettled");
  t(after.settled === true, "after third-place settled");
  t(
    didThirdPlaceQualifiersNewlyScore(before, after) === true,
    "first settle → correction flag true",
  );
  t(
    THIRD_PLACE_SCORING_CORRECTION_LABEL.length > 0,
    "third-place correction copy label still available",
  );
}

// Advancer set change also counts
{
  const before = snapshotThirdPlaceAdvancers(eightThirdPlace);
  const afterRows = eightThirdPlace.map((row, i) =>
    i === 0 ? { ...row, teamId: "tp-replaced" } : row,
  );
  const after = snapshotThirdPlaceAdvancers(afterRows);
  t(
    didThirdPlaceQualifiersNewlyScore(before, after) === true,
    "changed advancer set → correction flag true",
  );
}

// --- 3. Patch-less M101 Spain SF → finalist ---
{
  const beforeResults: ResultAttributionSnapshot[] = [
    ...eightThirdPlace,
    { kind: "semifinalist", teamId: SPAIN, slotKey: "2", groupCode: null },
    { kind: "semifinalist", teamId: FRANCE, slotKey: "1", groupCode: null },
  ];
  const afterResults: ResultAttributionSnapshot[] = [
    ...eightThirdPlace,
    { kind: "semifinalist", teamId: SPAIN, slotKey: "2", groupCode: null },
    { kind: "semifinalist", teamId: FRANCE, slotKey: "1", groupCode: null },
    { kind: "finalist", teamId: SPAIN, slotKey: "1", groupCode: null },
  ];

  const codes = matchCodesForKnockoutFurthestChanges({
    beforeResults,
    afterResults,
    matches: [m101, m100, m99],
  });
  t(codes.length === 1 && codes[0] === "M101", "Spain SF→finalist attributes M101 only");

  const run = resolveScoreImpactRunAttribution({
    beforeResults,
    afterResults,
    matches: [m101, m100, m99],
  });
  t(run.matchCodes.join(",") === "M101", "patch-less resolve yields M101");
  t(
    run.thirdPlaceQualifiersNewlyScored === false,
    "Spain progression does not set third-place correction flag",
  );

  const teamNameById = new Map([
    [SPAIN, "Spain"],
    [FRANCE, "France"],
  ]);
  const matchResults = buildScoreImpactMatchResultsFromMatchCodes({
    matches: [
      {
        match_code: "M101",
        group_code: null,
        stage_code: "semifinal",
        home_team_id: FRANCE,
        away_team_id: SPAIN,
        home_goals: 0,
        away_goals: 2,
        winner_team_id: SPAIN,
      },
    ],
    matchCodes: run.matchCodes,
    teamNameById,
  });
  t(
    matchResults[0]?.label === "France 0–2 Spain",
    "score-impact label is France 0–2 Spain",
  );
  t(
    scoreImpactSignatureFromMatchResults(matchResults) !== "no-match-change",
    "attributed recompute is not no-match-change",
  );

  const metadata = {
    match_codes: run.matchCodes,
    match_label: matchResults[0]!.label,
    scoreline: matchResults[0]!.label,
    trigger: "tournament_sync",
    scoring_corrections: run.thirdPlaceQualifiersNewlyScored
      ? [{ kind: "third_place_qualifier" }]
      : undefined,
  };
  const event = parseLatestScoreEventContext(metadata, { hasValidSnapshot: true });
  t(event.eventKind === "single_match", "event kind is single_match");
  t(
    event.matchupShortLabel === "Spain def. France",
    "matchup short label is Spain def. France",
  );
  t(
    event.scoringCorrectionKinds.length === 0,
    "parsed event has no third-place correction kinds",
  );

  const rules = new Map([
    ["semifinalist", 16],
    ["finalist", 24],
    ["third_place_qualifier", 4],
  ]);
  const m101Attr = {
    matchCode: "M101",
    stageCode: "semifinal",
    groupCode: null,
    homeTeamId: FRANCE,
    awayTeamId: SPAIN,
    winnerTeamId: SPAIN,
    scoringResultKind: "finalist",
    scoringSlotKey: "1",
  };
  const spainDeltaCapped = computeKnockoutOncePerTeamProgressionDelta(
    [
      {
        participantId: "p1",
        predictionKind: "round_of_16",
        teamId: SPAIN,
        slotKey: "12",
      },
      {
        participantId: "p1",
        predictionKind: "semifinalist",
        teamId: SPAIN,
        slotKey: "2",
      },
    ],
    m101Attr,
    rules,
  );
  t(spainDeltaCapped === 0, "Spain SF-predicted progression delta is +0 after M101");

  const spainDeltaFinalistPred = computeKnockoutOncePerTeamProgressionDelta(
    [
      {
        participantId: "p1",
        predictionKind: "finalist",
        teamId: SPAIN,
        slotKey: "1",
      },
    ],
    m101Attr,
    rules,
  );
  t(spainDeltaFinalistPred === 8, "Spain finalist-predicted progression delta is +8");

  function momentum(participantId: string, gained: number): LeaderboardMomentumRow {
    return {
      participantId,
      previousRank: 1,
      currentRank: 1,
      rankChange: 0,
      previousPoints: 100,
      currentPoints: 100 + gained,
      recentPointsGained: gained,
      isNewEntry: false,
    };
  }

  // --- 4. Pre-existing TP points + Spain +8 must not label third-place ---
  {
    const breakdown = buildLatestPointsBreakdownForParticipant({
      participantId: "p-tp",
      momentum: momentum("p-tp", 8),
      event,
      predictions: [
        {
          participantId: "p-tp",
          predictionKind: "finalist",
          teamId: SPAIN,
          slotKey: "1",
        },
        {
          participantId: "p-tp",
          predictionKind: "third_place_qualifier",
          teamId: "tp-0",
          slotKey: "1",
        },
        {
          participantId: "p-tp",
          predictionKind: "third_place_qualifier",
          teamId: "tp-1",
          slotKey: "2",
        },
      ],
      matches: [m101Attr],
      rulesByKind: rules,
      officialThirdPlaceAdvancerTeamIds: new Set(
        eightThirdPlace.map((r) => r.teamId!),
      ),
      thirdPlaceQualifiersSettled: true,
      thirdPlaceCorrectionInEvent: false,
    });
    assert.equal(breakdown?.latestMatchPointsDelta, 8);
    assert.equal(breakdown?.thirdPlaceQualifierDelta, null);
    t(
      formatThirdPlaceScoringCorrectionLine(breakdown) === null,
      "participant with TP ledger + Spain +8 → no correction line",
    );
    const summary = formatLeaderboardLatestImpactSummary({
      totalPoints: 108,
      momentum: momentum("p-tp", 8),
      event,
      pointsBreakdown: breakdown,
    });
    t(
      summary.latestLine === "Spain def. France: +8",
      "leaderboard renders Spain def. France: +8",
    );
  }

  // --- 5. No TP ledger + Spain +8 ---
  {
    const breakdown = buildLatestPointsBreakdownForParticipant({
      participantId: "p-no-tp",
      momentum: momentum("p-no-tp", 8),
      event,
      predictions: [
        {
          participantId: "p-no-tp",
          predictionKind: "finalist",
          teamId: SPAIN,
          slotKey: "1",
        },
      ],
      matches: [m101Attr],
      rulesByKind: rules,
      officialThirdPlaceAdvancerTeamIds: new Set(
        eightThirdPlace.map((r) => r.teamId!),
      ),
      thirdPlaceQualifiersSettled: true,
      thirdPlaceCorrectionInEvent: false,
    });
    assert.equal(breakdown?.latestMatchPointsDelta, 8);
    assert.equal(breakdown?.thirdPlaceQualifierDelta, null);
    const summary = formatLeaderboardLatestImpactSummary({
      totalPoints: 108,
      momentum: momentum("p-no-tp", 8),
      event,
      pointsBreakdown: breakdown,
    });
    t(
      summary.latestLine === "Spain def. France: +8",
      "no-TP participant also gets Spain def. France: +8",
    );
  }
}

// --- 6. Multiple affected matches ---
{
  const beforeResults: ResultAttributionSnapshot[] = [
    { kind: "quarterfinalist", teamId: ENGLAND, slotKey: "3", groupCode: null },
    { kind: "semifinalist", teamId: SPAIN, slotKey: "2", groupCode: null },
  ];
  const afterResults: ResultAttributionSnapshot[] = [
    { kind: "quarterfinalist", teamId: ENGLAND, slotKey: "3", groupCode: null },
    { kind: "semifinalist", teamId: ENGLAND, slotKey: "3", groupCode: null },
    { kind: "semifinalist", teamId: SPAIN, slotKey: "2", groupCode: null },
    { kind: "finalist", teamId: SPAIN, slotKey: "1", groupCode: null },
  ];
  const codes = resolveScoreImpactMatchCodes({
    beforeResults,
    afterResults,
    matches: [m101, m100, m99],
  });
  t(
    codes.join(",") === "M101,M99",
    "multi-match furthest changes attribute M101 and M99 deterministically",
  );
}

// Group advancement change uses finished group matches
{
  const beforeResults: ResultAttributionSnapshot[] = [];
  const afterResults: ResultAttributionSnapshot[] = [
    {
      kind: "group_winner",
      teamId: "team-a",
      slotKey: null,
      groupCode: "A",
    },
    {
      kind: "group_runner_up",
      teamId: "team-b",
      slotKey: null,
      groupCode: "A",
    },
  ];
  const groupMatches: MatchAttributionLike[] = [
    {
      matchCode: "WC2026-G-A-05",
      stageCode: "group",
      groupCode: "A",
      winnerTeamId: "team-a",
      scoringResultKind: null,
      homeGoals: 1,
      awayGoals: 0,
    },
    {
      matchCode: "WC2026-G-A-06",
      stageCode: "group",
      groupCode: "A",
      winnerTeamId: "team-b",
      scoringResultKind: null,
      homeGoals: 2,
      awayGoals: 2,
    },
  ];
  const codes = matchCodesForGroupAdvancementChanges({
    beforeResults,
    afterResults,
    matches: groupMatches,
  });
  t(
    codes.join(",") === "WC2026-G-A-05,WC2026-G-A-06",
    "group settlement attributes finished group matches",
  );
  const dirtyOnly = matchCodesForGroupAdvancementChanges({
    beforeResults,
    afterResults,
    matches: groupMatches,
    dirtyMatchCodes: ["WC2026-G-A-06"],
  });
  t(
    dirtyOnly.join(",") === "WC2026-G-A-06",
    "dirty codes preferred inside a changed group",
  );
}

// --- 7. Applied patches still win (existing workflows) ---
{
  const codes = resolveScoreImpactMatchCodes({
    appliedPatchCodes: ["M100"],
    beforeResults: [
      { kind: "semifinalist", teamId: SPAIN, slotKey: "2", groupCode: null },
    ],
    afterResults: [
      { kind: "semifinalist", teamId: SPAIN, slotKey: "2", groupCode: null },
      { kind: "finalist", teamId: SPAIN, slotKey: "1", groupCode: null },
    ],
    matches: [m101, m100],
  });
  t(
    codes.join(",") === "M100",
    "explicit patches override result-delta attribution",
  );
}

// Do not attribute unrelated latest finished match when results unchanged
{
  const codes = resolveScoreImpactMatchCodes({
    beforeResults: [
      { kind: "finalist", teamId: SPAIN, slotKey: "1", groupCode: null },
    ],
    afterResults: [
      { kind: "finalist", teamId: SPAIN, slotKey: "1", groupCode: null },
    ],
    matches: [m101, m100],
    dirtyMatchCodes: [],
  });
  t(codes.length === 0, "unchanged results → never guess latest finished match");
}

// --- Sync wiring source checks ---
{
  const syncSrc = readFileSync(
    join(here, "../../tournament/syncOfficialTournament.ts"),
    "utf8",
  );
  t(
    syncSrc.includes("resolveScoreImpactRunAttribution"),
    "sync uses resolveScoreImpactRunAttribution",
  );
  t(
    !/thirdPlaceQualifiersNewlyScored:\s*thirdPlaceEnsure\.upsertedCount\s*>\s*0/.test(
      syncSrc,
    ),
    "sync no longer sets correction flag from upsertedCount",
  );
  t(
    syncSrc.includes("buildScoreImpactMatchResultsFromMatchCodes"),
    "sync can build match results from inferred codes",
  );
  t(
    syncSrc.includes("scoreImpactAttribution.thirdPlaceQualifiersNewlyScored"),
    "backfill notice gated on real third-place scoring change",
  );
}

if (failed > 0) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll deriveScoreImpactAttribution selftests passed.");
