import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildCompletionDiagnosticRows,
  loadPicksCompletenessInputsForPool,
  type BracketCompletionDiagnosticRow,
} from "./picksCompleteness";

export type { BracketCompletionDiagnosticRow };

/** Stored on `pool_activity.metadata_json` when recap diagnostics are enabled. */
export const RECAP_METADATA_COMPLETION_DIAGNOSTICS_KEY = "completion_diagnostics";

/**
 * Env `ASHBRACKET_RECAP_COMPLETION_DIAGNOSTICS=1` enables per-participant completion
 * snapshots on new daily recap rows (`metadata_json.completion_diagnostics`).
 */
export function recapCompletionDiagnosticsEnabled(): boolean {
  return process.env.ASHBRACKET_RECAP_COMPLETION_DIAGNOSTICS === "1";
}

/**
 * One round-trip for stages/rules/predictions/RPC, then per-participant analysis.
 */
export async function loadBracketCompletionDiagnosticsForPool(
  supabase: SupabaseClient,
  poolId: string,
  participantRows: Array<{ id: string; display_name: string | null }>,
): Promise<BracketCompletionDiagnosticRow[]> {
  const inputs = await loadPicksCompletenessInputsForPool(
    supabase,
    poolId,
    participantRows.map((p) => p.id),
  );
  if (!inputs) return [];
  return buildCompletionDiagnosticRows(inputs, poolId, participantRows);
}

export function completionDiagnosticsStaleNote(): string {
  return (
    "Daily recap rows created before the participant bracket-section fix may show " +
    "completion counts that disagreed with other screens; delete mistaken ash_daily_recap " +
    "rows for that pool/day if you need a regenerated recap."
  );
}
