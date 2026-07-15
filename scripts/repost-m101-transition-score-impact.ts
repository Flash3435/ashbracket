#!/usr/bin/env tsx
/**
 * Repost missing m101_knockout_depth_transition score-impact activities
 * from saved apply pre/post standings snapshots (no ledger writes).
 *
 * Usage:
 *   npx tsx scripts/repost-m101-transition-score-impact.ts \
 *     --from /tmp/m101-transition-apply \
 *     --confirm REPOST_M101_TRANSITION_SCORE_IMPACT
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadEnvLocal } from "./loadEnvLocal";
import { postScoreImpactForPools } from "../lib/poolActivity/scoreImpact/postScoreImpactActivity";
import type { PilotStandingsRow } from "../lib/admin/pilotStandingsSnapshot";

loadEnvLocal();

const CONFIRM_TOKEN = "REPOST_M101_TRANSITION_SCORE_IMPACT";
const args = process.argv.slice(2);
const fromIdx = args.indexOf("--from");
const fromDir = fromIdx >= 0 ? args[fromIdx + 1]?.trim() : "";
const confirmIdx = args.indexOf("--confirm");
const confirm = confirmIdx >= 0 ? args[confirmIdx + 1]?.trim() : "";

async function main() {
  if (!fromDir) {
    console.error("Pass --from <apply-report-dir>");
    process.exit(1);
  }
  if (confirm !== CONFIRM_TOKEN) {
    console.error(`Refusing: pass --confirm ${CONFIRM_TOKEN}`);
    process.exit(1);
  }

  const pre = JSON.parse(
    readFileSync(join(fromDir, "pre-standings.json"), "utf8"),
  ) as {
    pools: Record<
      string,
      { poolName: string; summaryHash: string; rows: PilotStandingsRow[] }
    >;
  };
  const post = JSON.parse(
    readFileSync(join(fromDir, "post-standings.json"), "utf8"),
  ) as {
    pools: Record<
      string,
      { poolName: string; summaryHash: string; rows: PilotStandingsRow[] }
    >;
  };

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const poolIds = Object.keys(pre.pools);
  const { data: poolRows, error } = await sb
    .from("pools")
    .select("id, tournament_edition_id, is_simulation")
    .in("id", poolIds);
  if (error) throw new Error(error.message);

  const byEdition = new Map<string, string[]>();
  for (const p of poolRows ?? []) {
    if (p.is_simulation) continue;
    const eid = p.tournament_edition_id as string;
    const list = byEdition.get(eid) ?? [];
    list.push(p.id as string);
    byEdition.set(eid, list);
  }

  const scoreSignature = `m101_knockout_depth_transition:repost:${new Date().toISOString()}`;
  for (const [editionId, ids] of byEdition) {
    const beforeByPool = new Map(
      ids.map((id) => {
        const block = pre.pools[id]!;
        return [
          id,
          { rows: block.rows, summaryHash: block.summaryHash },
        ] as const;
      }),
    );
    const afterByPool = new Map(
      ids.map((id) => {
        const block = post.pools[id]!;
        return [
          id,
          { rows: block.rows, summaryHash: block.summaryHash },
        ] as const;
      }),
    );
    const changed = ids.filter((id) => {
      const b = beforeByPool.get(id);
      const a = afterByPool.get(id);
      return b && a && b.summaryHash !== a.summaryHash;
    });
    console.log(
      `Edition ${editionId}: reposting for ${changed.length}/${ids.length} changed pools`,
    );
    for (const id of changed) {
      console.log(`  - ${pre.pools[id]?.poolName}`);
    }
    const posted = await postScoreImpactForPools({
      poolIds: ids,
      trigger: "admin_manual_recompute",
      beforeByPool,
      afterByPool,
      runContext: {
        editionId,
        scoreSignature,
        scoringCorrections: [{ kind: "m101_knockout_depth_transition" }],
      },
      editionIsSimulation: false,
    });
    console.log(
      `  inserted=${posted.inserted} updated=${posted.updated} skipped=${posted.skipped}`,
    );
    if (changed.length > 0 && posted.inserted + posted.updated === 0) {
      console.error("FAIL: no score-impact rows posted");
      process.exit(1);
    }
  }
  console.log("Done — M101 transition score-impact activities reposted.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
