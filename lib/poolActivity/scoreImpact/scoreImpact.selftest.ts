import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { PilotStandingsRow } from "@/lib/admin/pilotStandingsSnapshot";
import { buildScoreImpactCommentary } from "./buildScoreImpactCommentary";
import {
  buildParticipantTeamPicksFromPredictions,
  buildSoftImpactForMatch,
  isSoftImpactPathPickKind,
} from "./buildSoftImpact";
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

const usaTeamId = "team-usa";
const parTeamId = "team-par";
const teamNameById = new Map([
  [usaTeamId, "United States"],
  [parTeamId, "Paraguay"],
]);
const softImpactPredictions = [
  { participantId: "p1", teamId: usaTeamId, predictionKind: "champion" },
  { participantId: "p2", teamId: usaTeamId, predictionKind: "group_winner" },
  { participantId: "p3", teamId: parTeamId, predictionKind: "group_winner" },
  { participantId: "p4", teamId: usaTeamId, predictionKind: "finalist" },
  { participantId: "p5", teamId: parTeamId, predictionKind: "champion" },
];
const participantPicks = buildParticipantTeamPicksFromPredictions(softImpactPredictions);
const softImpactNames = new Map([
  ["p1", "Ash"],
  ["p2", "Nish"],
  ["p3", "Flash"],
  ["p4", "Zara"],
  ["p5", "Kris"],
]);
const usaWinMatch: ScoreImpactMatchResult = {
  matchCode: "WC2026-G-D-01",
  label: "United States 4–1 Paraguay",
  groupCode: "D",
  winnerTeamId: usaTeamId,
  homeTeamId: usaTeamId,
  awayTeamId: parTeamId,
  stageCode: "group",
};
const softImpact = buildSoftImpactForMatch({
  match: usaWinMatch,
  teamNameById,
  participantPicks,
  participantNames: softImpactNames,
});
t(softImpact?.enabled === true, "soft impact enabled for winner with brackets in path");
t(softImpact?.affected_count === 3, "soft impact counts participants with winner in path");
t(softImpact?.sample_names.length === 3, "soft impact sample names capped at 3");
t(
  softImpact?.sample_names.join(",") === "Ash,Zara,Nish",
  "soft impact sample names sort by relevance then display name",
);
t(softImpact?.reason === "winner_in_path", "soft impact reason is winner_in_path");

t(isSoftImpactPathPickKind("group_winner") === true, "group winner is path pick kind");
t(isSoftImpactPathPickKind("champion") === true, "champion is path pick kind");
t(isSoftImpactPathPickKind("bonus_pick") === false, "bonus pick is not path pick kind");

const bonusOnlyPicks = buildParticipantTeamPicksFromPredictions([
  { participantId: "p-bonus", teamId: usaTeamId, predictionKind: "bonus_pick" },
]);
t(
  !bonusOnlyPicks.has("p-bonus"),
  "bonus-only pick for winning team is not counted as in their path",
);
t(
  buildSoftImpactForMatch({
    match: usaWinMatch,
    teamNameById,
    participantPicks: bonusOnlyPicks,
    participantNames: new Map([["p-bonus", "BonusOnly"]]),
  }) === null,
  "bonus-only participant omitted from soft impact",
);

const pathKindPicks = buildParticipantTeamPicksFromPredictions([
  { participantId: "p-group", teamId: usaTeamId, predictionKind: "group_winner" },
  { participantId: "p-ko", teamId: usaTeamId, predictionKind: "quarterfinalist" },
  { participantId: "p-champ", teamId: usaTeamId, predictionKind: "champion" },
]);
t(pathKindPicks.size === 3, "group/knockout/champion picks are counted for path");
const pathOnlyImpact = buildSoftImpactForMatch({
  match: usaWinMatch,
  teamNameById,
  participantPicks: pathKindPicks,
  participantNames: new Map([
    ["p-group", "GroupPicker"],
    ["p-ko", "KoPicker"],
    ["p-champ", "ChampPicker"],
  ]),
});
t(pathOnlyImpact?.affected_count === 3, "path pick participants included in soft impact count");

const duplicatePathPicks = buildParticipantTeamPicksFromPredictions([
  { participantId: "p-dup", teamId: usaTeamId, predictionKind: "group_winner" },
  { participantId: "p-dup", teamId: usaTeamId, predictionKind: "champion" },
  { participantId: "p-dup", teamId: usaTeamId, predictionKind: "finalist" },
]);
t(duplicatePathPicks.size === 1, "multiple path picks for same team dedupe to one participant");
const dupImpact = buildSoftImpactForMatch({
  match: usaWinMatch,
  teamNameById,
  participantPicks: duplicatePathPicks,
  participantNames: new Map([["p-dup", "DupPicker"]]),
});
t(dupImpact?.affected_count === 1, "duplicate path picks do not inflate soft impact count");
t(
  duplicatePathPicks.get("p-dup")?.maxPathImportanceByTeamId.get(usaTeamId) === 100,
  "duplicate path picks keep highest relevance for sample ordering",
);

const pathPlusBonusPicks = buildParticipantTeamPicksFromPredictions([
  { participantId: "p-mix", teamId: usaTeamId, predictionKind: "bonus_pick" },
  { participantId: "p-mix", teamId: usaTeamId, predictionKind: "group_winner" },
]);
t(pathPlusBonusPicks.has("p-mix"), "path + bonus participant counted via path pick only");
const mixImpact = buildSoftImpactForMatch({
  match: usaWinMatch,
  teamNameById,
  participantPicks: pathPlusBonusPicks,
  participantNames: new Map([["p-mix", "MixPicker"]]),
});
t(mixImpact?.affected_count === 1, "path + bonus participant counted once");

const drawMatch: ScoreImpactMatchResult = {
  matchCode: "WC2026-G-B-02",
  label: "Canada 1–1 Bosnia and Herzegovina",
  groupCode: "B",
  winnerTeamId: null,
  homeTeamId: "team-can",
  awayTeamId: "team-bih",
  stageCode: "group",
};
t(
  buildSoftImpactForMatch({
    match: drawMatch,
    teamNameById,
    participantPicks,
    participantNames: softImpactNames,
  }) === null,
  "draw result omits soft impact in v1",
);

const noPointsWithSoftAnalysis = detectScoreImpact({
  beforeRows: unchangedBefore,
  afterRows: unchangedAfter,
  matchResults: [usaWinMatch],
});
const noPointsWithSoftMeta = buildScoreImpactMetadata({
  analysis: noPointsWithSoftAnalysis,
  matchResults: [usaWinMatch],
  participantNames: softImpactNames,
  trigger: "tournament_sync",
  sourceKey: "score_impact:v1:soft",
  standingsHash: "hash-soft",
  scoreSignature: "sig-soft",
  softImpact,
});
t(noPointsWithSoftMeta.top_gainers.length === 0, "no-points card keeps empty top_gainers");
t(
  noPointsWithSoftMeta.soft_impact?.affected_count === 3,
  "no-points metadata includes soft impact count",
);
t(
  noPointsWithSoftMeta.soft_impact?.sample_names.length === 3,
  "no-points metadata includes max 3 sample names",
);

const softDisplayLocked = buildScoreImpactDisplayLines(
  noPointsWithSoftMeta as unknown as Record<string, unknown>,
  { allowParticipantNames: true },
);
t(
  softDisplayLocked?.detailLines.some((l) => l.includes("Good result for 3 brackets")) === true,
  "locked pool shows soft impact count line",
);
t(
  softDisplayLocked?.detailLines.some((l) => l.startsWith("Watching closely:")) === true,
  "locked pool shows soft impact sample names",
);
t(
  !softDisplayLocked?.detailLines.some((l) => l.includes("Biggest boost:")),
  "no-points card does not show point gainers",
);

const softDisplayPreLock = buildScoreImpactDisplayLines(
  noPointsWithSoftMeta as unknown as Record<string, unknown>,
  { allowParticipantNames: false },
);
t(
  !softDisplayPreLock?.detailLines.some((l) => l.includes("Good result for")),
  "pre-lock hides soft impact count",
);
t(
  !softDisplayPreLock?.detailLines.some((l) => l.includes("Ash")),
  "pre-lock hides soft impact names",
);

const softDisplayCompact = buildScoreImpactDisplayLines(
  noPointsWithSoftMeta as unknown as Record<string, unknown>,
  { allowParticipantNames: true, compact: true },
);
t(
  softDisplayCompact?.detailLines.filter((l) => l.includes("boost") || l.startsWith("Watching")).length === 1,
  "dashboard compact mode shows at most one soft-impact line",
);
t(
  softDisplayCompact?.detailLines.some((l) => l.startsWith("Early boost:")) === true,
  "dashboard compact uses early boost copy",
);

const pointsWithSoftMeta = buildScoreImpactMetadata({
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
  sourceKey: "score_impact:v1:points",
  standingsHash: "hash",
  scoreSignature: "sig",
  softImpact,
});
const pointsWithSoftDisplay = buildScoreImpactDisplayLines(
  pointsWithSoftMeta as unknown as Record<string, unknown>,
  { allowParticipantNames: true },
);
t(
  pointsWithSoftDisplay?.detailLines.some((l) => l.startsWith("Biggest boost:")) === true,
  "points-changed card still shows top gainers",
);
t(
  !pointsWithSoftDisplay?.detailLines.some((l) => l.includes("Good result for")),
  "points-changed card does not show soft impact copy",
);

const clientSafeSoft = clientSafeScoreImpactMetadata(
  noPointsWithSoftMeta as unknown as Record<string, unknown>,
);
t(!("point_gainers" in clientSafeSoft), "client-safe metadata strips point_gainers");
t(
  (clientSafeSoft.soft_impact as { team_id?: string })?.team_id == null,
  "client-safe metadata strips soft_impact team_id",
);
const softSerialized = JSON.stringify(clientSafeSoft);
t(!softSerialized.includes("@"), "no emails in client-safe soft impact metadata json");
t(!/"participant_id"/.test(softSerialized), "no participant_id in client-safe soft impact json");

const softCommentary = buildScoreImpactCommentary(noPointsWithSoftAnalysis, softImpact);
t(
  softCommentary?.includes("Good result for 3 brackets") === true,
  "commentary includes soft impact count when provided",
);

if (failed > 0) {
  process.exit(1);
}
console.log("scoreImpact.selftest.ts: all tests passed");
