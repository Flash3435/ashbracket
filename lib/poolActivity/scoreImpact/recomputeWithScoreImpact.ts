import type { SupabaseClient } from "@supabase/supabase-js";
import {
  capturePoolStandingsState,
  type PilotStandingsCapture,
} from "@/lib/admin/pilotStandingsSnapshot";
import {
  recomputePoolLedgerWithClient,
  type WcLedgerRecomputeTrigger,
} from "@/lib/scoring/recomputePoolLedger";
import { captureEditionBonusLeaders } from "./loadScoreImpactContext";
import { postScoreImpactForPools } from "./postScoreImpactActivity";
import { isScoreImpactLedgerTrigger } from "./scoreImpactTriggers";
import type { ScoreImpactRunContext, ScoreImpactStandingsSnapshot } from "./types";

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
  options?: { editionIsSimulation?: boolean },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const scoreImpactEnabled = isScoreImpactLedgerTrigger(trigger);
  const beforeByPool = new Map<string, ScoreImpactStandingsSnapshot>();

  if (scoreImpactEnabled) {
    for (const poolId of poolIds) {
      beforeByPool.set(poolId, toSnapshot(await capturePoolStandingsState(supabase, poolId)));
    }
  }

  const beforeBonus =
    scoreImpactEnabled && runContext.editionId
      ? await captureEditionBonusLeaders(supabase, runContext.editionId)
      : null;

  for (const poolId of poolIds) {
    const ledger = await recomputePoolLedgerWithClient(supabase, poolId, {
      ledgerTrigger: trigger,
    });
    if (ledger.error) {
      return { ok: false, error: ledger.error };
    }
  }

  if (!scoreImpactEnabled) {
    return { ok: true };
  }

  const afterByPool = new Map<string, ScoreImpactStandingsSnapshot>();
  for (const poolId of poolIds) {
    afterByPool.set(poolId, toSnapshot(await capturePoolStandingsState(supabase, poolId)));
  }

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
