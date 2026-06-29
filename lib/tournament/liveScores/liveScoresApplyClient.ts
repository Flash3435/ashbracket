import type {
  LiveScoresApplyScoresResult,
  LiveScoresRecalculatePoolResult,
} from "@/lib/tournament/liveScores/runLiveScoresApplyWorkflow";

function isLikelyHttpFailure(status: number): boolean {
  return status === 408 || status === 504 || status >= 500;
}

function fallbackErrorMessage(status: number, bodyText: string): string {
  if (status === 401) return "You are not authorized to run this action.";
  if (isLikelyHttpFailure(status)) {
    return `Server error (HTTP ${status}). The request may have timed out before completing — check tournament status and Vercel logs before retrying.`;
  }
  if (bodyText.trim()) return bodyText.slice(0, 500);
  return `Unexpected HTTP ${status} response from server.`;
}

async function parseJsonResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text.trim()) {
    throw new Error(
      fallbackErrorMessage(
        res.status,
        "Empty response body — the function likely timed out before returning JSON.",
      ),
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(fallbackErrorMessage(res.status, text));
  }
}

export async function postLiveScoresApplyScores(input: {
  previewId: string;
  productionAcknowledged: boolean;
}): Promise<LiveScoresApplyScoresResult> {
  console.info("[ashbracket:liveScoresClient] apply submit started", {
    previewId: input.previewId,
    at: new Date().toISOString(),
  });

  const res = await fetch("/api/admin/live-scores/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store",
  });

  const payload = await parseJsonResponse<LiveScoresApplyScoresResult>(res);
  if (payload == null || typeof payload !== "object") {
    throw new Error("Apply returned an invalid response payload.");
  }
  if (!res.ok && payload.ok !== false) {
    throw new Error(fallbackErrorMessage(res.status, JSON.stringify(payload)));
  }

  console.info("[ashbracket:liveScoresClient] apply submit completed", {
    ok: payload.ok,
    build: "build" in payload ? payload.build : undefined,
  });

  return payload;
}

export async function postLiveScoresRecalculatePool(input: {
  editionId: string;
  poolId: string;
  poolIndex: number;
  poolTotal: number;
  productionAcknowledged: boolean;
  revalidateWhenComplete?: boolean;
}): Promise<LiveScoresRecalculatePoolResult> {
  console.info("[ashbracket:liveScoresClient] recalc pool started", {
    poolId: input.poolId,
    poolIndex: input.poolIndex,
    poolTotal: input.poolTotal,
  });

  const res = await fetch("/api/admin/live-scores/recalculate-pools", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store",
  });

  const payload = await parseJsonResponse<LiveScoresRecalculatePoolResult>(res);
  if (payload == null || typeof payload !== "object") {
    throw new Error("Pool recalculation returned an invalid response payload.");
  }
  if (!res.ok && payload.ok !== false) {
    throw new Error(fallbackErrorMessage(res.status, JSON.stringify(payload)));
  }

  console.info("[ashbracket:liveScoresClient] recalc pool completed", {
    ok: payload.ok,
    poolId: input.poolId,
  });

  return payload;
}
