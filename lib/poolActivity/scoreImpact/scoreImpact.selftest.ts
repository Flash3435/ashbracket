import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { PilotStandingsRow } from "@/lib/admin/pilotStandingsSnapshot";
import { buildScoreImpactCommentary } from "./buildScoreImpactCommentary";
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

const afterScoreNoPoints: PilotStandingsRow[] = unchangedBefore.map((r) => ({ ...r }));
const matchNoPoints: ScoreImpactMatchResult = {
  matchCode: "WC2026-G-A-01",
  label: "Mexico 2–1 South Africa",
  groupCode: "A",
  winnerTeamId: "mexico",
  stageCode: "group",
};
const noPointsAnalysis = detectScoreImpact({
  beforeRows: unchangedBefore,
  afterRows: afterScoreNoPoints,
  matchResults: [matchNoPoints],
  primaryWinnerTeamName: "Mexico",
  winnerPickCount: 4,
});
t(scoreImpactHasMeaningfulChange(noPointsAnalysis), "recorded score with no points is meaningful");
const noPointsCommentary = buildScoreImpactCommentary(noPointsAnalysis);
t(
  noPointsCommentary?.includes("Mexico 2–1 South Africa") === true,
  "informational item mentions match result",
);
t(
  noPointsCommentary?.includes("No pool points changed yet") === true,
  "informational item notes unchanged standings",
);

const afterPoints: PilotStandingsRow[] = [
  row("p1", "Amanda", 10, 1),
  row("p3", "Zach", 18, 2),
  row("p2", "Kris", 8, 3),
];
const pointsAnalysis = detectScoreImpact({
  beforeRows: unchangedBefore,
  afterRows: afterPoints,
});
t(pointsAnalysis.pointsChanged, "points changed detected");
const pointsCommentary = buildScoreImpactCommentary(pointsAnalysis);
t(
  pointsCommentary?.includes("Zach") === true && pointsCommentary.includes("+12") === true,
  "points changed mentions top gainer",
);
t(
  pointsCommentary?.includes("jumped into 2nd") === true,
  "leaderboard mover detected",
);

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

if (failed > 0) {
  process.exit(1);
}
console.log("scoreImpact.selftest.ts: all tests passed");
