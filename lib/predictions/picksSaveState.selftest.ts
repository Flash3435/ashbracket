import assert from "node:assert";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import {
  picksDraftSignature,
  picksSaveButtonDisabled,
  picksSaveButtonLabel,
  picksSaveStatusLine,
  reconcilePicksSaveUiState,
  type PicksSaveUiState,
} from "./picksSaveState";

function slot(
  rowKey: string,
  teamId: string,
  predictionKind: KnockoutPickSlotDraft["predictionKind"] = "group_winner",
): KnockoutPickSlotDraft {
  return {
    rowKey,
    sectionLabel: "",
    slotLabel: "",
    predictionKind,
    tournamentStageId: "00000000-0000-4000-8000-000000000001",
    slotKey: null,
    groupCode: predictionKind === "group_winner" ? "A" : null,
    bonusKey: null,
    teamId,
  };
}

const cleanSlots = [slot("gw:A", "team-a"), slot("gr:A", "team-b", "group_runner_up")];
const dirtySlots = [slot("gw:A", "team-c"), slot("gr:A", "team-b", "group_runner_up")];
const cleanSig = picksDraftSignature(cleanSlots);
const dirtySig = picksDraftSignature(dirtySlots);

assert.notStrictEqual(cleanSig, dirtySig, "different drafts should produce different signatures");

const dirtyState: PicksSaveUiState = { kind: "dirty", lastSavedAt: null };
assert.strictEqual(picksSaveButtonLabel(dirtyState), "Save picks");
assert.strictEqual(picksSaveButtonDisabled(dirtyState), false);
assert.strictEqual(picksSaveStatusLine(dirtyState), "Unsaved changes");

const savingState: PicksSaveUiState = { kind: "saving", lastSavedAt: null };
assert.strictEqual(picksSaveButtonLabel(savingState), "Saving...");
assert.strictEqual(picksSaveButtonDisabled(savingState), true);
assert.strictEqual(picksSaveStatusLine(savingState), "Saving your picks...");

const savedState: PicksSaveUiState = { kind: "saved", lastSavedAt: Date.now() };
assert.strictEqual(picksSaveButtonLabel(savedState), "Saved");
assert.strictEqual(picksSaveButtonDisabled(savedState), true);
assert.strictEqual(picksSaveStatusLine(savedState), "Last saved just now");

const savedWithWarning: PicksSaveUiState = {
  kind: "saved",
  lastSavedAt: Date.now(),
  warning: "Your picks were saved, but this page could not refresh automatically.",
};
assert.strictEqual(
  picksSaveStatusLine(savedWithWarning),
  "Saved — reload recommended if anything looks out of date",
);

const savedAfterSubmit = reconcilePicksSaveUiState({
  draftSignature: cleanSig,
  savedSignature: cleanSig,
  currentState: { kind: "saving", lastSavedAt: 123 },
});
assert.deepStrictEqual(savedAfterSubmit, { kind: "saved", lastSavedAt: 123 });

const dirtyAfterChange = reconcilePicksSaveUiState({
  draftSignature: dirtySig,
  savedSignature: cleanSig,
  currentState: { kind: "saved", lastSavedAt: 456 },
});
assert.deepStrictEqual(dirtyAfterChange, { kind: "dirty", lastSavedAt: 456 });

const failedState: PicksSaveUiState = {
  kind: "error",
  failedSignature: dirtySig,
  message: "boom",
  lastSavedAt: 789,
};
assert.strictEqual(picksSaveButtonLabel(failedState), "Retry save");
assert.strictEqual(picksSaveButtonDisabled(failedState), false);
assert.strictEqual(
  picksSaveStatusLine(failedState),
  "Save failed. Review the error and try again.",
);

const failedSameDraft = reconcilePicksSaveUiState({
  draftSignature: dirtySig,
  savedSignature: cleanSig,
  currentState: failedState,
});
assert.deepStrictEqual(
  failedSameDraft,
  failedState,
  "failed state should persist until the draft changes",
);

const dirtyAfterEditingFailedDraft = reconcilePicksSaveUiState({
  draftSignature: `${dirtySig}:edited`,
  savedSignature: cleanSig,
  currentState: failedState,
});
assert.deepStrictEqual(
  dirtyAfterEditingFailedDraft,
  { kind: "dirty", lastSavedAt: 789 },
  "editing after failure should return to dirty state",
);

console.log("picksSaveState selftest: ok");
