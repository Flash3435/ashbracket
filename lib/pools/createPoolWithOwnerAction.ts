"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type CreatePoolWithOwnerResult =
  | { ok: true; poolId: string }
  | { ok: false; error: string };

/**
 * Creates a pool with `created_by_user_id` and an `pool_admins` owner row via
 * `create_pool_with_owner` (SECURITY DEFINER). No UI in Phase 1 — for server
 * routes and later onboarding.
 */
export async function createPoolWithOwnerAction(input: {
  name: string;
  joinCode?: string | null;
}): Promise<CreatePoolWithOwnerResult> {
  const name = input.name.trim();
  if (!name) {
    return { ok: false, error: "Pool name is required." };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { ok: false, error: "You must be signed in to create a pool." };
    }

    const { data: poolId, error } = await supabase.rpc("create_pool_with_owner", {
      p_name: name,
      p_join_code: input.joinCode?.trim() || null,
    });

    if (error) return { ok: false, error: error.message };
    if (!poolId || typeof poolId !== "string") {
      return { ok: false, error: "Pool was not created." };
    }

    revalidatePath("/admin");
    revalidatePath("/account");

    return { ok: true, poolId };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not create pool.",
    };
  }
}
