"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { PoolJoinMutationResult } from "@/lib/join/actions";
import { joinNhlActiveEditionWithClient } from "./edition";
import { claimNhlParticipationInviteWithClient } from "./invite";

export async function joinNhlActiveEdition(): Promise<PoolJoinMutationResult> {
  const supabase = await createClient();
  const result = await joinNhlActiveEditionWithClient(supabase);
  if (result.ok) {
    revalidatePath("/nhl/account");
    revalidatePath("/nhl/standings");
    revalidatePath("/nhl/picks");
  }
  return result;
}

export async function claimNhlParticipationInvite(
  token: string,
): Promise<PoolJoinMutationResult> {
  const supabase = await createClient();
  const result = await claimNhlParticipationInviteWithClient(supabase, token);
  if (result.ok) {
    revalidatePath("/nhl/account");
    revalidatePath("/nhl/standings");
    revalidatePath("/nhl/picks");
  }
  return result;
}
