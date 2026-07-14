import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isThirdPlaceScoringBackfillActivity,
  postThirdPlaceScoringBackfillNoticeForPool,
  postThirdPlaceScoringBackfillNoticesForPools,
  THIRD_PLACE_SCORING_BACKFILL_2026_SOURCE_KEY,
  tryPostThirdPlaceScoringBackfillNoticesForPools,
} from "./thirdPlaceScoringBackfillAnnouncement";

let failed = 0;
function t(cond: boolean, msg: string) {
  if (!cond) {
    failed++;
    console.error("FAIL:", msg);
  }
}

const here = dirname(fileURLToPath(import.meta.url));

type FakeRow = { id: string; pool_id: string; type: string; source_key: string };

function createFakeServiceRoleClient(store: FakeRow[]) {
  let insertCalls = 0;
  let selectCalls = 0;
  let forceInsertError: { code?: string; message: string } | null = null;

  const client = {
    from(table: string) {
      if (table !== "pool_activity") {
        throw new Error(`unexpected table ${table}`);
      }
      let poolId: string | null = null;
      let type: string | null = null;
      let sourceKey: string | null = null;

      return {
        select(_cols: string) {
          selectCalls += 1;
          return {
            eq(col: string, val: string) {
              if (col === "pool_id") poolId = val;
              if (col === "type") type = val;
              if (col === "metadata_json->>source_key") sourceKey = val;
              return this;
            },
            async maybeSingle() {
              const hit = store.find(
                (r) =>
                  r.pool_id === poolId &&
                  r.type === type &&
                  r.source_key === sourceKey,
              );
              return { data: hit ? { id: hit.id } : null, error: null };
            },
          };
        },
        async insert(row: {
          pool_id: string;
          type: string;
          metadata_json: { source_key?: string };
        }) {
          insertCalls += 1;
          if (forceInsertError) {
            return { error: forceInsertError };
          }
          const key = row.metadata_json.source_key ?? "";
          if (
            store.some(
              (r) =>
                r.pool_id === row.pool_id &&
                r.type === row.type &&
                r.source_key === key,
            )
          ) {
            return { error: { code: "23505", message: "duplicate" } };
          }
          store.push({
            id: `row-${store.length + 1}`,
            pool_id: row.pool_id,
            type: row.type,
            source_key: key,
          });
          return { error: null };
        },
      };
    },
  };

  return {
    client: client as unknown as SupabaseClient,
    get insertCalls() {
      return insertCalls;
    },
    get selectCalls() {
      return selectCalls;
    },
    setInsertError(err: { code?: string; message: string } | null) {
      forceInsertError = err;
    },
  };
}

async function main(): Promise<void> {
  // --- labeling helpers ---
  t(
    isThirdPlaceScoringBackfillActivity({
      type: "pool_milestone",
      metadata_json: { source_key: THIRD_PLACE_SCORING_BACKFILL_2026_SOURCE_KEY },
    }),
    "recognizes third-place backfill milestone",
  );
  t(
    !isThirdPlaceScoringBackfillActivity({
      type: "pool_milestone",
      metadata_json: { source_key: "completion_50" },
    }),
    "ignores other milestones",
  );

  // --- service-role insert + dedupe (injected fake; not authenticated client) ---
  {
    const store: FakeRow[] = [];
    const fake = createFakeServiceRoleClient(store);
    const createClient = () => fake.client;

    const first = await postThirdPlaceScoringBackfillNoticeForPool(
      "pool-a",
      createClient,
    );
    t(first === "inserted", "first notice inserts via writer client");
    t(store.length === 1, "one row stored after first insert");
    t(fake.insertCalls === 1, "one insert attempted");

    const second = await postThirdPlaceScoringBackfillNoticeForPool(
      "pool-a",
      createClient,
    );
    t(second === "skipped", "repeat for same pool is skipped");
    t(store.length === 1, "no duplicate row after repeat");
    t(fake.insertCalls === 1, "no second insert when existing found");
  }

  {
    const store: FakeRow[] = [];
    const fake = createFakeServiceRoleClient(store);
    const createClient = () => fake.client;

    const out = await postThirdPlaceScoringBackfillNoticesForPools(
      ["pool-a", "pool-b", "pool-a"],
      createClient,
    );
    t(out.inserted === 2, "batch inserts once per distinct new pool");
    t(out.skipped === 1, "batch skips already-written pool in same run");
    t(store.length === 2, "two pools stored after batch");
  }

  {
    const store: FakeRow[] = [];
    const fake = createFakeServiceRoleClient(store);
    fake.setInsertError({
      message:
        'new row violates row-level security policy for table "pool_activity"',
    });
    const createClient = () => fake.client;

    let threw = false;
    try {
      await postThirdPlaceScoringBackfillNoticeForPool("pool-rls", createClient);
    } catch (e) {
      threw = e instanceof Error && e.message.includes("row-level security");
    }
    t(threw, "direct writer still surfaces hard insert errors");
  }

  {
    const store: FakeRow[] = [];
    const fake = createFakeServiceRoleClient(store);
    fake.setInsertError({
      message:
        'new row violates row-level security policy for table "pool_activity"',
    });
    const createClient = () => fake.client;

    const priorError = console.error;
    const logs: unknown[] = [];
    console.error = (...args: unknown[]) => {
      logs.push(args);
    };
    try {
      const out = await tryPostThirdPlaceScoringBackfillNoticesForPools(
        ["pool-iso"],
        createClient,
      );
      t(
        Boolean(out.error && out.error.includes("row-level security")),
        "try wrapper captures RLS failure without throwing",
      );
      t(
        out.inserted === 0 && out.skipped === 0,
        "try wrapper returns zero counts on fail",
      );
      t(
        logs.some(
          (entry) =>
            Array.isArray(entry) &&
            String(entry[0]).includes("third-place backfill notices failed"),
        ),
        "try wrapper logs server-side context on failure",
      );
    } finally {
      console.error = priorError;
    }
  }

  // --- source contracts: production uses service role; sync isolates failure ---
  const announcementSrc = readFileSync(
    join(here, "thirdPlaceScoringBackfillAnnouncement.ts"),
    "utf8",
  );
  t(
    announcementSrc.includes("createServiceRoleClient"),
    "announcement module imports createServiceRoleClient",
  );
  t(
    /createClient:\s*ThirdPlaceBackfillNoticeClientFactory\s*=\s*createServiceRoleClient/.test(
      announcementSrc,
    ),
    "default client factory is createServiceRoleClient",
  );
  t(
    !/export async function postThirdPlaceScoringBackfillNoticeForPool\(\s*supabase:\s*SupabaseClient/.test(
      announcementSrc,
    ),
    "notice writer no longer takes a caller-supplied SupabaseClient as first arg",
  );
  t(
    !/export async function postThirdPlaceScoringBackfillNoticesForPools\(\s*supabase:\s*SupabaseClient/.test(
      announcementSrc,
    ),
    "batch writer no longer takes a caller-supplied SupabaseClient as first arg",
  );

  const syncSrc = readFileSync(
    join(here, "../tournament/syncOfficialTournament.ts"),
    "utf8",
  );
  const actionsSrc = readFileSync(
    join(here, "../../app/(worldcup)/admin/tournament/actions.ts"),
    "utf8",
  );

  t(
    actionsSrc.includes("createClient()") &&
      actionsSrc.includes("syncOfficialTournament(supabase"),
    "live update action starts with authenticated createClient and passes it to sync",
  );
  t(
    syncSrc.includes("tryPostThirdPlaceScoringBackfillNoticesForPools"),
    "sync posts notices via try wrapper after ledger success",
  );
  t(
    !/postThirdPlaceScoringBackfillNoticesForPools\(\s*supabase/.test(syncSrc) &&
      !/tryPostThirdPlaceScoringBackfillNoticesForPools\(\s*supabase/.test(syncSrc),
    "sync does not pass its authenticated supabase client into the notice writer",
  );
  t(
    syncSrc.includes("third_place_backfill_notices_failed") ||
      syncSrc.includes("noticeOut.error"),
    "sync logs notice failures without returning ok:false from that path alone",
  );

  // Failure isolation: after poolsRecalculated is set, notice errors must not
  // cause an immediate `return { ok: false` in the same block.
  {
    const afterComplete = syncSrc.split("sync.pool_recalc_complete")[1] ?? "";
    const noticeBlock =
      afterComplete.split("} else if (skipPoolRecalculation)")[0] ?? "";
    t(
      noticeBlock.includes("tryPostThirdPlaceScoringBackfillNoticesForPools"),
      "notice attempt sits after pool_recalc_complete",
    );
    t(
      !/return \{\s*ok:\s*false/.test(noticeBlock),
      "notice failure path after recompute does not return ok:false",
    );
  }

  t(
    syncSrc.includes("pool_activity source_key dedupe") ||
      syncSrc.includes("source_key dedupe"),
    "sync documents that notice uniqueness relies on pool_activity dedupe",
  );

  if (failed) {
    process.exit(1);
  }
  console.log("thirdPlaceScoringBackfillAnnouncement.selftest: ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
