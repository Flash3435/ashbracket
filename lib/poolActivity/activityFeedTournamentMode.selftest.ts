import { activityDisplayPriority } from "./activityFeedDisplayPriority";
import {
  applyPostLockDefaultAllFeedFilter,
  applyPostLockDefaultAllFeedFilterForGlobal,
  COMPLETION_RECAP_KIND,
  isCompletionOnlyAshDailyRecap,
  isLockRevealMilestoneSourceKey,
  shouldGenerateCompletionDailyRecap,
  sortDisplayItemsForPostLockTournamentMode,
} from "./activityFeedTournamentMode";
import type { PoolActivityFeedRow } from "./poolActivityTypes";

let failed = 0;
function t(cond: boolean, msg: string) {
  if (!cond) {
    failed++;
    console.error("FAIL:", msg);
  }
}

const LOCK_PAST = "2026-06-01T00:00:00.000Z";
const LOCK_FUTURE = "2099-12-31T00:00:00.000Z";
const NOW_AFTER_LOCK = new Date("2026-06-10T00:00:00.000Z").getTime();

function recapRow(id: string): PoolActivityFeedRow {
  return {
    id,
    type: "ash_daily_recap",
    body_text: "12 of 14 brackets are complete.",
    metadata_json: {
      recap_kind: COMPLETION_RECAP_KIND,
      participant_count: 14,
      submitted_count: 12,
      recap_date: "2026-06-09",
    },
    related_path: null,
    is_ai_generated: false,
    created_at: "2026-06-09T12:00:00.000Z",
    participant_display_name: null,
  };
}

function scoreImpactRow(id: string): PoolActivityFeedRow {
  return {
    id,
    type: "ash_score_impact",
    body_text: "Score impact after Mexico vs Brazil.",
    metadata_json: { match_id: "m1" },
    related_path: null,
    is_ai_generated: false,
    created_at: "2026-06-10T11:00:00.000Z",
    participant_display_name: null,
  };
}

function lockMilestoneRow(id: string): PoolActivityFeedRow {
  return {
    id,
    type: "pool_milestone",
    body_text: "Picks are locked. Pool reveal is open.",
    metadata_json: {
      source_key: "lock_passed",
      milestone_label: "POOL UPDATE",
    },
    related_path: null,
    is_ai_generated: false,
    created_at: "2026-06-01T01:00:00.000Z",
    participant_display_name: null,
  };
}

function pickRow(id: string, createdAt: string): PoolActivityFeedRow {
  return {
    id,
    type: "participant_submitted_picks",
    body_text: "Pat made their picks.",
    metadata_json: {},
    related_path: "/account/picks",
    is_ai_generated: false,
    created_at: createdAt,
    participant_display_name: "Pat",
  };
}

t(
  isCompletionOnlyAshDailyRecap(recapRow("r1")),
  "completion recap identified by metadata",
);
t(
  !isCompletionOnlyAshDailyRecap(scoreImpactRow("s1")),
  "score impact is not completion recap",
);
t(
  isCompletionOnlyAshDailyRecap({
    type: "ash_daily_recap",
    metadata_json: { recap_date: "2026-06-01", participant_count: 2, submitted_count: 1 },
  }),
  "legacy recap without recap_kind still completion-only",
);

t(
  shouldGenerateCompletionDailyRecap(LOCK_FUTURE, NOW_AFTER_LOCK),
  "unlocked pool still generates completion recaps",
);
t(
  !shouldGenerateCompletionDailyRecap(LOCK_PAST, NOW_AFTER_LOCK),
  "locked pool stops completion recap generation",
);

const lockedAll = applyPostLockDefaultAllFeedFilter(
  [
    { kind: "activity", ...recapRow("recap") },
    { kind: "activity", ...scoreImpactRow("score") },
    { kind: "activity", ...lockMilestoneRow("lock") },
  ],
  "all",
  { poolLocked: true },
);
t(
  lockedAll.some((item) => item.kind === "activity" && item.id === "score"),
  "score impact remains in locked default feed",
);
t(
  lockedAll.some((item) => item.kind === "activity" && item.id === "lock"),
  "lock milestone remains in locked default feed",
);
t(
  !lockedAll.some((item) => item.kind === "activity" && item.id === "recap"),
  "completion recap hidden in locked default feed",
);

const unlockedAll = applyPostLockDefaultAllFeedFilter(
  [{ kind: "activity", ...recapRow("recap") }],
  "all",
  { poolLocked: false },
);
t(unlockedAll.length === 1, "unlocked default feed still shows completion recap");

const recapsFilter = applyPostLockDefaultAllFeedFilter(
  [{ kind: "activity", ...recapRow("recap") }],
  "recaps",
  { poolLocked: true },
);
t(recapsFilter.length === 1, "Recaps filter still shows completion recap after lock");

const sorted = sortDisplayItemsForPostLockTournamentMode(
  [
    { kind: "activity", ...pickRow("pick", "2026-06-10T12:00:00.000Z") },
    { kind: "activity", ...scoreImpactRow("score") },
    { kind: "activity", ...lockMilestoneRow("lock") },
  ],
  { poolLocked: true },
);
t(
  sorted[0]?.kind === "activity" && sorted[0].id === "score",
  "post-lock sort elevates score impact above newer pick event",
);

t(
  activityDisplayPriority(recapRow("r"), { poolLocked: true }) === "low",
  "completion recap low priority after lock",
);
t(
  activityDisplayPriority(scoreImpactRow("s"), { poolLocked: true }) === "high",
  "score impact stays high after lock",
);
t(
  activityDisplayPriority(lockMilestoneRow("l"), { poolLocked: true }) === "high",
  "lock milestone stays high after lock",
);

t(isLockRevealMilestoneSourceKey("lock_passed"), "lock_passed links to reveal");
t(isLockRevealMilestoneSourceKey("picks_locked_insights"), "insights links to reveal");
t(!isLockRevealMilestoneSourceKey("completion_50"), "completion milestone no reveal link");

const globalFiltered = applyPostLockDefaultAllFeedFilterForGlobal(
  [
    {
      kind: "activity",
      ...recapRow("global-recap"),
      pool_id: "pool-a",
      pool_name: "Pool A",
      ashbot_enabled: true,
    },
    {
      kind: "activity",
      ...scoreImpactRow("global-score"),
      pool_id: "pool-a",
      pool_name: "Pool A",
      ashbot_enabled: true,
    },
  ],
  "all",
  { lockAtByPoolId: { "pool-a": LOCK_PAST }, nowMs: NOW_AFTER_LOCK },
);
t(
  !globalFiltered.some((item) => item.kind === "activity" && item.id === "global-recap"),
  "global admin default feed hides completion recap for locked pool",
);
t(
  globalFiltered.some((item) => item.kind === "activity" && item.id === "global-score"),
  "global admin keeps score impact for locked pool",
);

if (failed) {
  process.exit(1);
}
console.log("activityFeedTournamentMode.selftest: ok");
