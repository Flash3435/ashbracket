"use server";

import { isGlobalAdmin } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { validateJoinCodeFormat } from "./joinCodeFormat";

export type CreatePoolWithOwnerResult =
  | { ok: true; poolId: string }
  | { ok: false; error: string };

/**
 * Global admins only. Creates a pool with `created_by_user_id`, join code
 * (provided or auto-generated in RPC), `is_public`, and an owner `pool_admins`
 * row via `create_pool_with_owner` (SECURITY DEFINER).
 */
export async function createPoolWithOwnerAction(input: {
  name: string;
  joinCode?: string | null;
  isPublic?: boolean;
}): Promise<CreatePoolWithOwnerResult> {
  const name = input.name.trim();
  if (!name) {
    return { ok: false, error: "Pool name is required." };
  }

  const joinCheck = validateJoinCodeFormat(input.joinCode);
  if (!joinCheck.ok) {
    return { ok: false, error: joinCheck.error };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { ok: false, error: "You must be signed in to create a pool." };
    }
    if (!(await isGlobalAdmin(supabase))) {
      return {
        ok: false,
        error: "Only global administrators can create pools.",
      };
    }

    const { data: poolId, error } = await supabase.rpc(
      "create_pool_with_owner",
      {
        p_name: name,
        p_join_code: joinCheck.normalized,
        p_is_public: Boolean(input.isPublic),
      },
    );

    if (error) {
      const msg = error.message;
      if (msg.includes("only global administrators")) {
        return {
          ok: false,
          error: "Only global administrators can create pools.",
        };
      }
      if (msg.includes("join code is already in use")) {
        return { ok: false, error: "That join code is already in use." };
      }
      if (msg.includes("could not allocate a unique join code")) {
        return {
          ok: false,
          error:
            "Could not generate a unique join code. Try providing a join code manually.",
        };
      }
      if (msg.includes("join code must be between")) {
        return { ok: false, error: msg };
      }
      if (msg.includes("join code may only contain")) {
        return { ok: false, error: msg };
      }
      return { ok: false, error: msg };
    }
    if (!poolId || typeof poolId !== "string") {
      return { ok: false, error: "Pool was not created." };
    }

    revalidatePath("/admin");
    revalidatePath("/account");
    revalidatePath(`/admin/pools/${poolId}`);

    return { ok: true, poolId };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not create pool.",
    };
  }
}
