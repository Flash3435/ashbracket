"use server";

import { logAdminRiskAction } from "@/lib/admin/adminRiskAuditLog";
import {
  loadKnockoutOutPickBackfillReview,
  loadManagedPoolIdsForBackfillReview,
} from "@/lib/admin/loadKnockoutOutPickBackfillReview";
import { planSingleReviewedBackfillRestore } from "@/lib/admin/knockoutOutPickBackfillPlanner";
import { isGlobalAdmin } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const REVIEW_PATH = "/admin/knockout-out-backfill";

export type KnockoutOutBackfillRestoreActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

export type KnockoutOutBackfillBulkRestoreActionResult =
  | {
      ok: true;
      restoredCount: number;
      skipped: { candidateId: string; error: string }[];
    }
  | { ok: false; error: string };

function messageFromUnknown(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

async function requireGlobalAdminForBackfillReview(): Promise<
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; userEmail: string | null; userId: string }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "You must be signed in." };
  }
  if (!(await isGlobalAdmin(supabase))) {
    return {
      ok: false,
      error: "Only global administrators can review knockout out-pick backfill.",
    };
  }
  return {
    ok: true,
    supabase,
    userEmail: user.email?.trim() ?? null,
    userId: user.id,
  };
}

async function loadReviewContext() {
  const auth = await requireGlobalAdminForBackfillReview();
  if (!auth.ok) return auth;

  const pools = await loadManagedPoolIdsForBackfillReview(auth.supabase);
  if (!pools.ok) return { ok: false as const, error: pools.error };

  const review = await loadKnockoutOutPickBackfillReview(auth.supabase, pools.poolIds);
  if (!review.ok) return { ok: false as const, error: review.error };

  return {
    ok: true as const,
    supabase: auth.supabase,
    userEmail: auth.userEmail,
    userId: auth.userId,
    review: review.data,
  };
}

export async function restoreKnockoutOutBackfillCandidateAction(input: {
  candidateId: string;
  note?: string;
}): Promise<KnockoutOutBackfillRestoreActionResult> {
  try {
    const ctx = await loadReviewContext();
    if (!ctx.ok) return { ok: false, error: ctx.error };

    const candidateId = input.candidateId.trim();
    if (!candidateId) {
      return { ok: false, error: "Candidate ID is required." };
    }

    const planned = planSingleReviewedBackfillRestore({
      candidates: ctx.review.candidates,
      candidateId,
      note: input.note,
      existingPredictions: ctx.review.existingPredictions,
    });
    if (!planned.ok) {
      return { ok: false, error: planned.error };
    }

    const { error } = await ctx.supabase.from("predictions").upsert(planned.upsert, {
      onConflict:
        "participant_id,pool_id,prediction_kind,tournament_stage_id,group_code,slot_key,bonus_key",
    });
    if (error) {
      return { ok: false, error: error.message };
    }

    logAdminRiskAction({
      action: "knockout_out_pick_backfill_restore",
      userId: ctx.userId,
      userEmail: ctx.userEmail,
      poolId: planned.candidate.poolId,
      poolName:
        ctx.review.mediumReports.find((r) => r.candidateId === candidateId)
          ?.poolName ?? null,
      detail: [
        `candidateId=${candidateId}`,
        `applyAction=${planned.applyAction}`,
        `participantId=${planned.candidate.participantId}`,
        `kind=${planned.candidate.predictionKind}`,
        planned.candidate.slotKey ? `slot=${planned.candidate.slotKey}` : null,
        `teamId=${planned.candidate.teamId}`,
        input.note?.trim() ? `note=${input.note.trim()}` : null,
      ]
        .filter(Boolean)
        .join(" "),
    });

    revalidatePath(REVIEW_PATH);
    revalidatePath(`/admin/pools/${planned.candidate.poolId}/picks`);
    revalidatePath(`/participant/${planned.candidate.participantId}`);

    return {
      ok: true,
      message:
        planned.applyAction === "add_status_only"
          ? "Out status added to existing pick."
          : "Historical out pick restored.",
    };
  } catch (error) {
    return { ok: false, error: messageFromUnknown(error) };
  }
}

export async function restoreSelectedKnockoutOutBackfillCandidatesAction(input: {
  candidateIds: string[];
  note?: string;
}): Promise<KnockoutOutBackfillBulkRestoreActionResult> {
  try {
    const ids = [...new Set(input.candidateIds.map((id) => id.trim()).filter(Boolean))];
    if (ids.length === 0) {
      return { ok: false, error: "Select at least one candidate to restore." };
    }

    const skipped: { candidateId: string; error: string }[] = [];
    let restoredCount = 0;

    for (const candidateId of ids) {
      const result = await restoreKnockoutOutBackfillCandidateAction({
        candidateId,
        note: input.note,
      });
      if (result.ok) {
        restoredCount += 1;
      } else {
        skipped.push({ candidateId, error: result.error });
      }
    }

    return { ok: true, restoredCount, skipped };
  } catch (error) {
    return { ok: false, error: messageFromUnknown(error) };
  }
}
