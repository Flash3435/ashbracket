"use server";

import { canManagePool } from "@/lib/auth/permissions";
import { fetchReactionCountsForActivity } from "@/lib/poolActivity/fetchActivityReactions";
import { insertPoolActivityRow } from "@/lib/poolActivity/insertPoolActivity";
import {
  isAllowedActivityReaction,
  type ActivityReactionEmoji,
} from "@/lib/poolActivity/reactionConstants";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type PoolActivityActionResult =
  | {
      ok: true;
      counts: Partial<Record<ActivityReactionEmoji, number>>;
      viewerReaction: ActivityReactionEmoji | null;
    }
  | { ok: false; error: string };

export type PostAnnouncementResult =
  | { ok: true }
  | { ok: false; error: string };

const ANNOUNCEMENT_MAX_LEN = 500;

async function assertViewerParticipantInPool(
  supabase: Awaited<ReturnType<typeof createClient>>,
  poolId: string,
  participantId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("participants")
    .select("id")
    .eq("id", participantId)
    .eq("pool_id", poolId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "You are not a member of this pool." };
  return { ok: true };
}

async function assertActivityInPool(
  supabase: Awaited<ReturnType<typeof createClient>>,
  poolId: string,
  activityId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("pool_activity")
    .select("id")
    .eq("id", activityId)
    .eq("pool_id", poolId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Activity item not found in this pool." };
  return { ok: true };
}

export async function toggleActivityReactionAction(input: {
  poolId: string;
  participantId: string;
  activityId: string;
  reaction: string;
}): Promise<PoolActivityActionResult> {
  try {
    const poolId = input.poolId.trim();
    const participantId = input.participantId.trim();
    const activityId = input.activityId.trim();
    const reaction = input.reaction.trim();

    if (!poolId || !participantId || !activityId) {
      return { ok: false, error: "Missing required fields." };
    }
    if (!isAllowedActivityReaction(reaction)) {
      return { ok: false, error: "Invalid reaction." };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Sign in to react." };

    const member = await assertViewerParticipantInPool(
      supabase,
      poolId,
      participantId,
      user.id,
    );
    if (!member.ok) return member;

    const activity = await assertActivityInPool(supabase, poolId, activityId);
    if (!activity.ok) return activity;

    const { data: existing, error: fetchErr } = await supabase
      .from("activity_reactions")
      .select("id, reaction")
      .eq("activity_id", activityId)
      .eq("participant_id", participantId)
      .maybeSingle();

    if (fetchErr) return { ok: false, error: fetchErr.message };

    if (existing) {
      if ((existing.reaction as string) === reaction) {
        const { error: delErr } = await supabase
          .from("activity_reactions")
          .delete()
          .eq("id", existing.id as string);
        if (delErr) return { ok: false, error: delErr.message };
      } else {
        const { error: updErr } = await supabase
          .from("activity_reactions")
          .update({ reaction })
          .eq("id", existing.id as string);
        if (updErr) return { ok: false, error: updErr.message };
      }
    } else {
      const { error: insErr } = await supabase.from("activity_reactions").insert({
        activity_id: activityId,
        pool_id: poolId,
        participant_id: participantId,
        reaction,
      });
      if (insErr) return { ok: false, error: insErr.message };
    }

    const { counts, viewerReaction } = await fetchReactionCountsForActivity(
      supabase,
      poolId,
      activityId,
      participantId,
    );

    return { ok: true, counts, viewerReaction };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not update reaction.",
    };
  }
}

export async function postPoolAnnouncementAction(input: {
  poolId: string;
  body: string;
}): Promise<PostAnnouncementResult> {
  try {
    const poolId = input.poolId.trim();
    const body = input.body.trim();

    if (!poolId) return { ok: false, error: "Missing pool." };
    if (!body) return { ok: false, error: "Enter announcement text." };
    if (body.length > ANNOUNCEMENT_MAX_LEN) {
      return {
        ok: false,
        error: `Announcement must be ${ANNOUNCEMENT_MAX_LEN} characters or fewer.`,
      };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Sign in to post." };

    if (!(await canManagePool(supabase, poolId))) {
      return { ok: false, error: "Only pool admins can post announcements." };
    }

    const { data: adminParticipant } = await supabase
      .from("participants")
      .select("id, display_name")
      .eq("pool_id", poolId)
      .eq("user_id", user.id)
      .maybeSingle();

    const posterLabel =
      (adminParticipant?.display_name as string | undefined)?.trim() || "Admin";
    const bodyText = `${posterLabel} posted an update: ${body}`;

    await insertPoolActivityRow({
      poolId,
      type: "announcement",
      bodyText,
      participantId: (adminParticipant?.id as string | undefined) ?? null,
      actorUserId: user.id,
      metadataJson: { announcement_body: body, poster_label: posterLabel },
    });

    revalidatePath("/account/activity");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not post announcement.",
    };
  }
}
