import type { SupabaseClient } from "@supabase/supabase-js";
import {
  detectDuplicateDisplayNamesInPool,
  type ParticipantScoringIntegrityIssue,
} from "@/lib/participant/participantScoringConsistency";

export type PoolScoringIntegrityDiagnostics = {
  issues: ParticipantScoringIntegrityIssue[];
  warningMessage: string | null;
};

export async function loadPoolScoringIntegrityDiagnostics(
  supabase: SupabaseClient,
  poolId: string,
): Promise<PoolScoringIntegrityDiagnostics> {
  const [
    { data: participants, error: participantsErr },
  ] = await Promise.all([
    supabase
      .from("participants")
      .select("id, display_name")
      .eq("pool_id", poolId),
  ]);

  if (participantsErr) {
    return {
      issues: [],
      warningMessage: participantsErr.message,
    };
  }

  const participantIds = (participants ?? []).map((row) => row.id as string);
  const issues: ParticipantScoringIntegrityIssue[] = [];

  if (participantIds.length > 0) {
    const [
      { data: ledgerRows, error: ledgerErr },
      { data: predictionRows, error: predictionErr },
    ] = await Promise.all([
      supabase
        .from("points_ledger")
        .select("id, participant_id, pool_id, points_delta")
        .in("participant_id", participantIds),
      supabase
        .from("predictions")
        .select("id, participant_id, pool_id")
        .in("participant_id", participantIds),
    ]);

    if (ledgerErr || predictionErr) {
      return {
        issues: [],
        warningMessage:
          ledgerErr?.message ??
          predictionErr?.message ??
          "Failed to load scoring integrity diagnostics.",
      };
    }

    for (const row of ledgerRows ?? []) {
      if ((row.pool_id as string) === poolId) continue;
      issues.push({
        kind: "ledger_pool_mismatch",
        ledgerId: row.id as string,
        ledgerPoolId: row.pool_id as string,
        participantPoolId: poolId,
        pointsDelta: Number(row.points_delta ?? 0),
      });
    }

    for (const row of predictionRows ?? []) {
      if ((row.pool_id as string) === poolId) continue;
      issues.push({
        kind: "prediction_pool_mismatch",
        predictionId: row.id as string,
        predictionPoolId: row.pool_id as string,
        participantPoolId: poolId,
      });
    }
  }

  issues.push(
    ...detectDuplicateDisplayNamesInPool(
      (participants ?? []).map((row) => ({
        participantId: row.id as string,
        displayName: String(row.display_name ?? ""),
        poolId,
      })),
    ),
  );

  const warningMessage =
    issues.length === 0
      ? null
      : formatPoolScoringIntegrityWarning(issues);

  return { issues, warningMessage };
}

function formatPoolScoringIntegrityWarning(
  issues: ParticipantScoringIntegrityIssue[],
): string {
  const ledgerMismatches = issues.filter(
    (issue) => issue.kind === "ledger_pool_mismatch",
  ).length;
  const predictionMismatches = issues.filter(
    (issue) => issue.kind === "prediction_pool_mismatch",
  ).length;
  const duplicateNames = issues.filter(
    (issue) => issue.kind === "duplicate_display_name",
  ).length;

  const parts: string[] = [];
  if (ledgerMismatches > 0) {
    parts.push(
      `${ledgerMismatches} ledger row(s) are attached to a different pool than their participant record`,
    );
  }
  if (predictionMismatches > 0) {
    parts.push(
      `${predictionMismatches} prediction row(s) are attached to a different pool than their participant record`,
    );
  }
  if (duplicateNames > 0) {
    parts.push(
      `${duplicateNames} duplicate display name group(s) in this pool (profiles and leaderboard links can be confused)`,
    );
  }

  return `${parts.join("; ")}. Recompute standings after repair, or use participant move/merge tools instead of manual pool edits.`;
}
