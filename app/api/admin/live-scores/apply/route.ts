import { createClient } from "@/lib/supabase/server";
import { isGlobalAdmin } from "@/lib/auth/permissions";
import { NextResponse } from "next/server";
import {
  LIVE_SCORES_APPLY_BUILD,
  runLiveScoresApplyScoresOnly,
} from "@/lib/tournament/liveScores/runLiveScoresApplyWorkflow";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

type ApplyRequestBody = {
  previewId?: string;
  productionAcknowledged?: boolean;
};

export async function POST(req: Request) {
  console.info("[ashbracket:liveScoresApplyRoute] POST started", {
    build: LIVE_SCORES_APPLY_BUILD,
    at: new Date().toISOString(),
  });

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !(await isGlobalAdmin(supabase))) {
      return NextResponse.json(
        { ok: false, build: LIVE_SCORES_APPLY_BUILD, error: "Unauthorized." },
        { status: 401 },
      );
    }

    let body: ApplyRequestBody;
    try {
      body = (await req.json()) as ApplyRequestBody;
    } catch {
      return NextResponse.json(
        { ok: false, build: LIVE_SCORES_APPLY_BUILD, error: "Invalid JSON body." },
        { status: 400 },
      );
    }

    const previewId = body.previewId?.trim();
    if (!previewId) {
      return NextResponse.json(
        { ok: false, build: LIVE_SCORES_APPLY_BUILD, error: "previewId is required." },
        { status: 400 },
      );
    }

    const result = await runLiveScoresApplyScoresOnly(supabase, {
      previewId,
      productionAcknowledged: body.productionAcknowledged,
    });

    console.info("[ashbracket:liveScoresApplyRoute] POST finished", {
      build: LIVE_SCORES_APPLY_BUILD,
      ok: result.ok,
      runId: result.technicalDetails?.runId,
    });

    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (e) {
    const error = e instanceof Error ? e.message : "Unexpected route error.";
    console.error("[ashbracket:liveScoresApplyRoute] POST failed", { error });
    return NextResponse.json(
      { ok: false, build: LIVE_SCORES_APPLY_BUILD, error },
      { status: 500 },
    );
  }
}
