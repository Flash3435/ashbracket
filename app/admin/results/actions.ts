"use server";

import { assertCanManagePool } from "@/lib/admin/assertCanManagePool";
import { createClient } from "@/lib/supabase/server";
import { isGlobalAdmin } from "../../../lib/auth/permissions";
import { recomputePoolLedgerForPool } from "@/lib/scoring/recomputePoolLedger";
import { revalidatePath } from "next/cache";

const KNOCKOUT_KINDS = [
  "round_of_32",
  "round_of_16",
  "quarterfinalist",
  "semifinalist",
  "finalist",
  "champion",
  "third_place_qualifier",
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

export type RecomputeStandingsResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Re-runs deterministic scoring for one pool (global or pool admin for that pool).
 */
export async function recomputeStandingsForPoolAction(
  poolId: string,
): Promise<RecomputeStandingsResult> {
  try {
    const supabase = await createClient();
    const gate = await assertCanManagePool(supabase, poolId);
    if (!gate.ok) return { ok: false, error: gate.error };

    const ledger = await recomputePoolLedgerForPool(poolId.trim());
    if (ledger.error) {
      return { ok: false, error: ledger.error };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: messageFromUnknown(e) };
  }
}

/**
 * Recomputes ledger for every pool (after editing shared results). Global admins only.
 */
export async function recomputeAllPoolsLedgerAction(): Promise<RecomputeStandingsResult> {
  try {
    const supabase = await createClient();
    if (!(await isGlobalAdmin(supabase))) {
      return {
        ok: false,
        error: "Only global administrators can refresh all pool leaderboards.",
      };
    }

    const { data: poolRows, error: poolErr } = await supabase
      .from("pools")
      .select("id");

    if (poolErr) {
      return { ok: false, error: poolErr.message };
    }

    for (const row of poolRows ?? []) {
      const ledger = await recomputePoolLedgerForPool(row.id as string);
      if (ledger.error) {
        return { ok: false, error: ledger.error };
      }
    }

    revalidatePath("/admin/results");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: messageFromUnknown(e) };
  }
}

/**
 * Saves knockout result rows (shared tournament data). **Global admins only.**
 * Recomputes ledger for **all** pools after each save.
 */
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
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !(await isGlobalAdmin(supabase))) {
      return { ok: false, error: "Only global administrators can edit tournament results." };
    }

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

    const { data: poolRows, error: poolErr } = await supabase
      .from("pools")
      .select("id");

    if (poolErr) {
      return {
        ok: false,
        error: `Result saved, but pools could not be listed to refresh scores: ${poolErr.message}`,
      };
    }

    for (const row of poolRows ?? []) {
      const id = row.id as string;
      const ledger = await recomputePoolLedgerForPool(id);
      if (ledger.error) {
        return {
          ok: false,
          error: `Result saved, but the leaderboard could not be updated for a pool: ${ledger.error}`,
        };
      }
    }

    revalidatePath("/admin/results");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: messageFromUnknown(e) };
  }
}
