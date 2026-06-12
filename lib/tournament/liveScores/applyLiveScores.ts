import type { SupabaseClient } from "@supabase/supabase-js";
import type { OfficialMatchScorePatch } from "../syncOfficialTournament";
import {
  syncOfficialTournament,
  type PatchApplyOutcome,
  type SyncOfficialTournamentSummary,
} from "../syncOfficialTournament";
import type {
  LiveScoresApplySummary,
  OfficialMatchScorePatchInput,
  ScoreChangePreviewRow,
} from "./types";
import { verifyAppliedLiveScorePatches } from "./verifyAppliedPatches";

export type SyncOfficialTournamentFn = (
  supabase: SupabaseClient,
  options: {
    editionCode: string;
    poolIds: string[];
    patches?: OfficialMatchScorePatch[];
  },
) => ReturnType<typeof syncOfficialTournament>;

export const LIVE_SCORES_REVALIDATED_PATHS = [
  "/tournament",
  "/admin/tournament",
  "/admin/tournament/live-scores",
  "/admin/tournament/status",
  "/admin/results",
  "/admin/activity",
  "/rules",
  "/account/activity",
] as const;

export function toOfficialMatchScorePatches(
  patches: OfficialMatchScorePatchInput[],
): OfficialMatchScorePatch[] {
  return patches.map((p) => ({
    matchCode: p.matchCode,
    homeGoals: p.homeGoals,
    awayGoals: p.awayGoals,
    homePenalties: p.homePenalties,
    awayPenalties: p.awayPenalties,
    status: p.status,
  }));
}

export async function persistProviderFixtureIds(
  supabase: SupabaseClient,
  updates: Array<{ matchId: string; providerFixtureId: string }>,
): Promise<{ saved: number; error?: string }> {
  let saved = 0;
  for (const u of updates) {
    const { error } = await supabase
      .from("tournament_matches")
      .update({ provider_fixture_id: u.providerFixtureId })
      .eq("id", u.matchId)
      .is("provider_fixture_id", null);
    if (error) return { saved, error: error.message };
    saved += 1;
  }
  return { saved };
}

export type ApplyLiveScoresResult =
  | {
      ok: true;
      matchesUpdated: number;
      summary: SyncOfficialTournamentSummary;
      applySummary: LiveScoresApplySummary;
      warnings: string[];
    }
  | {
      ok: false;
      error: string;
      applySummary?: LiveScoresApplySummary;
      warnings?: string[];
    };

function buildApplySummary(input: {
  previewRows: ScoreChangePreviewRow[];
  patchOutcome: PatchApplyOutcome;
  verificationDetails: LiveScoresApplySummary["details"];
  providerFixtureIdsSaved: number;
  ledgersRecomputed: number;
}): LiveScoresApplySummary {
  const planned = input.previewRows.filter((r) => r.willUpdate).length;
  const written = input.patchOutcome.applied.length;
  const skipped = input.patchOutcome.skipped.length;
  const failedVerification = input.verificationDetails.filter((d) => d.planned && !d.verified).length;

  return {
    planned,
    written,
    skipped,
    failedVerification,
    providerFixtureIdsSaved: input.providerFixtureIdsSaved,
    ledgersRecomputed: input.ledgersRecomputed,
    revalidatedPaths: [...LIVE_SCORES_REVALIDATED_PATHS],
    details: input.verificationDetails,
  };
}

/**
 * Apply score patches via the existing official tournament sync path.
 * Does not change scoring rules — delegates to syncOfficialTournament.
 */
export async function applyLiveScoresAndSync(
  supabase: SupabaseClient,
  options: {
    editionId: string;
    editionCode: string;
    poolIds: string[];
    previewRows: ScoreChangePreviewRow[];
    patches: OfficialMatchScorePatchInput[];
    providerFixtureIdUpdates?: Array<{ matchId: string; providerFixtureId: string }>;
    syncFn?: SyncOfficialTournamentFn;
  },
): Promise<ApplyLiveScoresResult> {
  const warnings: string[] = [];
  const syncFn = options.syncFn ?? syncOfficialTournament;

  if (options.patches.length === 0) {
    return { ok: false, error: "No score changes to apply.", warnings };
  }

  let providerFixtureIdsSaved = 0;
  if (options.providerFixtureIdUpdates?.length) {
    const saved = await persistProviderFixtureIds(supabase, options.providerFixtureIdUpdates);
    providerFixtureIdsSaved = saved.saved;
    if (saved.error) {
      warnings.push(`Could not save provider fixture ids: ${saved.error}`);
    }
  }

  const out = await syncFn(supabase, {
    editionCode: options.editionCode,
    poolIds: options.poolIds,
    patches: toOfficialMatchScorePatches(options.patches),
  });

  if (!out.ok) {
    return { ok: false, error: out.error, warnings };
  }

  const skipped = out.patchOutcome.skipped.map((s) => ({
    matchCode: s.matchCode,
    reason: s.reason,
  }));

  const verified = await verifyAppliedLiveScorePatches(
    supabase,
    options.editionId,
    options.previewRows,
    options.patches,
    out.patchOutcome.applied,
    skipped,
  );

  const applySummary = buildApplySummary({
    previewRows: options.previewRows,
    patchOutcome: out.patchOutcome,
    verificationDetails: verified.details,
    providerFixtureIdsSaved,
    ledgersRecomputed: out.summary.poolsRecalculated,
  });

  if (!verified.ok) {
    return {
      ok: false,
      error: verified.error,
      applySummary,
      warnings,
    };
  }

  if (out.patchOutcome.skipped.length > 0) {
    const skippedCodes = out.patchOutcome.skipped
      .map((s) => `${s.matchCode} (${s.reason})`)
      .join(", ");
    warnings.push(`Skipped ${out.patchOutcome.skipped.length} patch(es): ${skippedCodes}`);
  }

  return {
    ok: true,
    matchesUpdated: out.patchOutcome.applied.length,
    summary: out.summary,
    applySummary,
    warnings,
  };
}
