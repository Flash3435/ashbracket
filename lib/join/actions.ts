"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type PeekJoinResult =
  | { ok: true; poolId: string; poolName: string }
  | { ok: false; message: string };

export async function peekJoinablePool(joinCode: string): Promise<PeekJoinResult> {
  const code = joinCode.trim();
  if (!code) {
    return { ok: false, message: "Enter a join code." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("peek_joinable_pool", {
    p_join_code: code,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  const row = Array.isArray(data) ? data[0] : data;
  const poolId = row?.pool_id as string | undefined;
  const poolName = row?.pool_name as string | undefined;
  if (!poolId || !poolName) {
    return { ok: false, message: "That join code is not valid." };
  }

  return { ok: true, poolId, poolName };
}

export type PoolJoinMutationResult =
  | { ok: true; participantId: string }
  | { ok: false; message: string };

export async function registerInPool(
  poolId: string,
  joinCode: string,
  displayName: string,
): Promise<PoolJoinMutationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: "Sign in or create an account first." };
  }

  const { data, error } = await supabase.rpc("register_pool_participant", {
    p_pool_id: poolId,
    p_join_code: joinCode.trim(),
    p_display_name: displayName.trim(),
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  const participantId = data as string | null;
  if (!participantId) {
    return { ok: false, message: "Could not create your profile." };
  }

  revalidatePath("/account");
  revalidatePath("/join");
  return { ok: true, participantId };
}

export async function claimPoolParticipant(
  poolId: string,
  joinCode: string,
  displayName: string,
): Promise<PoolJoinMutationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: "Sign in or create an account first." };
  }

  const { data, error } = await supabase.rpc("claim_pool_participant", {
    p_pool_id: poolId,
    p_join_code: joinCode.trim(),
    p_display_name: displayName.trim(),
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  const participantId = data as string | null;
  if (!participantId) {
    return { ok: false, message: "Could not claim that profile." };
  }

  revalidatePath("/account");
  revalidatePath("/join");
  return { ok: true, participantId };
}

export type PeekInviteResult =
  | { ok: true; poolId: string; poolName: string; displayName: string }
  | { ok: false; message: string };

export async function peekParticipantInvite(
  token: string,
): Promise<PeekInviteResult> {
  const t = token.trim();
  if (t.length < 16) {
    return { ok: false, message: "This invite link is not valid." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("peek_participant_invite", {
    p_token: t,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  const row = Array.isArray(data) ? data[0] : data;
  const poolId = row?.pool_id as string | undefined;
  const poolName = row?.pool_name as string | undefined;
  const displayName = row?.display_name as string | undefined;
  if (!poolId || !poolName || !displayName) {
    return {
      ok: false,
      message:
        "This invite is no longer valid. It may have already been used, or the link is wrong.",
    };
  }

  return { ok: true, poolId, poolName, displayName };
}

export async function claimParticipantInvite(
  token: string,
): Promise<PoolJoinMutationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: "Sign in or create an account first." };
  }

  const { data, error } = await supabase.rpc("claim_pool_participant_invite", {
    p_token: token.trim(),
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  const participantId = data as string | null;
  if (!participantId) {
    return { ok: false, message: "Could not accept this invite." };
  }

  revalidatePath("/account");
  revalidatePath("/account/picks");
  revalidatePath("/join");
  return { ok: true, participantId };
}
