"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { validateJoinCodeFormat } from "./joinCodeFormat";
import {
  validatePoolPaymentInput,
  type PoolPaymentInput,
} from "./poolPayment";
import { savePoolPaymentSettings } from "./savePoolPaymentSettings";
import { validatePoolNameInput } from "./validatePoolNameInput";

export type CreatePoolForCurrentUserResult =
  | {
      ok: true;
      poolId: string;
      poolName: string;
      joinCode: string;
      paymentWarnings?: string[];
    }
  | { ok: false; error: string };

type RpcResult = {
  pool_id: string;
  pool_name: string;
  join_code: string;
};

/**
 * Any signed-in user. Creates a pool, join code, optional public visibility, and
 * an owner `pool_admins` row via `create_pool_for_current_user` (SECURITY DEFINER).
 */
export async function createPoolForCurrentUserAction(input: {
  name: string;
  joinCode?: string | null;
  isPublic?: boolean;
  payment: PoolPaymentInput;
}): Promise<CreatePoolForCurrentUserResult> {
  const nameCheck = validatePoolNameInput(input.name);
  if (!nameCheck.ok) {
    return { ok: false, error: nameCheck.error };
  }

  const joinCheck = validateJoinCodeFormat(input.joinCode);
  if (!joinCheck.ok) {
    return { ok: false, error: joinCheck.error };
  }

  const paymentCheck = validatePoolPaymentInput(input.payment);
  if (!paymentCheck.ok) {
    return { ok: false, error: paymentCheck.error };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { ok: false, error: "You must be signed in to create a pool." };
    }

    const { data, error } = await supabase.rpc("create_pool_for_current_user", {
      p_name: nameCheck.name,
      p_join_code: joinCheck.normalized,
      p_is_public: Boolean(input.isPublic),
    });

    if (error) {
      const msg = error.message;
      if (msg === "not authenticated" || msg.includes("not authenticated")) {
        return { ok: false, error: "You must be signed in to create a pool." };
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
      if (msg.includes("invalid pool name")) {
        return {
          ok: false,
          error: "Please enter a valid pool name (1–200 characters).",
        };
      }
      return { ok: false, error: msg };
    }

    let parsed: unknown;
    try {
      parsed = typeof data === "string" ? JSON.parse(data) : data;
    } catch {
      return { ok: false, error: "Pool was not created." };
    }
    const row = parsed as RpcResult | null;
    if (
      !row ||
      typeof row !== "object" ||
      typeof row.pool_id !== "string" ||
      typeof row.join_code !== "string"
    ) {
      return { ok: false, error: "Pool was not created." };
    }

    const paymentSave = await savePoolPaymentSettings(
      supabase,
      row.pool_id,
      paymentCheck.settings,
    );
    if (!paymentSave.ok) {
      return { ok: false, error: paymentSave.error };
    }

    revalidatePath("/admin");
    revalidatePath("/account");

    revalidatePath(`/admin/pools/${row.pool_id}`);

    return {
      ok: true,
      poolId: row.pool_id,
      poolName: row.pool_name,
      joinCode: row.join_code,
      paymentWarnings: paymentCheck.warnings,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not create pool.",
    };
  }
}
