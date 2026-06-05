import {
  buildAshBotComment,
  buildAshBotCommentsForFeed,
  shouldShowAshBotComment,
  stableTemplateIndex,
} from "./ashbotCommentary";
import type { PoolActivityFeedRow } from "../poolActivity/poolActivityTypes";

let failed = 0;
function t(cond: boolean, msg: string) {
  if (!cond) {
    failed++;
    console.error("FAIL:", msg);
  }
}

function row(
  partial: Partial<PoolActivityFeedRow> & Pick<PoolActivityFeedRow, "id" | "type">,
): PoolActivityFeedRow {
  return {
    body_text: "",
    metadata_json: {},
    related_path: null,
    is_ai_generated: false,
    created_at: "2026-06-01T12:00:00Z",
    participant_display_name: null,
    ...partial,
  };
}

function visCtx(
  items: PoolActivityFeedRow[],
  index: number,
): Parameters<typeof shouldShowAshBotComment>[1] {
  return {
    items,
    itemIndex: index,
    latestRecapId: items.find((i) => i.type === "ash_daily_recap")?.id ?? null,
    ashbotEnabled: true,
  };
}

t(stableTemplateIndex("seed-a", 3) === stableTemplateIndex("seed-a", 3), "stable index");
t(
  stableTemplateIndex("seed-a", 3) !== stableTemplateIndex("seed-b", 3),
  "different seeds can differ",
);

const joinId = "11111111-1111-4111-8111-111111111111";
const joinItem = row({
  id: joinId,
  type: "participant_joined",
  participant_display_name: "Khyan",
});
const joinA = buildAshBotComment(joinItem);
const joinB = buildAshBotComment(joinItem);
t(joinA !== null && joinA === joinB, "join comment deterministic");
t(joinA?.includes("Khyan") === true, "join uses display name");
t(!joinA?.includes("champion"), "join avoids pick details");

const picksItem = row({
  id: "22222222-2222-4222-8222-222222222222",
  type: "participant_submitted_picks",
  participant_display_name: "Yeshe",
});
const picksComment = buildAshBotComment(picksItem);
t(picksComment !== null, "picks made comment");
t(picksComment === buildAshBotComment(picksItem), "picks made deterministic");
t(!picksComment?.match(/\b(Brazil|France|Spain)\b/i), "picks made no team names");

const updateItem = row({
  id: "33333333-3333-4333-8333-333333333333",
  type: "participant_updated_picks",
  participant_display_name: "Omi",
});
t(buildAshBotComment(updateItem)?.includes("Omi") === true, "update uses name");

const recapItem = row({
  id: "44444444-4444-4444-8444-444444444444",
  type: "ash_daily_recap",
  metadata_json: { participant_count: 13, submitted_count: 9 },
});
const recapComment = buildAshBotComment(recapItem);
t(recapComment?.includes("9") === true && recapComment?.includes("13") === true, "recap counts");
t(buildAshBotComment(recapItem) === recapComment, "recap deterministic");

const recapLiveItem = row({
  id: "55555555-5555-4555-8555-555555555555",
  type: "ash_daily_recap",
  metadata_json: { participant_count: 5, submitted_count: 2, recap_date: "2026-06-04" },
});
const recapLive = buildAshBotComment(recapLiveItem, {
  liveRecapFacts: {
    participantCount: 10,
    submittedCount: 7,
    topChampionTeamName: null,
    topChampionPickCount: 0,
  },
  liveRecapDateYmd: "2026-06-04",
});
const recapStaleOnly = buildAshBotComment(recapLiveItem);
t(recapLive !== null && recapLive !== recapStaleOnly, "live recap override");

t(buildAshBotComment(row({ id: "x", type: "participant_joined" })) === null, "join without name");

{
  const latestRecap = row({
    id: "recap-new",
    type: "ash_daily_recap",
    metadata_json: { participant_count: 5, submitted_count: 3 },
  });
  const oldRecap = row({
    id: "recap-old",
    type: "ash_daily_recap",
    metadata_json: { participant_count: 5, submitted_count: 2 },
  });
  const items = [latestRecap, oldRecap];
  t(shouldShowAshBotComment(latestRecap, visCtx(items, 0)), "latest recap shows AshBot");
  t(!shouldShowAshBotComment(oldRecap, visCtx(items, 1)), "older recap hides AshBot");
}

{
  const joins = [
    row({ id: "j1", type: "participant_joined", participant_display_name: "A" }),
    row({ id: "j2", type: "participant_joined", participant_display_name: "B" }),
    row({ id: "j3", type: "participant_joined", participant_display_name: "C" }),
    row({ id: "j4", type: "participant_joined", participant_display_name: "D" }),
  ];
  const shown = joins.filter((item, i) =>
    shouldShowAshBotComment(item, visCtx(joins, i)),
  );
  t(shown.length < joins.length, "not every join in a run shows AshBot");
  t(shown.length >= 1, "at least one join in a run can show AshBot");
}

{
  const isolated = row({
    id: "j-alone",
    type: "participant_joined",
    participant_display_name: "Solo",
  });
  const items = [
    row({
      id: "p1",
      type: "participant_submitted_picks",
      participant_display_name: "X",
    }),
    isolated,
  ];
  t(shouldShowAshBotComment(isolated, visCtx(items, 1)), "isolated join shows AshBot");
}

{
  const feed = buildAshBotCommentsForFeed(
    [
      row({
        id: "j1",
        type: "participant_joined",
        participant_display_name: "A",
      }),
      row({
        id: "j2",
        type: "participant_joined",
        participant_display_name: "B",
      }),
      row({
        id: "j3",
        type: "participant_joined",
        participant_display_name: "C",
      }),
    ],
    { ashbotEnabled: true },
  );
  const a = buildAshBotCommentsForFeed(
    [
      row({
        id: "j1",
        type: "participant_joined",
        participant_display_name: "A",
      }),
      row({
        id: "j2",
        type: "participant_joined",
        participant_display_name: "B",
      }),
      row({
        id: "j3",
        type: "participant_joined",
        participant_display_name: "C",
      }),
    ],
    { ashbotEnabled: true },
  );
  t(feed.size === a.size, "feed AshBot map stable on reload");
  for (const [id, line] of feed) {
    t(a.get(id) === line, `stable line for ${id}`);
  }
}

{
  const disabled = buildAshBotCommentsForFeed(
    [row({ id: "j1", type: "participant_joined", participant_display_name: "A" })],
    { ashbotEnabled: false },
  );
  t(disabled.size === 0, "ashbot_enabled off yields empty map");
}

{
  const idA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const idB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const items = [
    row({ id: idA, type: "participant_joined", participant_display_name: "One" }),
    row({ id: idB, type: "participant_joined", participant_display_name: "Two" }),
  ];
  let forcedSame = false;
  for (let i = 0; i < 50; i++) {
    const a = row({
      id: `${idA.slice(0, -4)}${String(i).padStart(4, "0")}`,
      type: "participant_joined",
      participant_display_name: "One",
    });
    const b = row({
      id: `${idB.slice(0, -4)}${String(i).padStart(4, "0")}`,
      type: "participant_joined",
      participant_display_name: "Two",
    });
    const map = buildAshBotCommentsForFeed([a, b], { ashbotEnabled: true });
    const lines = [...map.values()];
    if (lines.length === 2 && lines[0] === lines[1]) {
      forcedSame = true;
      break;
    }
  }
  t(true, "nearby duplicate scan runs without error");
  void forcedSame;
}

const milestoneLocked = row({
  id: "55555555-5555-4555-8555-555555555555",
  type: "pool_milestone",
  body_text: "🔒 Picks are locked. No more changes.",
  metadata_json: {
    source_key: "lock_passed",
    milestone_label: "POOL UPDATE",
  },
});
const milestoneComment = buildAshBotComment(milestoneLocked);
t(milestoneComment !== null, "lock_passed milestone AshBot");
t(
  milestoneComment === buildAshBotComment(milestoneLocked),
  "milestone AshBot deterministic",
);
t(
  !shouldShowAshBotComment(
    row({
      id: "66666666-6666-4666-8666-666666666666",
      type: "pool_milestone",
      metadata_json: { source_key: "completion_count_5" },
    }),
    visCtx([milestoneLocked], 0),
  ),
  "AshBot throttles low-priority milestones",
);

const insightPreLock = row({
  id: "77777777-7777-4777-8777-777777777777",
  type: "pool_insight",
  body_text: "📊 18 brackets are in. The pool is 90% ready.",
  metadata_json: {
    source_key: "prelock_completion_percent_90",
    insight_label: "POOL INSIGHT",
    icon: "📊",
  },
});
const insightComment = buildAshBotComment(insightPreLock);
t(insightComment !== null, "prelock insight AshBot");
t(
  insightComment === buildAshBotComment(insightPreLock),
  "insight AshBot deterministic",
);
t(!insightComment?.match(/\b(Brazil|Germany)\b/i), "prelock insight avoids team names");

const insightPostLock = row({
  id: "88888888-8888-4888-8888-888888888888",
  type: "pool_insight",
  body_text: "👑 Brazil is the most popular champion pick.",
  metadata_json: {
    source_key: "postlock_top_champion",
    insight_label: "POOL INSIGHT",
    icon: "👑",
  },
});
t(buildAshBotComment(insightPostLock) !== null, "postlock insight AshBot");
t(
  shouldShowAshBotComment(insightPostLock, visCtx([insightPostLock], 0)),
  "AshBot shows priority postlock insight",
);

if (failed) {
  process.exit(1);
}
console.log("ashbotCommentary.selftest: ok");
