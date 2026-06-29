import type { LiveScoresApplySummary, LiveScoresApplyTechnicalDetails } from "./types";
import type { LiveScoresApplyScoresResult } from "./runLiveScoresApplyWorkflow";
import type { LiveScoresHttpDebug } from "./liveScoresHttpClient";
import { formatHttpDebugLine } from "./liveScoresHttpClient";

export type StepAUiOutcome =
  | {
      kind: "error";
      message: string;
      technicalDetails?: LiveScoresApplyTechnicalDetails;
      applySummary?: LiveScoresApplySummary | null;
      debugLine: string;
    }
  | {
      kind: "success";
      message: string;
      applySummary: LiveScoresApplySummary;
      debugLine: string;
      showStepB: boolean;
      editionId: string;
      pendingPoolIds: string[];
    };

export function interpretStepAResponse(input: {
  clientOk: boolean;
  clientError?: string;
  debug: LiveScoresHttpDebug;
  payload?: LiveScoresApplyScoresResult;
}): StepAUiOutcome {
  const debugLine = formatHttpDebugLine(input.debug);

  if (!input.clientOk) {
    return {
      kind: "error",
      message: input.clientError ?? "Step A failed before a valid response was received.",
      technicalDetails: input.payload?.ok === false ? input.payload.technicalDetails : undefined,
      applySummary: input.payload?.ok === false ? input.payload.applySummary ?? null : null,
      debugLine,
    };
  }

  const payload = input.payload;
  if (!payload || payload.ok !== true) {
    const message =
      payload && payload.ok === false
        ? payload.error
        : "Step A returned an unexpected success payload.";
    return {
      kind: "error",
      message,
      technicalDetails: payload && payload.ok === false ? payload.technicalDetails : undefined,
      applySummary: payload && payload.ok === false ? payload.applySummary ?? null : null,
      debugLine,
    };
  }

  const showStepB =
    Boolean(payload.standingsRecalculationPending) &&
    Array.isArray(payload.pendingPoolIds) &&
    payload.pendingPoolIds.length > 0;

  return {
    kind: "success",
    message: payload.message ?? "Scores saved.",
    applySummary: payload.applySummary,
    debugLine,
    showStepB,
    editionId: payload.editionId,
    pendingPoolIds: payload.pendingPoolIds ?? [],
  };
}
