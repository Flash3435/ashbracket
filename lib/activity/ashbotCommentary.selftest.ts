import {
  buildAshBotComment,
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
t(
  buildAshBotComment(recapItem) === recapComment,
  "recap deterministic",
);

const recapLive = buildAshBotComment(
  row({
    id: "55555555-5555-4555-8555-555555555555",
    type: "ash_daily_recap",
    metadata_json: { participant_count: 5, submitted_count: 2, recap_date: "2026-06-04" },
  }),
  {
    liveRecapFacts: {
      participantCount: 10,
      submittedCount: 7,
      topChampionTeamName: null,
      topChampionPickCount: 0,
    },
    liveRecapDateYmd: "2026-06-04",
  },
);
t(recapLive?.includes("7") === true && recapLive?.includes("10") === true, "live recap override");

t(buildAshBotComment(row({ id: "x", type: "participant_joined" })) === null, "join without name");

if (failed) {
  process.exit(1);
}
console.log("ashbotCommentary.selftest: ok");
