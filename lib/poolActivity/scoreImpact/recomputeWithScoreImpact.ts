import type { SupabaseClient } from "@supabase/supabase-js";
import {
  capturePoolStandingsState,
  type PilotStandingsCapture,
} from "@/lib/admin/pilotStandingsSnapshot";
import {
  recomputePoolLedgerWithClient,
  type WcLedgerRecomputeTrigger,
} from "@/lib/scoring/recomputePoolLedger";
import { mapWithConcurrency } from "@/lib/util/mapWithConcurrency";
import { captureEditionBonusLeaders } from "./loadScoreImpactContext";
import { postScoreImpactForPools } from "./postScoreImpactActivity";
import { isScoreImpactLedgerTrigger } from "./scoreImpactTriggers";
import type { ScoreImpactRunContext, ScoreImpactStandingsSnapshot } from "./types";

const POOL_RECOMPUTE_CONCURRENCY = 4;

function toSnapshot(capture: PilotStandingsCapture): ScoreImpactStandingsSnapshot {
  return {
    rows: capture.rows,
    summaryHash: capture.summaryHash,
  };
}

export async function recomputePoolLedgersWithScoreImpact(
  supabase: SupabaseClient,
  poolIds: readonly string[],
  trigger: WcLedgerRecomputeTrigger,
  runContext: ScoreImpactRunContext = {},
  options?: {
    editionIsSimulation?: boolean;
    onPoolStart?: (poolId: string, index: number) => void;
    onPoolEnd?: (poolId: string, index: number, error?: string) => void;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const scoreImpactEnabled = isScoreImpactLedgerTrigger(trigger);
  const beforeByPool = new Map<string, ScoreImpactStandingsSnapshot>();

  if (scoreImpactEnabled) {
    await mapWithConcurrency(poolIds, POOL_RECOMPUTE_CONCURRENCY, async (poolId) => {
      beforeByPool.set(poolId, toSnapshot(await capturePoolStandingsState(supabase, poolId)));
    });
  }

  const beforeBonus =
    scoreImpactEnabled && runContext.editionId
      ? await captureEditionBonusLeaders(supabase, runContext.editionId)
      : null;

  const recomputeResults = await mapWithConcurrency(
    poolIds,
    POOL_RECOMPUTE_CONCURRENCY,
    async (poolId, index) => {
      options?.onPoolStart?.(poolId, index);
      const ledger = await recomputePoolLedgerWithClient(supabase, poolId, {
        ledgerTrigger: trigger,
      });
      options?.onPoolEnd?.(poolId, index, ledger.error);
      return { poolId, error: ledger.error };
    },
  );

  const failed = recomputeResults.find((row) => row.error);
  if (failed?.error) {
    return { ok: false, error: failed.error };
  }

  if (!scoreImpactEnabled) {
    return { ok: true };
  }

  const afterByPool = new Map<string, ScoreImpactStandingsSnapshot>();
  await mapWithConcurrency(poolIds, POOL_RECOMPUTE_CONCURRENCY, async (poolId) => {
    afterByPool.set(poolId, toSnapshot(await capturePoolStandingsState(supabase, poolId)));
  });

  const afterBonus = runContext.editionId
    ? await captureEditionBonusLeaders(supabase, runContext.editionId)
    : null;

  await postScoreImpactForPools({
    poolIds,
    trigger,
    beforeByPool,
    afterByPool,
    runContext,
    beforeBonusLeaders: beforeBonus,
    afterBonusLeaders: afterBonus,
    editionIsSimulation: options?.editionIsSimulation,
  });

  return { ok: true };
}
