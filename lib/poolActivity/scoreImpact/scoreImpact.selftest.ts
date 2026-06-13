import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { PilotStandingsRow } from "@/lib/admin/pilotStandingsSnapshot";
import { buildScoreImpactCommentary } from "./buildScoreImpactCommentary";
import {
  buildScoreImpactDisplayLines,
  clientSafeScoreImpactMetadata,
  parseScoreImpactMetadata,
} from "./buildScoreImpactDisplay";
import { buildScoreImpactMetadata } from "./buildScoreImpactMetadata";
import {
  detectScoreImpact,
  scoreImpactHasMeaningfulChange,
} from "./detectScoreImpact";
import {
  buildScoreImpactDedupKey,
  buildScoreSignatureFromMatches,
} from "./scoreImpactDedupKey";
import { isScoreImpactLedgerTrigger, poolMatchesEditionSimulationScope } from "./scoreImpactTriggers";
import type { BonusLeaderSnapshot, ScoreImpactMatchResult } from "./types";

let failed = 0;
function t(cond: boolean, msg: string) {
  if (!cond) {
    failed++;
    console.error("FAIL:", msg);
  }
}

function row(
  participantId: string,
  displayName: string,
  totalPoints: number,
  rank: number,
): PilotStandingsRow {
  return { participantId, displayName, totalPoints, rank };
}

const unchangedBefore = [
  row("p1", "Amanda", 10, 1),
  row("p2", "Kris", 8, 2),
  row("p3", "Zach", 6, 3),
];
const unchangedAfter = [...unchangedBefore];

t(
  !scoreImpactHasMeaningfulChange(
    detectScoreImpact({ beforeRows: unchangedBefore, afterRows: unchangedAfter }),
  ),
  "no score changes → no meaningful impact",
);
t(
  buildScoreImpactCommentary(
    detectScoreImpact({ beforeRows: unchangedBefore, afterRows: unchangedAfter }),
  ) === null,
  "no score changes → no commentary",
);

const matchNoPoints: ScoreImpactMatchResult = {
  matchCode: "WC2026-G-A-01",
  label: "Mexico 2–1 South Africa",
  groupCode: "A",
  winnerTeamId: "mexico",
  stageCode: "group",
};
const noPointsAnalysis = detectScoreImpact({
  beforeRows: unchangedBefore,
  afterRows: unchangedAfter,
  matchResults: [matchNoPoints],
});
t(scoreImpactHasMeaningfulChange(noPointsAnalysis), "recorded score with no points is meaningful");
t(noPointsAnalysis.reason === "group_incomplete", "incomplete group reason");
t(noPointsAnalysis.pointGainers.length === 0, "group incomplete produces no top gainers");
const noPointsCommentary = buildScoreImpactCommentary(noPointsAnalysis);
t(
  noPointsCommentary?.includes("Mexico 2–1 South Africa is final") === true,
  "informational item mentions match result as final",
);
t(
  noPointsCommentary?.includes("No pool points yet") === true ||
    noPointsCommentary?.includes("No scoring change yet") === true ||
    noPointsCommentary?.includes("Standings hold for now") === true,
  "informational item uses concise no-points copy",
);
t(
  !noPointsCommentary?.includes("winner and runner-up points land after all six"),
  "no long repetitive group explanation",
);

const afterPoints: PilotStandingsRow[] = [
  row("p1", "Amanda", 10, 1),
  row("p3", "Zach", 18, 2),
  row("p2", "Kris", 8, 3),
];
const pointsAnalysis = detectScoreImpact({
  beforeRows: unchangedBefore,
  afterRows: afterPoints,
  matchResults: [
    {
      matchCode: "WC2026-G-A-06",
      label: "Brazil 2–0 Haiti",
      groupCode: "A",
      winnerTeamId: "brazil",
      stageCode: "group",
    },
  ],
});
t(pointsAnalysis.pointsChanged, "points changed detected");
t(pointsAnalysis.reason === "group_complete", "points on group match → group complete reason");
const pointsCommentary = buildScoreImpactCommentary(pointsAnalysis);
t(
  pointsCommentary?.includes("Zach +12") === true,
  "points changed mentions top gainer with compact delta",
);
t(
  pointsCommentary?.includes("jumped from 3rd to 2nd") === true,
  "leaderboard mover detected with from/to ranks",
);
t(
  pointsCommentary?.includes("gained points") === true,
  "points changed mentions affected bracket count",
);

const participantNames = new Map([
  ["p1", "Nish"],
  ["p2", "Aditi"],
  ["p3", "Flash"],
]);
const afterManyPoints: PilotStandingsRow[] = [
  row("p1", "Nish", 16, 2),
  row("p2", "Aditi", 14, 3),
  row("p3", "Flash", 18, 1),
];
const manyGainersAnalysis = detectScoreImpact({
  beforeRows: unchangedBefore,
  afterRows: afterManyPoints,
  matchResults: [
    {
      matchCode: "WC2026-G-B-01",
      label: "Brazil 2–0 Haiti",
      groupCode: "B",
      winnerTeamId: "brazil",
      stageCode: "group",
    },
  ],
  bracketsScoredCount: 3,
});
const metadata = buildScoreImpactMetadata({
  analysis: manyGainersAnalysis,
  matchResults: [
    {
      matchCode: "WC2026-G-B-01",
      label: "Brazil 2–0 Haiti",
      groupCode: "B",
      winnerTeamId: "brazil",
      stageCode: "group",
    },
  ],
  participantNames,
  trigger: "tournament_sync",
  sourceKey: "score_impact:v1:test",
  standingsHash: "hash",
  scoreSignature: "sig",
});
t(metadata.points_changed === true, "metadata points_changed flag");
t(metadata.affected_count === 3, "metadata affected_count");
t(metadata.top_gainers.length === 3, "metadata top 3 gainers");
t(
  metadata.top_gainers.every((g) => !("participant_id" in g)),
  "top_gainers metadata has no participant_id",
);
t(
  metadata.point_gainers?.every((g) => g.participant_id.startsWith("p")) === true,
  "server point_gainers retain participant_id for recap",
);

const displayLocked = buildScoreImpactDisplayLines(metadata, {
  allowParticipantNames: true,
});
t(
  displayLocked?.headline.includes("Group B is complete") === true,
  "display headline from metadata for completed group",
);
t(
  displayLocked?.detailLines.some((l) => l.startsWith("Biggest boost:")) === true,
  "display shows top gainers when names allowed",
);
t(displayLocked?.showLeaderboardLink === true, "display offers leaderboard link when points changed");

const displayPreLock = buildScoreImpactDisplayLines(metadata, {
  allowParticipantNames: false,
});
t(
  !displayPreLock?.detailLines.some((l) => l.includes("Nish")),
  "participant names hidden before lock / when not allowed",
);
t(
  displayPreLock?.detailLines.some((l) => l.includes("brackets gained points")) === true,
  "bracket count still shown without names",
);

const noPointsMeta = buildScoreImpactMetadata({
  analysis: noPointsAnalysis,
  matchResults: [matchNoPoints],
  participantNames,
  trigger: "tournament_sync",
  sourceKey: "score_impact:v1:nopoints",
  standingsHash: "hash2",
  scoreSignature: "sig2",
});
t(noPointsMeta.top_gainers.length === 0, "no-points metadata has empty top_gainers");
const noPointsDisplay = buildScoreImpactDisplayLines(noPointsMeta, {
  allowParticipantNames: true,
});
t(
  noPointsDisplay?.detailLines.some(
    (l) => l.includes("Group A") && (l.includes("No pool points yet") || l.includes("No scoring change yet")),
  ) === true,
  "no-points display uses concise group note",
);

const parsed = parseScoreImpactMetadata(metadata);
t(parsed.pointsChanged === true, "parse metadata points_changed");
t(parsed.topGainers.length === 3, "parse metadata top gainers");

const clientSafe = clientSafeScoreImpactMetadata(metadata as unknown as Record<string, unknown>);
t(!("point_gainers" in clientSafe), "client-safe metadata strips point_gainers");
const serialized = JSON.stringify(clientSafe);
t(!serialized.includes("@"), "no emails in client-safe metadata json");
t(!/"participant_id"/.test(serialized), "no participant_id in client-safe metadata json");

const beforeBonus: BonusLeaderSnapshot = {
  mostGoalsTeamId: "t1",
  mostYellowCardsTeamId: "t2",
  mostRedCardsTeamId: null,
};
const afterBonus: BonusLeaderSnapshot = {
  mostGoalsTeamId: "t3",
  mostYellowCardsTeamId: "t2",
  mostRedCardsTeamId: null,
};
const teamNames = new Map([
  ["t1", "Brazil"],
  ["t2", "France"],
  ["t3", "Germany"],
]);
const bonusAnalysis = detectScoreImpact({
  beforeRows: unchangedBefore,
  afterRows: unchangedAfter,
  beforeBonusLeaders: beforeBonus,
  afterBonusLeaders: afterBonus,
  teamNameById: teamNames,
});
t(
  bonusAnalysis.bonusLeaderNotes.some((n) => n.includes("Germany")) === true,
  "bonus leader changed",
);
t(bonusAnalysis.reason === "bonus_update", "bonus-only reason");
const bonusCommentary = buildScoreImpactCommentary(bonusAnalysis);
t(
  bonusCommentary?.includes("Germany") === true,
  "bonus commentary mentions new leader",
);

const signature = buildScoreSignatureFromMatches([
  { matchCode: "WC2026-G-A-01", label: "Mexico 2–1 South Africa" },
]);
const dedupeA = buildScoreImpactDedupKey({
  poolId: "pool-1",
  trigger: "tournament_sync",
  afterStandingsHash: "abc123",
  scoreSignature: signature,
});
const dedupeB = buildScoreImpactDedupKey({
  poolId: "pool-1",
  trigger: "tournament_sync",
  afterStandingsHash: "abc123",
  scoreSignature: signature,
});
t(dedupeA === dedupeB, "rerun same update → stable dedupe key");
t(dedupeA.startsWith("score_impact:v1:"), "dedupe key uses score_impact prefix");

const correctedSignature = buildScoreSignatureFromMatches([
  { matchCode: "WC2026-G-A-01", label: "Mexico 3–1 South Africa" },
]);
t(
  dedupeA !==
    buildScoreImpactDedupKey({
      poolId: "pool-1",
      trigger: "tournament_sync",
      afterStandingsHash: "def456",
      scoreSignature: correctedSignature,
    }),
  "corrected score produces different dedupe key",
);

t(isScoreImpactLedgerTrigger("participant_save") === false, "participant save is not score impact trigger");
t(isScoreImpactLedgerTrigger("tournament_sync") === true, "tournament sync is score impact trigger");

t(
  poolMatchesEditionSimulationScope(false, false) === true,
  "live pool matches live edition scope",
);
t(
  poolMatchesEditionSimulationScope(true, true) === true,
  "simulation pool matches simulation edition scope",
);
t(
  poolMatchesEditionSimulationScope(false, true) === false,
  "simulation update does not post to live pools",
);
t(
  poolMatchesEditionSimulationScope(true, false) === false,
  "live update does not post to simulation pools",
);

const here = dirname(fileURLToPath(import.meta.url));
const participantFilterSource = readFileSync(
  join(here, "../activityFeedParticipantFilter.ts"),
  "utf8",
);
t(
  !participantFilterSource.includes("ash_score_impact"),
  "private pool participant filter unchanged for score impact rows",
);

const postSource = readFileSync(join(here, "postScoreImpactActivity.ts"), "utf8");
t(
  postSource.includes("metadata_json->>match_id") && postSource.includes(".update("),
  "score correction updates existing row by match_id",
);

const tiedDeltaBefore = [
  row("p1", "Zach", 10, 1),
  row("p2", "Amanda", 8, 2),
  row("p3", "Kris", 6, 3),
];
const tiedDeltaAfter = [
  row("p1", "Zach", 16, 1),
  row("p2", "Amanda", 14, 2),
  row("p3", "Kris", 12, 3),
];
const tiedAnalysisA = detectScoreImpact({
  beforeRows: tiedDeltaBefore,
  afterRows: tiedDeltaAfter,
});
const tiedAnalysisB = detectScoreImpact({
  beforeRows: tiedDeltaBefore,
  afterRows: tiedDeltaAfter,
});
t(
  tiedAnalysisA.pointGainers.map((g) => g.displayName).join(",") ===
    tiedAnalysisB.pointGainers.map((g) => g.displayName).join(","),
  "tied-delta gainer order is deterministic across runs",
);
t(
  tiedAnalysisA.pointGainers.map((g) => g.displayName).join(",") === "Zach,Amanda,Kris",
  "tied-delta gainers sort by rank then name",
);

const mixedTieBefore = [
  row("p1", "Flash", 10, 3),
  row("p2", "Nish", 10, 1),
  row("p3", "Aditi", 10, 2),
];
const mixedTieAfter = [
  row("p1", "Flash", 16, 2),
  row("p2", "Nish", 16, 1),
  row("p3", "Aditi", 16, 3),
];
const mixedTieAnalysis = detectScoreImpact({
  beforeRows: mixedTieBefore,
  afterRows: mixedTieAfter,
});
t(
  mixedTieAnalysis.pointGainers.map((g) => g.displayName).join(",") === "Nish,Flash,Aditi",
  "equal +6 deltas sort by resulting rank ascending, then name",
);

if (failed > 0) {
  process.exit(1);
}
console.log("scoreImpact.selftest.ts: all tests passed");
