import {
  buildAllPoolInsightCandidates,
  buildPostLockPoolInsightCandidates,
  buildPreLockPoolInsightCandidates,
  type PoolInsightFacts,
} from "./buildPoolInsightCandidates";
import { applyGlobalActivityFeedGrouping } from "./activityFeedGrouping";
import { filterActivityFeedForParticipantView } from "./activityFeedParticipantFilter";
import { preLockRollingSourceKey } from "./rollingPoolInsightKeys";
import { dedupeRollingPoolInsights } from "./rollingPoolInsightDedup";
import type { GlobalPoolActivityFeedRow } from "./globalActivityTypes";
import type { PoolActivityFeedRow } from "./poolActivityTypes";

let failed = 0;
function t(cond: boolean, msg: string) {
  if (!cond) {
    failed++;
    console.error("FAIL:", msg);
  }
}

const preLockBase: PoolInsightFacts = {
  participantCount: 20,
  submittedCount: 18,
  locked: false,
  joinsLast24h: 4,
  updatesToday: 6,
  activityToday: 12,
};

const nowMs = Date.parse("2026-06-06T18:00:00.000Z");
const dayYmd = "2026-06-06";

const preLock = buildPreLockPoolInsightCandidates(preLockBase, nowMs);
t(
  preLock.some((c) => c.sourceKey === "prelock_completion_percent_75"),
  "pre-lock completion percent bucket",
);
t(
  preLock.some((c) => c.sourceKey === "prelock_completion_percent_90"),
  "pre-lock 90% bucket at 90% ready",
);
t(
  preLock.some(
    (c) => c.sourceKey === preLockRollingSourceKey("pick_updates", dayYmd),
  ),
  "pre-lock updates today stable source key",
);
t(
  preLock.some((c) => c.sourceKey === preLockRollingSourceKey("joins", dayYmd)),
  "pre-lock joins last 24h stable source key",
);
t(
  preLock.some(
    (c) => c.sourceKey === preLockRollingSourceKey("activity_heat", dayYmd),
  ),
  "pre-lock heating up stable source key",
);
t(
  !preLock.some((c) => /_\d+$/.test(c.sourceKey) && c.sourceKey.includes("today")),
  "rolling source keys do not embed count",
);
t(
  preLock.some((c) => c.body.includes("18") && c.body.includes("90%")),
  "pre-lock body shows live counts",
);
t(
  !preLock.some((c) => c.body.match(/\b(Brazil|Germany|Japan)\b/i)),
  "pre-lock avoids team names",
);

const preLockRemaining: PoolInsightFacts = {
  ...preLockBase,
  participantCount: 10,
  submittedCount: 8,
  joinsLast24h: 0,
  updatesToday: 0,
  activityToday: 0,
};
t(
  buildPreLockPoolInsightCandidates(preLockRemaining, nowMs).some(
    (c) => c.sourceKey === preLockRollingSourceKey("remaining", dayYmd),
  ),
  "pre-lock remaining brackets stable source key",
);

const postLock: PoolInsightFacts = {
  participantCount: 10,
  submittedCount: 8,
  locked: true,
  joinsLast24h: 0,
  updatesToday: 0,
  activityToday: 0,
  championStats: [
    { teamId: "t-bra", teamName: "Brazil", count: 4 },
    { teamId: "t-arg", teamName: "Argentina", count: 2 },
    { teamId: "t-fra", teamName: "France", count: 2 },
  ],
  oftenPickedZeroChampion: [{ teamId: "t-ger", teamName: "Germany", count: 0 }],
  uniqueChampionPicks: [{ teamId: "t-jpn", teamName: "Japan", count: 1 }],
  topPresenceTeam: { teamId: "t-can", teamName: "Canada", bracketCount: 7 },
  underdogFinalistBracketCount: 3,
};

const postCandidates = buildPostLockPoolInsightCandidates(postLock);
t(
  postCandidates.some((c) => c.sourceKey === "postlock_top_champion"),
  "post-lock top champion",
);
t(
  postCandidates.some((c) => c.sourceKey === "postlock_no_champion_pick_t-ger"),
  "post-lock no champion pick",
);
t(
  postCandidates.some(
    (c) => c.sourceKey === "postlock_unique_champion_pick_t-jpn",
  ),
  "post-lock unique champion pick",
);
t(
  postCandidates.some(
    (c) => c.sourceKey === "postlock_top_bracket_presence_t-can",
  ),
  "post-lock bracket presence",
);
t(
  postCandidates.some((c) => c.sourceKey === "postlock_underdog_finalist_3"),
  "post-lock underdog finalists",
);
t(
  !postCandidates.some((c) => c.body.match(/\bAlice\b|\bBob\b/i)),
  "post-lock avoids participant names",
);

const tiedChamps: PoolInsightFacts = {
  ...postLock,
  championStats: [
    { teamId: "t-bra", teamName: "Brazil", count: 3 },
    { teamId: "t-arg", teamName: "Argentina", count: 3 },
    { teamId: "t-fra", teamName: "France", count: 2 },
  ],
  uniqueChampionPicks: [],
  oftenPickedZeroChampion: [],
  topPresenceTeam: null,
  underdogFinalistBracketCount: 0,
};
t(
  buildPostLockPoolInsightCandidates(tiedChamps).some(
    (c) => c.sourceKey === "postlock_top_3_champions",
  ),
  "post-lock top 3 when no unique leader",
);
t(
  !buildPostLockPoolInsightCandidates(tiedChamps).some(
    (c) => c.sourceKey === "postlock_top_champion",
  ),
  "no top champion when tied",
);

t(
  buildPreLockPoolInsightCandidates({ ...preLockBase, locked: true }).length === 0,
  "pre-lock builder skips when locked",
);
t(
  buildPostLockPoolInsightCandidates({ ...postLock, locked: false }).length === 0,
  "post-lock builder skips when unlocked",
);

const allKeys = buildAllPoolInsightCandidates(preLockBase, nowMs).map(
  (c) => c.sourceKey,
);
t(new Set(allKeys).size === allKeys.length, "no duplicate source keys in batch");

const heatInsight = (
  id: string,
  count: number,
  createdAt: string,
  legacy = true,
): PoolActivityFeedRow => ({
  id,
  type: "pool_insight",
  body_text: `🔥 The pool is heating up: ${count} activity items today.`,
  metadata_json: legacy
    ? {
        source_key: `prelock_activity_today_${count}`,
        insight_label: "POOL INSIGHT",
        activity_today: count,
      }
    : {
        source_key: preLockRollingSourceKey("activity_heat", dayYmd),
        insight_label: "POOL INSIGHT",
        activity_today: count,
        insight_day: dayYmd,
      },
  related_path: null,
  is_ai_generated: false,
  created_at: createdAt,
  participant_display_name: null,
});

const heatRows = [
  heatInsight("h11", 11, "2026-06-06T20:00:00.000Z"),
  heatInsight("h10", 10, "2026-06-06T19:00:00.000Z"),
  heatInsight("h9", 9, "2026-06-06T18:00:00.000Z"),
  heatInsight("h8", 8, "2026-06-06T17:00:00.000Z"),
];
const dedupedHeat = dedupeRollingPoolInsights(heatRows, () => "pool-a");
t(dedupedHeat.length === 1, "activity heat 8–11 same day collapses to one row");
t(dedupedHeat[0]?.id === "h11", "keeps highest-count activity heat row");

const otherDayHeat = dedupeRollingPoolInsights(
  [
    heatInsight("h-today", 9, "2026-06-06T18:00:00.000Z"),
    heatInsight("h-yesterday", 12, "2026-06-05T18:00:00.000Z"),
  ],
  () => "pool-a",
);
t(otherDayHeat.length === 2, "different days keep separate heat insights");

const otherPoolHeat = dedupeRollingPoolInsights(
  [
    heatInsight("p1", 9, "2026-06-06T18:00:00.000Z"),
    { ...heatInsight("p2", 10, "2026-06-06T19:00:00.000Z"), id: "p2" },
  ],
  (row) => (row.id === "p2" ? "pool-b" : "pool-a"),
);
t(otherPoolHeat.length === 2, "different pools keep separate heat insights");

const postLockRow: PoolActivityFeedRow = {
  id: "post",
  type: "pool_insight",
  body_text: "👑 Brazil is the most popular champion pick.",
  metadata_json: { source_key: "postlock_top_champion", insight_label: "POOL INSIGHT" },
  related_path: null,
  is_ai_generated: false,
  created_at: "2026-06-06T18:00:00.000Z",
  participant_display_name: null,
};
const mixedDedup = dedupeRollingPoolInsights([...heatRows, postLockRow], () => "pool-a");
t(
  mixedDedup.some((r) => r.id === "post"),
  "post-lock aggregate insights are not suppressed",
);

const globalHeatRows: GlobalPoolActivityFeedRow[] = heatRows.map((row) => ({
  ...row,
  pool_id: "pool-a",
  pool_name: "Test Pool",
  ashbot_enabled: true,
}));
const globalDisplay = applyGlobalActivityFeedGrouping(globalHeatRows, "strict");
t(
  globalDisplay.filter((item) => item.kind === "activity").length === 1,
  "global feed shows one heating-up card per pool/day",
);

const insightRow = (
  id: string,
  participantId?: string,
): PoolActivityFeedRow => ({
  id,
  type: "pool_insight",
  body_text: "📊 18 brackets are in. The pool is 90% ready.",
  metadata_json: {
    source_key: "prelock_completion_percent_90",
    insight_label: "POOL INSIGHT",
    icon: "📊",
    ...(participantId ? { participant_id: participantId } : {}),
  },
  related_path: null,
  is_ai_generated: false,
  created_at: "2026-06-01T00:00:00Z",
  participant_display_name: null,
});

const joinRow: PoolActivityFeedRow = {
  id: "join-1",
  type: "participant_joined",
  body_text: "Alice joined.",
  metadata_json: {},
  related_path: null,
  is_ai_generated: false,
  created_at: "2026-06-02T00:00:00Z",
  participant_display_name: "Alice",
};

t(
  filterActivityFeedForParticipantView([insightRow("in-1"), joinRow], {
    hidePoolWideMilestones: true,
    participantId: "p1",
  }).length === 1,
  "hide pool insights with participant filter",
);

const singularRemaining = buildPreLockPoolInsightCandidates(
  {
    participantCount: 2,
    submittedCount: 1,
    locked: false,
    joinsLast24h: 0,
    updatesToday: 0,
    activityToday: 0,
  },
  nowMs,
);
const remainingInsight = singularRemaining.find((c) =>
  c.sourceKey.includes("remaining"),
);
t(
  remainingInsight?.body.includes("1 bracket") === true,
  "singular remaining bracket insight",
);
t(
  !remainingInsight?.body.includes("1 brackets"),
  "no singular/plural mismatch in remaining insight",
);

if (failed) {
  process.exit(1);
}
console.log("poolInsights.selftest: ok");
