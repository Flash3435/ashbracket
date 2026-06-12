"use server";

import { logAdminRiskAction } from "@/lib/admin/adminRiskAuditLog";
import { fetchEditionImpactSummary } from "@/lib/admin/fetchAdminImpactSummary";
import { checkProductionAdminAck } from "@/lib/admin/requireProductionAdminAck";
import { createClient } from "@/lib/supabase/server";
import { isGlobalAdmin } from "@/lib/auth/permissions";
import { recomputePoolsForEdition } from "@/lib/tournament/recomputePoolsForEdition";
import {
  upsertRowsFromBonusPreview,
  type BonusResultPreviewRow,
} from "@/lib/tournament/matchTeamStats/bonusResultsFromTeamStats";
import { loadBonusResultsPublishContext } from "@/lib/tournament/matchTeamStats/loadBonusResultsPublishContext";
import { revalidatePath } from "next/cache";

export type PreviewBonusResultsFromStatsResult =
  | {
      ok: true;
      rows: BonusResultPreviewRow[];
      publishableCount: number;
      skippedCount: number;
    }
  | { ok: false; error: string };

export type PublishBonusResultsFromStatsResult =
  | {
      ok: true;
      message: string;
      publishedKeys: string[];
      skippedKeys: string[];
    }
  | { ok: false; error: string };

function messageFromUnknown(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong.";
}

function revalidateAfterBonusPublish() {
  revalidatePath("/admin/tournament");
  revalidatePath("/admin/tournament/match-stats");
  revalidatePath("/admin/results");
  revalidatePath("/admin/activity");
  revalidatePath("/account");
  revalidatePath("/account/reveal");
  revalidatePath("/account/activity");
  revalidatePath("/pool/[poolId]", "layout");
}

export async function previewBonusResultsFromStatsAction(): Promise<PreviewBonusResultsFromStatsResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !(await isGlobalAdmin(supabase))) {
      return {
        ok: false,
        error: "Only global administrators can preview bonus results.",
      };
    }

    const ctx = await loadBonusResultsPublishContext(supabase);
    if (!ctx.ok) return ctx;

    return {
      ok: true,
      rows: ctx.preview.rows,
      publishableCount: ctx.preview.publishableCount,
      skippedCount: ctx.preview.skippedCount,
    };
  } catch (e) {
    return { ok: false, error: messageFromUnknown(e) };
  }
}

export async function publishBonusResultsFromStatsAction(input: {
  productionAcknowledged?: boolean;
}): Promise<PublishBonusResultsFromStatsResult> {
  try {
    const ack = checkProductionAdminAck(input.productionAcknowledged);
    if (!ack.ok) return ack;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !(await isGlobalAdmin(supabase))) {
      return {
        ok: false,
        error: "Only global administrators can publish bonus results.",
      };
    }

    const ctx = await loadBonusResultsPublishContext(supabase);
    if (!ctx.ok) return ctx;

    const upserts = upsertRowsFromBonusPreview(
      ctx.preview,
      ctx.editionId,
      ctx.groupStageId,
      new Date().toISOString(),
    );

    const publishedKeys: string[] = [];
    const skippedKeys = ctx.preview.rows
      .filter((r) => r.status !== "ready")
      .map((r) => r.bonusKey);

    if (upserts.length === 0) {
      return {
        ok: true,
        message:
          "No bonus categories were ready to publish. Review the preview for ties, missing data, or unchanged results.",
        publishedKeys: [],
        skippedKeys,
      };
    }

    for (const row of upserts) {
      const { error } = await supabase.from("results").upsert(
        {
          edition_id: row.editionId,
          tournament_stage_id: row.tournamentStageId,
          kind: "bonus_pick",
          team_id: row.teamId,
          group_code: null,
          slot_key: row.bonusKey,
          resolved_at: row.resolvedAt,
          source: "manual",
          locked: true,
        },
        {
          onConflict: "edition_id,tournament_stage_id,kind,group_code,slot_key",
        },
      );
      if (error) {
        return { ok: false, error: error.message };
      }
      publishedKeys.push(row.bonusKey);
    }

    const recompute = await recomputePoolsForEdition(
      supabase,
      ctx.editionId,
      "admin_result_edit",
      { editionIsSimulation: false },
    );
    if (!recompute.ok) {
      return {
        ok: false,
        error: `Bonus results saved, but pool leaderboards could not be refreshed: ${recompute.error}`,
      };
    }

    const impact = await fetchEditionImpactSummary(supabase, ctx.editionId);
    logAdminRiskAction({
      action: "bonus_results_from_stats",
      userId: user.id,
      userEmail: user.email,
      editionId: ctx.editionId,
      editionCode: "fifa_wc_2026",
      isSimulation: false,
      affectedPoolCount: impact?.poolCount,
      affectedParticipantCount: impact?.participantCount,
      detail: `Published ${publishedKeys.join(", ")}; skipped ${skippedKeys.join(", ") || "none"}`,
    });

    revalidateAfterBonusPublish();

    const message = `Published ${publishedKeys.length} bonus result(s): ${publishedKeys.join(", ")}. Recalculated ${impact?.poolCount ?? 0} pool leaderboard(s).`;

    return {
      ok: true,
      message,
      publishedKeys,
      skippedKeys,
    };
  } catch (e) {
    return { ok: false, error: messageFromUnknown(e) };
  }
}
