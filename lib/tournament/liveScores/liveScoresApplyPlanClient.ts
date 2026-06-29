import {
  computeApplyPlanSignatureFromOperations,
  extractApplyPlanOperations,
} from "./applyPlanSignature";
import type { ScoreChangePreview } from "./types";

export type LiveScoresApplyPlanSubmitPayload = {
  previewId: string;
  applyPlanSnapshot: ReturnType<typeof extractApplyPlanOperations>;
  applyPlanSnapshotCount: number;
};

/** Build the Step A apply payload from the latest fetched preview only. */
export function buildLiveScoresApplyPlanSubmitPayload(
  preview: ScoreChangePreview,
): LiveScoresApplyPlanSubmitPayload {
  const applyPlanSnapshot = extractApplyPlanOperations(preview.rows);
  const snapshotSignature = computeApplyPlanSignatureFromOperations(applyPlanSnapshot);
  if (snapshotSignature !== preview.previewId) {
    throw new Error(
      "Apply plan snapshot does not match previewId — fetch a fresh preview before applying.",
    );
  }
  return {
    previewId: preview.previewId,
    applyPlanSnapshot,
    applyPlanSnapshotCount: applyPlanSnapshot.length,
  };
}

export function formatApplyPlanClientDebug(preview: ScoreChangePreview | null): string | null {
  if (!preview) return null;
  const ops = extractApplyPlanOperations(preview.rows);
  return [
    `previewId=${preview.previewId}`,
    `applyPlanSignature=${preview.previewId}`,
    `operationCount=${ops.length}`,
  ].join(" · ");
}
