import {
  buildAllPoolMilestoneCandidates,
  buildCompletionMilestoneCandidates,
  buildDeadlineMilestoneCandidates,
} from "./buildPoolMilestoneCandidates";
import { filterActivityFeedForParticipantView } from "./activityFeedParticipantFilter";
import type { PoolActivityFeedRow } from "./poolActivityTypes";

let failed = 0;
function t(cond: boolean, msg: string) {
  if (!cond) {
    failed++;
    console.error("FAIL:", msg);
  }
}

const facts10_5: import("./buildDeterministicRecapBody").RecapFacts = {
  participantCount: 10,
  submittedCount: 5,
  topChampionTeamName: null,
  topChampionTeamId: null,
  topChampionPickCount: 0,
  championUniqueLeader: false,
};

t(
  buildCompletionMilestoneCandidates(facts10_5).some(
    (c) => c.sourceKey === "completion_50",
  ),
  "50% milestone at 5/10",
);
t(
  buildCompletionMilestoneCandidates(facts10_5).some(
    (c) => c.sourceKey === "completion_count_5",
  ),
  "every-5 milestone at 5 complete",
);
t(
  !buildCompletionMilestoneCandidates(facts10_5).some(
    (c) => c.sourceKey === "completion_75",
  ),
  "75% not at 50%",
);

const facts10_10 = { ...facts10_5, submittedCount: 10 };
const complete100 = buildCompletionMilestoneCandidates(facts10_10);
t(
  complete100.some((c) => c.sourceKey === "completion_100"),
  "100% milestone when all complete",
);
t(
  complete100.some((c) => c.sourceKey === "completion_count_10"),
  "count_10 at 10 complete",
);

const facts10_7 = { ...facts10_5, submittedCount: 7 };
t(
  buildCompletionMilestoneCandidates(facts10_7).some(
    (c) => c.sourceKey === "completion_remaining_le3",
  ),
  "remaining le3 at 3 left",
);

const lockFuture = new Date("2026-06-10T18:00:00Z").toISOString();
const nowBeforeTomorrow = new Date("2026-06-09T12:00:00Z").getTime();
const tomorrowCandidates = buildDeadlineMilestoneCandidates(
  lockFuture,
  facts10_5,
  nowBeforeTomorrow,
);
t(
  tomorrowCandidates.some((c) => c.sourceKey === "lock_tomorrow"),
  "lock_tomorrow in 24-48h window",
);
t(
  !tomorrowCandidates.some((c) => c.sourceKey === "lock_today"),
  "no lock_today outside 24h",
);

const nowToday = new Date("2026-06-10T06:00:00Z").getTime();
const todayCandidates = buildDeadlineMilestoneCandidates(
  lockFuture,
  facts10_5,
  nowToday,
);
t(
  todayCandidates.some((c) => c.sourceKey === "lock_today"),
  "lock_today within 24h",
);

const lockPast = new Date("2026-06-01T00:00:00Z").toISOString();
const lockedCandidates = buildDeadlineMilestoneCandidates(
  lockPast,
  facts10_10,
  new Date("2026-06-10T00:00:00Z").getTime(),
);
t(
  lockedCandidates.some((c) => c.sourceKey === "lock_passed"),
  "lock_passed after deadline",
);
t(
  lockedCandidates.some((c) => c.sourceKey === "picks_locked_insights"),
  "insights card after lock",
);

const allKeys = buildAllPoolMilestoneCandidates(
  facts10_10,
  lockPast,
  new Date("2026-06-10T00:00:00Z").getTime(),
).map((c) => c.sourceKey);
t(new Set(allKeys).size === allKeys.length, "no duplicate source keys in batch");

const milestoneRow = (
  id: string,
  participantId?: string,
): PoolActivityFeedRow => ({
  id,
  type: "pool_milestone",
  body_text: "✅ Half the pool has completed their bracket.",
  metadata_json: {
    source_key: "completion_50",
    milestone_label: "MILESTONE",
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

const feed = [milestoneRow("ms-1"), joinRow];
t(
  filterActivityFeedForParticipantView(feed, { hidePoolWideMilestones: false })
    .length === 2,
  "no filter when hide flag false",
);
t(
  filterActivityFeedForParticipantView(feed, {
    hidePoolWideMilestones: true,
    participantId: "p1",
  }).length === 1,
  "hide pool milestones with participant filter",
);
t(
  filterActivityFeedForParticipantView(
    [milestoneRow("ms-2", "p1"), joinRow],
    { hidePoolWideMilestones: true, participantId: "p1" },
  ).some((i) => i.id === "ms-2"),
  "keep participant-specific milestone",
);

const facts1incomplete = {
  participantCount: 2,
  submittedCount: 1,
  topChampionTeamName: null,
  topChampionTeamId: null,
  topChampionPickCount: 0,
  championUniqueLeader: false,
};
const lockSoon = new Date("2026-06-10T18:00:00Z").toISOString();
const deadlineOneLeft = buildDeadlineMilestoneCandidates(
  lockSoon,
  facts1incomplete,
  new Date("2026-06-10T06:00:00Z").getTime(),
);
const lockTodayBody = deadlineOneLeft.find((c) => c.sourceKey === "lock_today")?.bodyText;
t(
  lockTodayBody?.includes("1 participant still needs to finish.") === true,
  "deadline suffix singular participant needs",
);
t(
  !/\b1 participant still need to finish\b/.test(lockTodayBody ?? ""),
  "deadline suffix avoids plural verb with singular noun",
);

if (failed) {
  process.exit(1);
}
console.log("poolMilestones.selftest: ok");
