import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";

export type PicksSaveUiState =
  | { kind: "saved"; lastSavedAt: number | null; warning?: string }
  | { kind: "dirty"; lastSavedAt: number | null }
  | { kind: "saving"; lastSavedAt: number | null }
  | {
      kind: "error";
      lastSavedAt: number | null;
      failedSignature: string;
      message: string;
    };

export function picksDraftSignature(
  slots: readonly KnockoutPickSlotDraft[],
): string {
  return [...slots]
    .sort((a, b) => a.rowKey.localeCompare(b.rowKey))
    .map((slot) =>
      [
        slot.rowKey,
        slot.predictionKind,
        slot.tournamentStageId,
        slot.slotKey ?? "",
        slot.groupCode ?? "",
        slot.bonusKey ?? "",
        slot.teamId.trim(),
      ].join("\u0001"),
    )
    .join("\u0002");
}

export function reconcilePicksSaveUiState(input: {
  draftSignature: string;
  savedSignature: string;
  currentState: PicksSaveUiState;
}): PicksSaveUiState {
  const { draftSignature, savedSignature, currentState } = input;
  const matchesSaved = draftSignature === savedSignature;

  if (currentState.kind === "error") {
    if (draftSignature === currentState.failedSignature) {
      return currentState;
    }
    return matchesSaved
      ? { kind: "saved", lastSavedAt: currentState.lastSavedAt }
      : { kind: "dirty", lastSavedAt: currentState.lastSavedAt };
  }

  if (matchesSaved) {
    return currentState.kind === "saved"
      ? currentState
      : { kind: "saved", lastSavedAt: currentState.lastSavedAt };
  }

  return currentState.kind === "dirty"
    ? currentState
    : { kind: "dirty", lastSavedAt: currentState.lastSavedAt };
}

export function picksSaveButtonLabel(state: PicksSaveUiState): string {
  switch (state.kind) {
    case "dirty":
      return "Save picks";
    case "saving":
      return "Saving...";
    case "saved":
      return "Saved";
    case "error":
      return "Retry save";
  }
}

export function picksSaveButtonDisabled(state: PicksSaveUiState): boolean {
  return state.kind === "saving" || state.kind === "saved";
}

export function picksSaveStatusLine(state: PicksSaveUiState): string {
  switch (state.kind) {
    case "dirty":
      return "Unsaved changes";
    case "saving":
      return "Saving your picks...";
    case "saved":
      if (state.warning) {
        return "Saved — reload recommended if anything looks out of date";
      }
      return state.lastSavedAt == null ? "All changes saved" : "Last saved just now";
    case "error":
      return "Save failed. Review the error and try again.";
  }
}
