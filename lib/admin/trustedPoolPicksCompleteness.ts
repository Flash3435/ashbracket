import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadPicksCompletenessInputsForPool,
  participantPicksCompleteFromDrafts,
  type PicksCompletenessInputs,
} from "../communications/picksCompleteness";
import { buildAllParticipantPickDrafts } from "../predictions/buildParticipantPickDrafts";
import { createServiceRoleClient } from "../../src/lib/supabase/service";
import {
  ADMIN_COMPLETION_MISSING_SERVICE_ROLE_MESSAGE,
  adminBuildCommitSha,
  getSupabaseProjectUrl,
  isProductionRuntime,
  isServiceRoleKeyConfigured,
} from "./adminCompletionEnv";

export type AdminCompletionDataSource =
  | "service-role"
  | "session-fallback"
  | "missing-service-role"
  | "load-failed";

export type AdminCompletionSourceDiagnostics = {
  buildCommitSha: string;
  dataSource: AdminCompletionDataSource;
  serviceRoleAvailable: boolean;
  serviceRoleRequired: boolean;
  participantCount: number;
  predictionRowCount: number;
  groupMapSize: number;
  trustedIncompleteCount: number;
  warningMessage: string | null;
};

export type AdminPicksCompletenessLoadResult =
  | {
      ok: true;
      inputs: PicksCompletenessInputs;
      diagnostics: AdminCompletionSourceDiagnostics;
    }
  | {
      ok: false;
      diagnostics: AdminCompletionSourceDiagnostics;
    };

type ResolveClientResult =
  | {
      ok: true;
      supabase: SupabaseClient;
      source: "service-role" | "session-fallback";
    }
  | {
      ok: false;
      source: "missing-service-role";
      message: string;
    };

function baseDiagnostics(
  participantCount: number,
  overrides: Partial<AdminCompletionSourceDiagnostics> = {},
): AdminCompletionSourceDiagnostics {
  return {
    buildCommitSha: adminBuildCommitSha(),
    dataSource: "load-failed",
    serviceRoleAvailable: isServiceRoleKeyConfigured(),
    serviceRoleRequired: isProductionRuntime(),
    participantCount,
    predictionRowCount: 0,
    groupMapSize: 0,
    trustedIncompleteCount: 0,
    warningMessage: null,
    ...overrides,
  };
}

function logAdminCompletionLoad(
  poolId: string,
  diagnostics: AdminCompletionSourceDiagnostics,
): void {
  console.info("[admin-completion]", {
    poolId,
    buildCommitSha: diagnostics.buildCommitSha,
    dataSource: diagnostics.dataSource,
    serviceRoleAvailable: diagnostics.serviceRoleAvailable,
    serviceRoleRequired: diagnostics.serviceRoleRequired,
    participantCount: diagnostics.participantCount,
    predictionRowCount: diagnostics.predictionRowCount,
    groupMapSize: diagnostics.groupMapSize,
    trustedIncompleteCount: diagnostics.trustedIncompleteCount,
    warningMessage: diagnostics.warningMessage,
  });
}

export function resolveAdminCompletionSupabaseClientForTest(options?: {
  fallbackSupabase?: SupabaseClient;
}): ResolveClientResult {
  return resolveAdminCompletionSupabaseClient(options);
}

function resolveAdminCompletionSupabaseClient(options?: {
  fallbackSupabase?: SupabaseClient;
}): ResolveClientResult {
  const serviceRoleAvailable = isServiceRoleKeyConfigured();
  const url = getSupabaseProjectUrl();

  if (serviceRoleAvailable && url) {
    try {
      return {
        ok: true,
        supabase: createServiceRoleClient(),
        source: "service-role",
      };
    } catch (err) {
      console.error(
        "[resolveAdminCompletionSupabaseClient] service role client failed",
        err instanceof Error ? err.message : err,
      );
    }
  }

  if (isProductionRuntime()) {
    return {
      ok: false,
      source: "missing-service-role",
      message: ADMIN_COMPLETION_MISSING_SERVICE_ROLE_MESSAGE,
    };
  }

  if (options?.fallbackSupabase) {
    console.warn(
      "[resolveAdminCompletionSupabaseClient] dev-only session fallback for admin completion",
    );
    return {
      ok: true,
      supabase: options.fallbackSupabase,
      source: "session-fallback",
    };
  }

  return {
    ok: false,
    source: "missing-service-role",
    message: ADMIN_COMPLETION_MISSING_SERVICE_ROLE_MESSAGE,
  };
}

function countTrustedIncomplete(
  inputs: PicksCompletenessInputs,
  participantIds: string[],
): number {
  let n = 0;
  for (const pid of participantIds) {
    const slots = buildAllParticipantPickDrafts({
      stageByCode: inputs.stageByCode,
      predictions: inputs.predictions,
      participantId: pid,
      bonusKeys: inputs.bonusKeys,
      teams: inputs.teams,
      groupTeamCountryCodesByLetter: inputs.groupTeamCountryCodesByLetter,
    });
    if (
      !participantPicksCompleteFromDrafts(slots, {
        knockoutBracketPicksUnlocked: inputs.knockoutBracketPicksUnlocked,
      })
    ) {
      n += 1;
    }
  }
  return n;
}

/**
 * Pool-admin completeness reads use the service role so results match
 * `scripts/diagnose-pool-completion.ts` and are not affected by participant-scoped RLS.
 * Call only after `canManagePool` / `requireManagedPool` has authorized the request.
 */
export async function loadAdminPicksCompletenessInputsForPool(
  poolId: string,
  participantIds: string[],
  options?: { fallbackSupabase?: SupabaseClient },
): Promise<AdminPicksCompletenessLoadResult> {
  const participantCount = participantIds.length;
  const resolved = resolveAdminCompletionSupabaseClient(options);

  if (!resolved.ok) {
    const diagnostics = baseDiagnostics(participantCount, {
      dataSource: resolved.source,
      warningMessage: resolved.message,
    });
    logAdminCompletionLoad(poolId, diagnostics);
    return { ok: false, diagnostics };
  }

  const inputs = await loadPicksCompletenessInputsForPool(
    resolved.supabase,
    poolId,
    participantIds,
  );

  if (!inputs) {
    const diagnostics = baseDiagnostics(participantCount, {
      dataSource: "load-failed",
      warningMessage:
        "Admin completion inputs failed to load (predictions, stages, or pool edition).",
    });
    logAdminCompletionLoad(poolId, diagnostics);
    return { ok: false, diagnostics };
  }

  const diagnostics = baseDiagnostics(participantCount, {
    dataSource: resolved.source,
    predictionRowCount: inputs.predictions.length,
    groupMapSize: Object.keys(inputs.groupTeamCountryCodesByLetter).length,
    trustedIncompleteCount: countTrustedIncomplete(inputs, participantIds),
  });
  logAdminCompletionLoad(poolId, diagnostics);
  return { ok: true, inputs, diagnostics };
}

/** Same rules as `loadParticipantIdsWithIncompletePicks`, with trusted pool-wide reads. */
export async function loadAdminParticipantIdsWithIncompletePicks(
  poolId: string,
  participantIds: string[],
  options?: { fallbackSupabase?: SupabaseClient },
): Promise<Set<string>> {
  const incomplete = new Set<string>();
  if (participantIds.length === 0) return incomplete;

  const loaded = await loadAdminPicksCompletenessInputsForPool(
    poolId,
    participantIds,
    options,
  );
  if (!loaded.ok) {
    return incomplete;
  }

  const { inputs } = loaded;
  for (const pid of participantIds) {
    const slots = buildAllParticipantPickDrafts({
      stageByCode: inputs.stageByCode,
      predictions: inputs.predictions,
      participantId: pid,
      bonusKeys: inputs.bonusKeys,
      teams: inputs.teams,
      groupTeamCountryCodesByLetter: inputs.groupTeamCountryCodesByLetter,
    });
    if (
      !participantPicksCompleteFromDrafts(slots, {
        knockoutBracketPicksUnlocked: inputs.knockoutBracketPicksUnlocked,
      })
    ) {
      incomplete.add(pid);
    }
  }

  return incomplete;
}
