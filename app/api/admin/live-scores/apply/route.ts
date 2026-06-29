import { createClient } from "@/lib/supabase/server";
import { isGlobalAdmin } from "@/lib/auth/permissions";
import { NextResponse } from "next/server";
import {
  LIVE_SCORES_APPLY_BUILD,
  runLiveScoresApplyScoresOnly,
} from "@/lib/tournament/liveScores/runLiveScoresApplyWorkflow";
import type { ApplyPlanOperation } from "@/lib/tournament/liveScores/applyPlanSignature";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

type ApplyRequestBody = {
  previewId?: string;
  applyPlanSnapshot?: ApplyPlanOperation[];
  productionAcknowledged?: boolean;
};

function jsonResponse(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(req: Request) {
  console.info("[ashbracket:liveScoresApplyRoute] route.entered", {
    build: LIVE_SCORES_APPLY_BUILD,
    at: new Date().toISOString(),
    method: req.method,
    url: req.url,
  });

  try {
    console.info("[ashbracket:liveScoresApplyRoute] auth.start");
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const admin = user ? await isGlobalAdmin(supabase) : false;
    console.info("[ashbracket:liveScoresApplyRoute] auth.end", {
      hasUser: Boolean(user),
      isGlobalAdmin: admin,
    });

    if (!user || !admin) {
      return jsonResponse(
        { ok: false, build: LIVE_SCORES_APPLY_BUILD, error: "Unauthorized." },
        401,
      );
    }

    console.info("[ashbracket:liveScoresApplyRoute] body.parse.start");
    let body: ApplyRequestBody;
    try {
      body = (await req.json()) as ApplyRequestBody;
    } catch {
      return jsonResponse(
        { ok: false, build: LIVE_SCORES_APPLY_BUILD, error: "Invalid JSON body." },
        400,
      );
    }
    console.info("[ashbracket:liveScoresApplyRoute] body.parse.end", {
      hasPreviewId: Boolean(body.previewId?.trim()),
      applyPlanSnapshotCount: Array.isArray(body.applyPlanSnapshot)
        ? body.applyPlanSnapshot.length
        : 0,
      productionAcknowledged: Boolean(body.productionAcknowledged),
    });

    const previewId = body.previewId?.trim();
    if (!previewId) {
      return jsonResponse(
        { ok: false, build: LIVE_SCORES_APPLY_BUILD, error: "previewId is required." },
        400,
      );
    }

    console.info("[ashbracket:liveScoresApplyRoute] workflow.start", {
      previewId,
      applyPlanSnapshotCount: Array.isArray(body.applyPlanSnapshot)
        ? body.applyPlanSnapshot.length
        : 0,
    });
    const result = await runLiveScoresApplyScoresOnly(supabase, {
      previewId,
      applyPlanSnapshot: Array.isArray(body.applyPlanSnapshot)
        ? body.applyPlanSnapshot
        : undefined,
      productionAcknowledged: body.productionAcknowledged,
    });
    console.info("[ashbracket:liveScoresApplyRoute] workflow.end", {
      ok: result.ok,
      runId: result.technicalDetails?.runId,
      standingsRecalculationPending:
        result.ok && "standingsRecalculationPending" in result
          ? result.standingsRecalculationPending
          : null,
    });

    const status = result.ok ? 200 : (result.httpStatus ?? 500);
    console.info("[ashbracket:liveScoresApplyRoute] response.send", { status, ok: result.ok });
    return jsonResponse(result, status);
  } catch (e) {
    const error = e instanceof Error ? e.message : "Unexpected route error.";
    console.error("[ashbracket:liveScoresApplyRoute] response.error", { error });
    return jsonResponse({ ok: false, build: LIVE_SCORES_APPLY_BUILD, error }, 500);
  }
}
