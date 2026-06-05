import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  computeGlobalActivityEngagementSummary,
  buildGlobalPoolEngagementOverview,
} from "./computeGlobalActivityEngagement";
import {
  filterGlobalActivityFeedItems,
  globalActivityMatchesFeedFilter,
} from "./globalActivityFeedFilter";
import type { GlobalPoolActivityFeedRow } from "./globalActivityTypes";

let failed = 0;
function t(cond: boolean, msg: string) {
  if (!cond) {
    failed++;
    console.error("FAIL:", msg);
  }
}

const now = Date.parse("2026-06-04T12:00:00Z");
const h = (n: number) =>
  new Date(now - n * 60 * 60 * 1000).toISOString();

const sampleItems: GlobalPoolActivityFeedRow[] = [
  {
    id: "1",
    pool_id: "p1",
    pool_name: "AshBracket 2026",
    ashbot_enabled: true,
    type: "participant_submitted_picks",
    body_text: "Naveen made their picks.",
    metadata_json: {},
    related_path: null,
    is_ai_generated: false,
    created_at: h(2),
    participant_display_name: "Naveen",
  },
  {
    id: "2",
    pool_id: "p2",
    pool_name: "PPFamily",
    ashbot_enabled: true,
    type: "pool_milestone",
    body_text: "Half the pool has completed their bracket.",
    metadata_json: { milestone_label: "MILESTONE" },
    related_path: null,
    is_ai_generated: false,
    created_at: h(30),
    participant_display_name: null,
  },
];

t(
  filterGlobalActivityFeedItems(sampleItems, "picks").length === 1,
  "picks filter",
);
t(
  filterGlobalActivityFeedItems(sampleItems, "milestones").length === 1,
  "milestones filter",
);
t(
  globalActivityMatchesFeedFilter("participant_joined", "joins") === true,
  "joins filter type",
);
t(sampleItems.every((i) => i.pool_name.length > 0), "global items have pool names");

const summary = computeGlobalActivityEngagementSummary({
  poolIds: ["p1", "p2", "p3"],
  recentActivity: [
    { pool_id: "p1", type: "participant_submitted_picks", created_at: h(1) },
    { pool_id: "p1", type: "participant_joined", created_at: h(2) },
    { pool_id: "p2", type: "announcement", created_at: h(200) },
  ],
  recentReactions: [
    { pool_id: "p1", created_at: h(1) },
    { pool_id: "p1", created_at: h(3) },
  ],
  nowMs: now,
});
t(summary.activePools24h >= 1, "active pools 24h");
t(summary.activityItems24h === 2, "activity items 24h");
t(summary.picksActivity24h === 1, "picks 24h");
t(summary.joins24h === 1, "joins 24h");
t(summary.reactions24h === 2, "reactions 24h");
t(summary.quietPools24h === 2, "quiet pools 24h (p2+p3)");

const overview = buildGlobalPoolEngagementOverview({
  pools: [
    { id: "p1", name: "Alpha" },
    { id: "p2", name: "Beta" },
  ],
  participantCountsByPoolId: new Map([
    ["p1", 5],
    ["p2", 3],
  ]),
  completedBracketsByPoolId: new Map([
    ["p1", 4],
    ["p2", null],
  ]),
  recentActivity: [
    { pool_id: "p1", type: "participant_joined", created_at: h(1) },
  ],
  recentReactions: [],
  nowMs: now,
});
t(overview[0]?.poolName === "Alpha", "overview sorted by last activity");
t(overview[0]?.activityCount24h === 1, "overview activity 24h");

const loaderPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "loadGlobalActivityForAdmin.ts",
);
const loaderSrc = readFileSync(loaderPath, "utf8");
t(
  !/ensurePoolMilestonesForPool\s*\(/.test(loaderSrc),
  "global loader does not call milestone generation",
);
t(
  !/ensureDailyAshRecapForPool\s*\(/.test(loaderSrc),
  "global loader does not call daily recap generation",
);

if (failed) {
  process.exit(1);
}
console.log("globalActivity.selftest: ok");
