"use client";

import type { NhlDraft26Prospect } from "@/lib/nhldraft26/prospectsSeed";
import { NHL_DRAFT26_PICK_COUNT } from "@/lib/nhldraft26/config";
import { saveNhlDraft26PicksAction } from "@/lib/nhldraft26/picks/actions";
import { getNhlDraft26ConsensusTop10Ids } from "@/lib/nhldraft26/prospects";
import { useCallback, useMemo, useState, useTransition } from "react";

type Props = {
  prospects: NhlDraft26Prospect[];
  initialSavedProspectIds: string[];
  /** When false, save stays disabled with sign-in messaging. */
  canAttemptSave: boolean;
  picksLocked: boolean;
  lockAtLabel: string;
};

function prospectLabel(p: NhlDraft26Prospect): string {
  return `${p.name} · ${p.position} · #${p.consensusRank}`;
}

function picksSignature(ids: string[]): string {
  return ids.join("\0");
}

export function NhlDraft26PicksEditor({
  prospects,
  initialSavedProspectIds,
  canAttemptSave,
  picksLocked,
  lockAtLabel,
}: Props) {
  const prospectById = useMemo(
    () => new Map(prospects.map((p) => [p.id, p])),
    [prospects],
  );
  const [selectedIds, setSelectedIds] = useState(initialSavedProspectIds);
  const [savedSignature, setSavedSignature] = useState(() =>
    picksSignature(initialSavedProspectIds),
  );
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const available = useMemo(
    () => prospects.filter((p) => !selectedSet.has(p.id)),
    [prospects, selectedSet],
  );
  const selectedProspects = useMemo(
    () =>
      selectedIds
        .map((id) => prospectById.get(id))
        .filter((p): p is NhlDraft26Prospect => p !== undefined),
    [selectedIds, prospectById],
  );

  const isComplete =
    selectedIds.length === NHL_DRAFT26_PICK_COUNT &&
    new Set(selectedIds).size === NHL_DRAFT26_PICK_COUNT;

  const currentSignature = picksSignature(selectedIds);
  const hasUnsavedChanges = currentSignature !== savedSignature;
  const editingDisabled = picksLocked || !canAttemptSave;

  const clearSaveFeedback = useCallback(() => {
    setSaveMessage(null);
    setSaveError(null);
  }, []);

  const addProspect = useCallback(
    (id: string) => {
      if (editingDisabled) return;
      clearSaveFeedback();
      setSelectedIds((prev) => {
        if (prev.includes(id) || prev.length >= NHL_DRAFT26_PICK_COUNT) {
          return prev;
        }
        return [...prev, id];
      });
    },
    [clearSaveFeedback, editingDisabled],
  );

  const removeProspect = useCallback(
    (id: string) => {
      if (editingDisabled) return;
      clearSaveFeedback();
      setSelectedIds((prev) => prev.filter((x) => x !== id));
    },
    [clearSaveFeedback, editingDisabled],
  );

  const moveProspect = useCallback(
    (index: number, direction: -1 | 1) => {
      if (editingDisabled) return;
      clearSaveFeedback();
      setSelectedIds((prev) => {
        const next = [...prev];
        const target = index + direction;
        if (target < 0 || target >= next.length) {
          return prev;
        }
        const tmp = next[index];
        next[index] = next[target]!;
        next[target] = tmp!;
        return next;
      });
    },
    [clearSaveFeedback, editingDisabled],
  );

  const fillConsensus = useCallback(() => {
    if (editingDisabled) return;
    clearSaveFeedback();
    setSelectedIds(getNhlDraft26ConsensusTop10Ids());
  }, [clearSaveFeedback, editingDisabled]);

  const clearPicks = useCallback(() => {
    if (editingDisabled) return;
    clearSaveFeedback();
    setSelectedIds([]);
  }, [clearSaveFeedback, editingDisabled]);

  function handleSave() {
    if (!canAttemptSave) {
      setSaveError("Sign in to save picks.");
      return;
    }
    if (picksLocked) {
      setSaveError("Pick entry is closed — the deadline has passed.");
      return;
    }
    if (!isComplete) {
      return;
    }

    clearSaveFeedback();
    startTransition(async () => {
      const result = await saveNhlDraft26PicksAction(selectedIds);
      if (result.ok) {
        const nextSignature = picksSignature(selectedIds);
        setSavedSignature(nextSignature);
        setSaveMessage("Saved");
      } else {
        setSaveError(result.error);
      }
    });
  }

  const saveDisabled =
    !canAttemptSave || picksLocked || !isComplete || isPending || !hasUnsavedChanges;

  return (
    <div className="space-y-6">
      <section className="ash-surface px-4 py-3 sm:px-5">
        {picksLocked ? (
          <p className="text-sm text-amber-200/95">
            Pick entry is <span className="font-medium text-amber-50">closed</span>. The deadline was{" "}
            {lockAtLabel}. Your saved board is shown below if you submitted before the lock.
          </p>
        ) : (
          <p className="text-sm text-slate-400">
            Picks are <span className="font-medium text-emerald-200/95">open</span> until{" "}
            <span className="text-slate-200">{lockAtLabel}</span>.
          </p>
        )}
      </section>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-ghost border-amber-500/25"
          onClick={fillConsensus}
          disabled={editingDisabled}
        >
          Use consensus top 10
        </button>
        <button
          type="button"
          className="btn-ghost border-amber-500/25"
          onClick={clearPicks}
          disabled={editingDisabled || selectedIds.length === 0}
        >
          Clear picks
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <section className="ash-surface px-4 py-4 sm:px-5">
          <h2 className="text-lg font-semibold text-ash-text">Prospect pool</h2>
          <p className="mt-1 text-sm text-slate-400">
            Tap a player to add them to your ranked top 10. You need exactly{" "}
            {NHL_DRAFT26_PICK_COUNT} unique picks.
          </p>
          <ul className="mt-4 max-h-[min(28rem,60vh)] space-y-2 overflow-y-auto pr-1">
            {available.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => addProspect(p.id)}
                  disabled={
                    editingDisabled || selectedIds.length >= NHL_DRAFT26_PICK_COUNT
                  }
                  className="flex w-full flex-col rounded-lg border border-slate-600/60 bg-slate-900/50 px-3 py-2.5 text-left transition-colors hover:border-amber-500/35 hover:bg-slate-900/80 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="font-medium text-ash-text">{p.name}</span>
                  <span className="mt-0.5 text-xs text-slate-400">
                    {p.position} · {p.country} · {p.teamLeague} · consensus #{p.consensusRank}
                  </span>
                </button>
              </li>
            ))}
            {available.length === 0 ? (
              <li className="rounded-lg border border-dashed border-slate-600/50 px-3 py-6 text-center text-sm text-slate-500">
                All pool prospects are in your top 10, or your list is full.
              </li>
            ) : null}
          </ul>
        </section>

        <section className="ash-surface px-4 py-4 sm:px-5">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold text-ash-text">My top 10</h2>
            <span className="text-sm text-slate-400">
              {selectedIds.length}/{NHL_DRAFT26_PICK_COUNT}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            Pick 1 is at the top. Use the arrows to reorder before you save.
          </p>
          <ol className="mt-4 space-y-2">
            {Array.from({ length: NHL_DRAFT26_PICK_COUNT }, (_, i) => {
              const p = selectedProspects[i];
              return (
                <li
                  key={p?.id ?? `slot-${i}`}
                  className="flex items-stretch gap-2 rounded-lg border border-amber-500/20 bg-slate-950/50 px-2 py-2"
                >
                  <span className="flex w-8 shrink-0 items-center justify-center text-sm font-semibold text-amber-200/90">
                    {i + 1}
                  </span>
                  {p ? (
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-ash-text">{p.name}</p>
                      <p className="truncate text-xs text-slate-400">
                        {p.position} · {p.teamLeague}
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-1 items-center text-sm text-slate-500">
                      Select a prospect
                    </div>
                  )}
                  <div className="flex shrink-0 flex-col gap-0.5">
                    <button
                      type="button"
                      aria-label={p ? `Move ${p.name} up` : "Move up"}
                      disabled={editingDisabled || !p || i === 0}
                      onClick={() => moveProspect(i, -1)}
                      className="rounded px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={p ? `Move ${p.name} down` : "Move down"}
                      disabled={editingDisabled || !p || i === selectedIds.length - 1}
                      onClick={() => moveProspect(i, 1)}
                      className="rounded px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-30"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      aria-label={p ? `Remove ${p.name}` : "Remove"}
                      disabled={editingDisabled || !p}
                      onClick={() => p && removeProspect(p.id)}
                      className="rounded px-2 py-0.5 text-xs text-red-300/90 hover:bg-red-950/40 disabled:opacity-30"
                    >
                      ✕
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      </div>

      <div className="ash-surface space-y-3 px-4 py-4 sm:px-5">
        <button
          type="button"
          className="btn-primary w-full sm:w-auto"
          disabled={saveDisabled}
          onClick={handleSave}
        >
          {isPending ? "Saving…" : "Save my picks"}
        </button>
        {!canAttemptSave ? (
          <p className="text-sm text-amber-200/90">Sign in to save picks.</p>
        ) : null}
        {picksLocked && canAttemptSave ? (
          <p className="text-sm text-amber-200/90">
            Pick entry is closed. You cannot change or submit a new board.
          </p>
        ) : null}
        {!isComplete && canAttemptSave && !picksLocked ? (
          <p className="text-sm text-slate-400">
            Choose {NHL_DRAFT26_PICK_COUNT - selectedIds.length} more unique prospect
            {NHL_DRAFT26_PICK_COUNT - selectedIds.length === 1 ? "" : "s"} to save.
          </p>
        ) : null}
        {hasUnsavedChanges && canAttemptSave && !picksLocked && isComplete ? (
          <p className="text-sm text-amber-200/90">You have unsaved changes.</p>
        ) : null}
        {isPending ? (
          <p className="text-sm text-slate-400" role="status">
            Saving…
          </p>
        ) : null}
        {saveMessage ? (
          <p className="text-sm text-emerald-200/95" role="status">
            {saveMessage}
          </p>
        ) : null}
        {saveError ? (
          <p className="text-sm text-red-200/95" role="alert">
            {saveError}
          </p>
        ) : null}
        {!hasUnsavedChanges && savedSignature.length > 0 && !saveMessage && !saveError ? (
          <p className="text-sm text-slate-500">Your saved picks are up to date.</p>
        ) : null}
        {isComplete ? (
          <p className="text-xs text-slate-500" aria-live="polite">
            Lineup preview:{" "}
            {selectedProspects.map((p, i) => `${i + 1}. ${prospectLabel(p)}`).join(" · ")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
