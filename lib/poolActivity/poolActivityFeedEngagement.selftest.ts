import {
  filterActivityFeedItems,
  poolActivityMatchesFeedFilter,
} from "./activityFeedFilter";
import type { PoolActivityFeedRow } from "./poolActivityTypes";
import { aggregateActivityReactions } from "./fetchActivityReactions";
import { safeParticipantDisplayName } from "./buildActivityReactionSummaries";
import {
  activeReactionEmojis,
  isAllowedActivityReaction,
} from "./reactionConstants";

let failed = 0;
function t(cond: boolean, msg: string) {
  if (!cond) {
    failed++;
    console.error("FAIL:", msg);
  }
}

const sampleItems: PoolActivityFeedRow[] = [
  {
    id: "a1",
    type: "participant_submitted_picks",
    body_text: "Alice made their picks.",
    metadata_json: {},
    related_path: null,
    is_ai_generated: false,
    created_at: "2026-01-01T00:00:00Z",
    participant_display_name: "Alice",
  },
  {
    id: "a2",
    type: "participant_updated_picks",
    body_text: "Bob updated their picks.",
    metadata_json: {},
    related_path: null,
    is_ai_generated: false,
    created_at: "2026-01-02T00:00:00Z",
    participant_display_name: "Bob",
  },
  {
    id: "a3",
    type: "ash_daily_recap",
    body_text: "Recap",
    metadata_json: {},
    related_path: null,
    is_ai_generated: false,
    created_at: "2026-01-03T00:00:00Z",
    participant_display_name: null,
  },
  {
    id: "a4",
    type: "announcement",
    body_text: "Admin posted an update: Hello",
    metadata_json: {},
    related_path: null,
    is_ai_generated: false,
    created_at: "2026-01-04T00:00:00Z",
    participant_display_name: null,
  },
];

t(
  filterActivityFeedItems(sampleItems, "picks").length === 2,
  "picks filter keeps submit + update",
);
t(
  filterActivityFeedItems(sampleItems, "recaps").length === 1,
  "recaps filter",
);
t(
  filterActivityFeedItems(sampleItems, "announcements").length === 1,
  "announcements filter",
);
t(
  poolActivityMatchesFeedFilter("participant_joined", "picks") === false,
  "joins excluded from picks",
);

t(isAllowedActivityReaction("👍"), "thumbs up allowed");
t(!isAllowedActivityReaction("💀"), "skull not allowed");

const agg = aggregateActivityReactions(
  [
    {
      activity_id: "x",
      participant_id: "p1",
      reaction: "👍",
      display_name: "Adarsh",
    },
    {
      activity_id: "x",
      participant_id: "p2",
      reaction: "👍",
      display_name: "Naveen",
    },
    {
      activity_id: "x",
      participant_id: "p3",
      reaction: "🔥",
      display_name: "THE SHARK KING",
    },
    {
      activity_id: "y",
      participant_id: "p1",
      reaction: "😂",
      display_name: "Adarsh",
    },
  ],
  "p1",
);
t(agg.counts.x?.["👍"] === 2, "aggregate thumbs count");
t(agg.counts.x?.["🔥"] === 1, "aggregate fire count");
t(agg.viewerReactions.x === "👍", "viewer reaction on x");
t(agg.viewerReactions.y === "😂", "viewer reaction on y");

const xSummaries = agg.summaries.x ?? [];
const thumbs = xSummaries.find((s) => s.reaction === "👍");
t(thumbs?.count === 2, "summary thumbs count");
t(
  thumbs?.reactedBy.length === 2 &&
    thumbs.reactedBy.some((r) => r.isYou && r.displayName === "Adarsh"),
  "summary thumbs includes viewer as You",
);
t(
  Boolean(
    thumbs?.reactedBy.some((r) => !r.isYou && r.displayName === "Naveen"),
  ),
  "summary thumbs includes other display name",
);
const fire = xSummaries.find((s) => s.reaction === "🔥");
t(
  fire?.reactedBy[0]?.displayName === "THE SHARK KING",
  "summary fire display name",
);

const serialized = JSON.stringify(agg);
t(!serialized.includes("p1"), "no participant ids in snapshot json");
t(!serialized.includes("p2"), "no participant ids p2");
t(!serialized.includes("@"), "no email-like content in snapshot json");
t(!/"id"/.test(serialized), "no id fields in snapshot json");

t(
  safeParticipantDisplayName("  ") === "Participant",
  "blank display name fallback",
);

t(
  activeReactionEmojis({ "👍": 2, "🔥": 0, "😂": 1 }).join("") === "👍😂",
  "active reactions omit zero counts",
);
t(activeReactionEmojis({}).length === 0, "no active reactions when empty");

if (failed) {
  process.exit(1);
}
console.log("poolActivityFeedEngagement.selftest: ok");
