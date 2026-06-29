import { createClient } from "@/lib/supabase/server";
import { isGlobalAdmin } from "@/lib/auth/permissions";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import {
  LIVE_SCORES_APPLY_BUILD,
  liveScoresRevalidatedPaths,
  runLiveScoresRecalculateOnePool,
} from "@/lib/tournament/liveScores/runLiveScoresApplyWorkflow";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

type RecalculateRequestBody = {
  editionId?: string;
  poolId?: string;
  poolIndex?: number;
  poolTotal?: number;
  productionAcknowledged?: boolean;
  revalidateWhenComplete?: boolean;
};

export async function POST(req: Request) {
  console.info("[ashbracket:liveScoresRecalcRoute] POST started", {
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

    let body: RecalculateRequestBody;
    try {
      body = (await req.json()) as RecalculateRequestBody;
    } catch {
      return NextResponse.json(
        { ok: false, build: LIVE_SCORES_APPLY_BUILD, error: "Invalid JSON body." },
        { status: 400 },
      );
    }

    const editionId = body.editionId?.trim();
    const poolId = body.poolId?.trim();
    if (!editionId || !poolId) {
      return NextResponse.json(
        {
          ok: false,
          build: LIVE_SCORES_APPLY_BUILD,
          error: "editionId and poolId are required.",
        },
        { status: 400 },
      );
    }

    const poolIndex = Number.isFinite(body.poolIndex) ? Number(body.poolIndex) : 0;
    const poolTotal = Number.isFinite(body.poolTotal) ? Number(body.poolTotal) : 1;

    const result = await runLiveScoresRecalculateOnePool(supabase, {
      editionId,
      poolId,
      poolIndex,
      poolTotal,
      productionAcknowledged: body.productionAcknowledged,
    });

    if (result.ok && body.revalidateWhenComplete) {
      for (const path of liveScoresRevalidatedPaths()) {
        revalidatePath(path);
      }
      revalidatePath("/pool/[poolId]", "layout");
    }

    console.info("[ashbracket:liveScoresRecalcRoute] POST finished", {
      build: LIVE_SCORES_APPLY_BUILD,
      ok: result.ok,
      poolId,
      runId: result.technicalDetails?.runId,
    });

    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (e) {
    const error = e instanceof Error ? e.message : "Unexpected route error.";
    console.error("[ashbracket:liveScoresRecalcRoute] POST failed", { error });
    return NextResponse.json(
      { ok: false, build: LIVE_SCORES_APPLY_BUILD, error },
      { status: 500 },
    );
  }
}
