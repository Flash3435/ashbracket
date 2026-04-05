"use server";

import { createClient } from "@/lib/supabase/server";
import { recomputePoolLedgerForPool } from "@/lib/scoring/recomputePoolLedger";
import { SAMPLE_POOL_ID } from "../../../lib/config/sample-pool";

const KNOCKOUT_KINDS = [
  "quarterfinalist",
  "semifinalist",
  "finalist",
  "champion",
] as const;

export type KnockoutResultKind = (typeof KNOCKOUT_KINDS)[number];

export type SetKnockoutResultResult =
  | { ok: true }
  | { ok: false; error: string };

function messageFromUnknown(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong.";
}

function isKnockoutKind(k: string): k is KnockoutResultKind {
  return (KNOCKOUT_KINDS as readonly string[]).includes(k);
}

/**
 * Saves or clears one knockout result row (snake_case at Supabase), then reruns
 * deterministic scoring for the configured pool and replaces `points_ledger` via RPC.
 */
export type RecomputeStandingsResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Re-runs deterministic scoring for the sample pool and replaces `points_ledger`
 * via RPC (same path as after saving a result). Use when data looks out of sync.
 */
export async function recomputeStandingsForSamplePoolAction(): Promise<RecomputeStandingsResult> {
  try {
    const ledger = await recomputePoolLedgerForPool(SAMPLE_POOL_ID);
    if (ledger.error) {
      return { ok: false, error: ledger.error };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: messageFromUnknown(e) };
  }
}

export async function setKnockoutResultAction(input: {
  tournamentStageId: string;
  kind: string;
  slotKey: string | null;
  teamId: string | null;
}): Promise<SetKnockoutResultResult> {
  if (!isKnockoutKind(input.kind)) {
    return { ok: false, error: "Invalid result kind." };
  }

  try {
    const supabase = await createClient();

    if (!input.teamId) {
      let q = supabase
        .from("results")
        .delete()
        .eq("tournament_stage_id", input.tournamentStageId)
        .eq("kind", input.kind)
        .is("group_code", null);

      q =
        input.slotKey === null
          ? q.is("slot_key", null)
          : q.eq("slot_key", input.slotKey);

      const { error } = await q;
      if (error) return { ok: false, error: error.message };
    } else {
      const resolvedAt = new Date().toISOString();
      const { error } = await supabase.from("results").upsert(
        {
          tournament_stage_id: input.tournamentStageId,
          kind: input.kind,
          team_id: input.teamId,
          group_code: null,
          slot_key: input.slotKey,
          resolved_at: resolvedAt,
          source: "manual",
          locked: true,
        },
        {
          onConflict: "tournament_stage_id,kind,group_code,slot_key",
        },
      );

      if (error) return { ok: false, error: error.message };
    }

    const ledger = await recomputePoolLedgerForPool(SAMPLE_POOL_ID);
    if (ledger.error) {
      return {
        ok: false,
        error: `Result updated, but standings could not be recomputed: ${ledger.error}`,
      };
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: messageFromUnknown(e) };
  }
}
