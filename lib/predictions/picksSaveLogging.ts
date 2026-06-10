export type PicksSaveLogContext = {
  participantId?: string;
  poolId?: string;
  userId?: string;
  detail?: string;
};

function errorFields(error: unknown): { errorName: string; errorMessage: string } {
  if (error instanceof Error) {
    return { errorName: error.name, errorMessage: error.message };
  }
  return { errorName: "Unknown", errorMessage: String(error) };
}

/**
 * Production-safe structured logging for participant pick saves.
 * Never logs slot payloads or full pick content.
 */
export function logPicksSaveStep(
  step: string,
  ctx: PicksSaveLogContext & { error?: unknown },
  level: "info" | "error" = "info",
): void {
  const payload: Record<string, unknown> = { step };
  if (ctx.participantId) payload.participantId = ctx.participantId;
  if (ctx.poolId) payload.poolId = ctx.poolId;
  if (ctx.userId) payload.userId = ctx.userId;
  if (ctx.detail) payload.detail = ctx.detail;
  if (ctx.error !== undefined) {
    Object.assign(payload, errorFields(ctx.error));
  }

  const line = `[ashbracket:participant-picks] ${JSON.stringify(payload)}`;
  if (level === "error") {
    console.error(line);
  } else {
    console.info(line);
  }
}
