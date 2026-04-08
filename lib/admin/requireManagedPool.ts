import { createClient } from "@/lib/supabase/server";
import { canManagePool } from "../auth/permissions";
import type { ManagedPoolRow } from "../pools/fetchManagedPoolsForViewer";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";

export type ManagedPoolPageContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  pool: ManagedPoolRow;
  poolId: string;
};

/**
 * Use on pool-scoped admin pages: ensures session user may manage this pool and loads the row.
 */
export async function requireManagedPool(
  poolId: string,
): Promise<ManagedPoolPageContext> {
  const trimmed = poolId.trim();
  if (!trimmed) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/admin/pools/${trimmed}`)}`);
  }

  if (!(await canManagePool(supabase, trimmed))) {
    notFound();
  }

  const { data, error } = await supabase
    .from("pools")
    .select(
      "id, name, created_at, updated_at, lock_at, is_public, join_code, created_by_user_id, entry_fee_cents, prize_distribution_json, group_advance_exact_points, group_advance_wrong_slot_points, tie_break_note",
    )
    .eq("id", trimmed)
    .single();

  if (error || !data) {
    notFound();
  }

  return {
    supabase,
    pool: data as ManagedPoolRow,
    poolId: trimmed,
  };
}
