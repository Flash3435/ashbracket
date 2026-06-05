import {
  buildAllPoolInsightCandidates,
  buildPostLockPoolInsightCandidates,
  buildPreLockPoolInsightCandidates,
  type PoolInsightFacts,
} from "./buildPoolInsightCandidates";
import { filterActivityFeedForParticipantView } from "./activityFeedParticipantFilter";
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

const preLock = buildPreLockPoolInsightCandidates(preLockBase);
t(
  preLock.some((c) => c.sourceKey === "prelock_completion_percent_75"),
  "pre-lock completion percent bucket",
);
t(
  preLock.some((c) => c.sourceKey === "prelock_completion_percent_90"),
  "pre-lock 90% bucket at 90% ready",
);
t(
  preLock.some((c) => c.sourceKey === "prelock_updates_today_6"),
  "pre-lock updates today",
);
t(
  preLock.some((c) => c.sourceKey === "prelock_joins_today_4"),
  "pre-lock joins last 24h",
);
t(
  preLock.some((c) => c.sourceKey === "prelock_activity_today_12"),
  "pre-lock heating up",
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
  buildPreLockPoolInsightCandidates(preLockRemaining).some(
    (c) => c.sourceKey === "prelock_remaining_2",
  ),
  "pre-lock remaining brackets",
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

const allKeys = buildAllPoolInsightCandidates(preLockBase).map((c) => c.sourceKey);
t(new Set(allKeys).size === allKeys.length, "no duplicate source keys in batch");

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

if (failed) {
  process.exit(1);
}
console.log("poolInsights.selftest: ok");
