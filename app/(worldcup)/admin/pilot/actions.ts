"use server";

import { isGlobalAdmin } from "@/lib/auth/permissions";
import { sendPasswordResetEmail } from "@/lib/auth/sendPasswordResetEmail";
import {
  capturePoolStandingsState,
  comparePilotStandings,
  type PilotStandingsRow,
} from "@/lib/admin/pilotStandingsSnapshot";
import { logPilotVerificationEvent } from "@/lib/admin/pilotVerificationLog";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type PilotSnapshotActionResult =
  | {
      ok: true;
      snapshotId: string;
      summaryHash: string;
      rowCount: number;
      ledgerRecomputedAt: string | null;
    }
  | { ok: false; error: string };

export type PilotCompareActionResult =
  | {
      ok: true;
      matches: boolean;
      baselineLabel: string;
      baselineHash: string;
      currentHash: string;
      diffs: { displayName: string; baselinePoints: number; currentPoints: number }[];
    }
  | { ok: false; error: string };

async function requireGlobalAdminUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await isGlobalAdmin(supabase))) {
    return { ok: false as const, error: "Only global administrators can use pilot tools." };
  }
  return { ok: true as const, supabase, user };
}

export async function savePilotStandingsSnapshotAction(input: {
  poolId: string;
  label?: string;
}): Promise<PilotSnapshotActionResult> {
  try {
    const gate = await requireGlobalAdminUser();
    if (!gate.ok) return gate;

    const poolId = input.poolId.trim();
    const label = (input.label?.trim() || "pre-pilot").slice(0, 80);
    if (!poolId) return { ok: false, error: "Choose a pool." };

    const { data: pool, error: poolErr } = await gate.supabase
      .from("pools")
      .select("id, name, is_simulation")
      .eq("id", poolId)
      .maybeSingle();

    if (poolErr) return { ok: false, error: poolErr.message };
    if (!pool) return { ok: false, error: "Pool not found." };
    if (pool.is_simulation) {
      return {
        ok: false,
        error: "Save snapshots for a live pool only — not simulation test pools.",
      };
    }

    const capture = await capturePoolStandingsState(gate.supabase, poolId);
    const { data: inserted, error: insErr } = await gate.supabase
      .from("admin_pilot_standings_snapshots")
      .insert({
        pool_id: poolId,
        label,
        captured_by_user_id: gate.user.id,
        ledger_recomputed_at: capture.ledgerRecomputedAt,
        summary_hash: capture.summaryHash,
        rows: capture.rows,
      })
      .select("id")
      .single();

    if (insErr) return { ok: false, error: insErr.message };

    await logPilotVerificationEvent(gate.supabase, {
      eventType: "standings_snapshot_saved",
      poolId,
      userId: gate.user.id,
      message: `Saved standings snapshot “${label}” for ${pool.name as string} (${capture.rows.length} people, hash ${capture.summaryHash}).`,
      payload: {
        snapshotId: inserted.id,
        label,
        summaryHash: capture.summaryHash,
        rowCount: capture.rows.length,
      },
    });

    revalidatePath("/admin/pilot");
    revalidatePath("/admin/simulation");

    return {
      ok: true,
      snapshotId: inserted.id as string,
      summaryHash: capture.summaryHash,
      rowCount: capture.rows.length,
      ledgerRecomputedAt: capture.ledgerRecomputedAt,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not save snapshot.",
    };
  }
}

export async function compareLivePoolToSnapshotAction(input: {
  poolId: string;
  snapshotId?: string;
}): Promise<PilotCompareActionResult> {
  try {
    const gate = await requireGlobalAdminUser();
    if (!gate.ok) return gate;

    const poolId = input.poolId.trim();
    if (!poolId) return { ok: false, error: "Choose a pool." };

    const snapSelect =
      "id, label, rows, summary_hash, captured_at" as const;
    const { data: snap, error: snapErr } = input.snapshotId?.trim()
      ? await gate.supabase
          .from("admin_pilot_standings_snapshots")
          .select(snapSelect)
          .eq("id", input.snapshotId.trim())
          .maybeSingle()
      : await gate.supabase
          .from("admin_pilot_standings_snapshots")
          .select(snapSelect)
          .eq("pool_id", poolId)
          .order("captured_at", { ascending: false })
          .limit(1)
          .maybeSingle();
    if (snapErr) return { ok: false, error: snapErr.message };
    if (!snap) {
      return {
        ok: false,
        error: "No snapshot found for this pool. Save a pre-pilot snapshot first.",
      };
    }

    const baseline = (snap.rows as PilotStandingsRow[]) ?? [];
    const current = await capturePoolStandingsState(gate.supabase, poolId);
    const cmp = comparePilotStandings(baseline, current.rows);

    const { data: pool } = await gate.supabase
      .from("pools")
      .select("name")
      .eq("id", poolId)
      .maybeSingle();

    const poolName = (pool?.name as string | undefined) ?? "pool";
    const message = cmp.matches
      ? `Live standings unchanged for “${poolName}” vs snapshot “${snap.label as string}”.`
      : `Live standings CHANGED for “${poolName}” vs snapshot “${snap.label as string}” (${cmp.diffs.length} difference(s)).`;

    await logPilotVerificationEvent(gate.supabase, {
      eventType: "live_standings_unchanged_check",
      poolId,
      userId: gate.user.id,
      message,
      payload: {
        matches: cmp.matches,
        snapshotId: snap.id,
        baselineHash: cmp.baselineHash,
        currentHash: cmp.currentHash,
        diffCount: cmp.diffs.length,
      },
    });

    revalidatePath("/admin/pilot");

    return {
      ok: true,
      matches: cmp.matches,
      baselineLabel: snap.label as string,
      baselineHash: cmp.baselineHash,
      currentHash: cmp.currentHash,
      diffs: cmp.diffs.map((d) => ({
        displayName: d.displayName,
        baselinePoints: d.baselinePoints,
        currentPoints: d.currentPoints,
      })),
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not compare standings.",
    };
  }
}

export type PasswordResetSupportActionResult =
  | { ok: true; redirectTo: string }
  | { ok: false; error: string };

export async function sendPasswordResetSupportAction(
  email: string,
): Promise<PasswordResetSupportActionResult> {
  const gate = await requireGlobalAdminUser();
  if (!gate.ok) {
    return { ok: false, error: gate.error };
  }

  const result = await sendPasswordResetEmail(gate.supabase, email);
  if (!result.ok) {
    if (result.error === "Enter a valid email address.") {
      return { ok: false, error: result.error };
    }
    return {
      ok: false,
      error: "Could not send recovery email. Try again in a few minutes.",
    };
  }

  return { ok: true, redirectTo: result.redirectTo };
}
