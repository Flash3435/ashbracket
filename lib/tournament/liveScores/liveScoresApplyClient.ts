import type {
  LiveScoresApplyScoresResult,
  LiveScoresRecalculatePoolResult,
} from "@/lib/tournament/liveScores/runLiveScoresApplyWorkflow";
import type { ApplyPlanOperation } from "./applyPlanSignature";
import {
  formatHttpDebugLine,
  postLiveScoresJson,
  type LiveScoresHttpDebug,
  type LiveScoresHttpOutcome,
} from "./liveScoresHttpClient";

export type LiveScoresClientCallResult<T> =
  | { ok: true; data: T; debug: LiveScoresHttpDebug }
  | { ok: false; error: string; debug: LiveScoresHttpDebug; data?: T };

function toClientResult<T>(outcome: LiveScoresHttpOutcome<T>): LiveScoresClientCallResult<T> {
  if (outcome.ok) {
    return { ok: true, data: outcome.data, debug: outcome.debug };
  }
  return {
    ok: false,
    error: outcome.error,
    debug: outcome.debug,
    data: outcome.data,
  };
}

export async function postLiveScoresApplyScores(input: {
  previewId: string;
  applyPlanSnapshot?: ApplyPlanOperation[];
  productionAcknowledged: boolean;
}): Promise<LiveScoresClientCallResult<LiveScoresApplyScoresResult>> {
  console.info("[ashbracket:liveScoresClient] apply submit started", {
    previewId: input.previewId,
    applyPlanSnapshotCount: input.applyPlanSnapshot?.length ?? 0,
    at: new Date().toISOString(),
  });

  const outcome = await postLiveScoresJson<LiveScoresApplyScoresResult>(
    "/api/admin/live-scores/apply",
    input,
  );
  const result = toClientResult(outcome);

  console.info("[ashbracket:liveScoresClient] apply submit completed", {
    ok: result.ok,
    debug: formatHttpDebugLine(result.debug),
  });

  return result;
}

export async function postLiveScoresRecalculatePool(input: {
  editionId: string;
  poolId: string;
  poolIndex: number;
  poolTotal: number;
  productionAcknowledged: boolean;
  revalidateWhenComplete?: boolean;
}): Promise<LiveScoresClientCallResult<LiveScoresRecalculatePoolResult>> {
  console.info("[ashbracket:liveScoresClient] recalc pool started", {
    poolId: input.poolId,
    poolIndex: input.poolIndex,
    poolTotal: input.poolTotal,
  });

  const outcome = await postLiveScoresJson<LiveScoresRecalculatePoolResult>(
    "/api/admin/live-scores/recalculate-pools",
    input,
  );
  const result = toClientResult(outcome);

  console.info("[ashbracket:liveScoresClient] recalc pool completed", {
    ok: result.ok,
    poolId: input.poolId,
    debug: formatHttpDebugLine(result.debug),
  });

  return result;
}

export { formatHttpDebugLine };
