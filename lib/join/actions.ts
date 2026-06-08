"use server";

import { createClient } from "@/lib/supabase/server";
import { insertPoolActivityRow } from "../poolActivity/insertPoolActivity";
import { revalidatePath } from "next/cache";
import { validateJoinDisplayName } from "./joinDisplayName";
import { mapJoinRpcError } from "./mapJoinRpcError";
import { planPoolJoin, type PoolJoinIntent, type UnclaimedMatch } from "./planPoolJoin";

async function tryRecordParticipantJoined(input: {
  poolId: string;
  participantId: string;
  userId: string;
  displayName: string;
}): Promise<void> {
  try {
    const name = input.displayName.trim() || "Someone";
    await insertPoolActivityRow({
      poolId: input.poolId,
      participantId: input.participantId,
      actorUserId: input.userId,
      type: "participant_joined",
      bodyText: `${name} joined the pool`,
      metadataJson: { display_name: name },
    });
  } catch (e) {
    console.error("pool_activity participant_joined failed", e);
  }
}

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

export type JoinPoolResult =
  | { status: "success"; participantId: string }
  | {
      status: "needs_confirmation";
      participantId: string;
      matchedDisplayName: string;
      message: string;
    }
  | { status: "ambiguous"; message: string }
  | { status: "error"; message: string };

async function fetchUnclaimedMatches(
  poolId: string,
  joinCode: string,
  displayName: string,
): Promise<UnclaimedMatch[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("peek_unclaimed_participants_for_join", {
    p_pool_id: poolId,
    p_join_code: joinCode.trim(),
    p_display_name: displayName,
  });

  if (error) {
    throw new Error(mapJoinRpcError(error.message ?? "Could not check this name."));
  }

  const rows = Array.isArray(data) ? data : data ? [data] : [];
  return rows
    .map((row) => {
      const participantId = row?.participant_id as string | undefined;
      const name = row?.display_name as string | undefined;
      if (!participantId || !name) return null;
      return { participantId, displayName: name };
    })
    .filter((row): row is UnclaimedMatch => row !== null);
}

async function isJoinedDisplayNameTaken(
  poolId: string,
  displayName: string,
): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_joined_display_name_taken", {
    p_pool_id: poolId,
    p_display_name: displayName,
  });

  if (error) {
    throw new Error(mapJoinRpcError(error.message ?? "Could not check this name."));
  }

  return Boolean(data);
}

/**
 * Unified pool join: matches unclaimed organizer rows by display name or creates a new profile.
 */
export async function joinPool(
  poolId: string,
  joinCode: string,
  displayName: string,
  intent: PoolJoinIntent = "initial",
): Promise<JoinPoolResult> {
  const validated = validateJoinDisplayName(displayName);
  if (!validated.ok) {
    return { status: "error", message: validated.message };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { status: "error", message: "Sign in or create an account first." };
  }

  const name = validated.name;
  const code = joinCode.trim();

  let unclaimedMatches: UnclaimedMatch[];
  let nameTakenByJoinedParticipant: boolean;
  try {
    [unclaimedMatches, nameTakenByJoinedParticipant] = await Promise.all([
      fetchUnclaimedMatches(poolId, code, name),
      isJoinedDisplayNameTaken(poolId, name),
    ]);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not join this pool.";
    return { status: "error", message };
  }

  const plan = planPoolJoin({
    intent,
    unclaimedMatches,
    nameTakenByJoinedParticipant,
  });

  if (plan.action === "needs_confirmation") {
    return {
      status: "needs_confirmation",
      participantId: plan.participantId,
      matchedDisplayName: plan.matchedDisplayName,
      message: plan.message,
    };
  }

  if (plan.action === "ambiguous") {
    return { status: "ambiguous", message: plan.message };
  }

  if (plan.action === "error") {
    return { status: "error", message: plan.message };
  }

  const mutation =
    plan.action === "claim"
      ? await claimPoolParticipant(poolId, code, name)
      : await registerInPool(poolId, code, name);

  if (!mutation.ok) {
    return { status: "error", message: mutation.message };
  }

  return { status: "success", participantId: mutation.participantId };
}

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
    const msg = error.message ?? "";
    if (msg.includes("already registered in this pool")) {
      const { data: existing } = await supabase
        .from("participants")
        .select("id")
        .eq("pool_id", poolId)
        .eq("user_id", user.id)
        .maybeSingle();
      const existingId = existing?.id as string | undefined;
      if (existingId) {
        revalidatePath("/account");
        revalidatePath("/join");
        revalidatePath(`/join/${joinCode.trim()}`);
        revalidatePath("/account/activity");
        return { ok: true, participantId: existingId };
      }
    }
    return { ok: false, message: mapJoinRpcError(msg) };
  }

  const participantId = data as string | null;
  if (!participantId) {
    return { ok: false, message: "Could not create your profile." };
  }

  await tryRecordParticipantJoined({
    poolId,
    participantId,
    userId: user.id,
    displayName,
  });

  revalidatePath("/account");
  revalidatePath("/join");
  revalidatePath(`/join/${joinCode.trim()}`);
  revalidatePath("/account/activity");
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
    const msg = error.message ?? "";
    if (msg.includes("already registered in this pool")) {
      const { data: existing } = await supabase
        .from("participants")
        .select("id")
        .eq("pool_id", poolId)
        .eq("user_id", user.id)
        .maybeSingle();
      const existingId = existing?.id as string | undefined;
      if (existingId) {
        revalidatePath("/account");
        revalidatePath("/join");
        revalidatePath(`/join/${joinCode.trim()}`);
        revalidatePath("/account/activity");
        return { ok: true, participantId: existingId };
      }
    }
    return { ok: false, message: mapJoinRpcError(msg) };
  }

  const participantId = data as string | null;
  if (!participantId) {
    return { ok: false, message: "Could not join with that profile." };
  }

  await tryRecordParticipantJoined({
    poolId,
    participantId,
    userId: user.id,
    displayName,
  });

  revalidatePath("/account");
  revalidatePath("/join");
  revalidatePath(`/join/${joinCode.trim()}`);
  revalidatePath("/account/activity");
  return { ok: true, participantId };
}

export type PeekInviteResult =
  | {
      ok: true;
      poolId: string;
      poolName: string;
      displayName: string;
      /** Lowercased email on the invite row; null if organizer left it blank. */
      invitedEmail: string | null;
    }
  | { ok: false; message: string };

/**
 * If the signed-in user already has a participant row in this pool, returns that id.
 * Used on the invite flow when the token still points at an unclaimed placeholder row.
 */
export async function getMyParticipantIdInPool(
  poolId: string,
): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("participants")
    .select("id")
    .eq("pool_id", poolId)
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (error || !data?.id) return null;
  return data.id as string;
}

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
  const invitedEmail = (row?.invited_email as string | null | undefined) ?? null;
  if (!poolId || !poolName || !displayName) {
    return {
      ok: false,
      message:
        "This invite is no longer valid. It may have already been used, or the link is wrong.",
    };
  }

  return { ok: true, poolId, poolName, displayName, invitedEmail };
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

  const { data: prRow } = await supabase
    .from("participants")
    .select("pool_id, display_name")
    .eq("id", participantId)
    .maybeSingle();

  if (prRow?.pool_id) {
    await tryRecordParticipantJoined({
      poolId: prRow.pool_id as string,
      participantId,
      userId: user.id,
      displayName: (prRow.display_name as string) ?? "",
    });
  }

  revalidatePath("/account");
  revalidatePath("/account/picks");
  revalidatePath("/join");
  revalidatePath("/account/activity");
  return { ok: true, participantId };
}
