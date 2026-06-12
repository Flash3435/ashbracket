"use client";

import { NhlDraft26PickSlotTeam } from "@/components/nhldraft26/NhlDraft26PickSlotTeam";
import type { NhlDraft26PickSlot } from "@/lib/nhldraft26/draftOrder";
import type { NhlDraft26Prospect } from "@/lib/nhldraft26/prospectsSeed";
import {
  NHL_DRAFT26_PICK_COUNT,
  type getNhlDraft26PicksDeadlineDisplay,
} from "@/lib/nhldraft26/config";
import { saveNhlDraft26PicksAction } from "@/lib/nhldraft26/picks/actions";
import {
  clearNhlDraft26PendingBoard,
  readNhlDraft26PendingBoard,
  writeNhlDraft26PendingBoard,
} from "@/lib/nhldraft26/pendingBoard";
import { getNhlDraft26ConsensusTop10Ids } from "@/lib/nhldraft26/prospects";
import {
  NHL_DRAFT26_DISPLAY_NAME_MAX,
  normalizeNhlDraft26DisplayName,
  validateNhlDraft26DisplayName,
} from "@/lib/nhldraft26/validateDisplayName";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

type Props = {
  prospects: NhlDraft26Prospect[];
  pickSlots: NhlDraft26PickSlot[];
  initialSavedProspectIds: string[];
  initialDisplayName: string;
  isSignedIn: boolean;
  hasSavedPicksInDb: boolean;
  quickStartConsensus: boolean;
  picksLocked: boolean;
  deadline: ReturnType<typeof getNhlDraft26PicksDeadlineDisplay>;
};

function prospectLabel(p: NhlDraft26Prospect): string {
  return `${p.name} · ${p.position} · #${p.consensusRank}`;
}

function picksSignature(ids: string[]): string {
  return ids.join("\0");
}

function filterProspectIds(ids: string[], prospectById: Map<string, NhlDraft26Prospect>): string[] {
  return ids.filter((id) => prospectById.has(id));
}

export function NhlDraft26PicksEditor({
  prospects,
  pickSlots,
  initialSavedProspectIds,
  initialDisplayName,
  isSignedIn,
  hasSavedPicksInDb,
  quickStartConsensus,
  picksLocked,
  deadline,
}: Props) {
  const prospectById = useMemo(
    () => new Map(prospects.map((p) => [p.id, p])),
    [prospects],
  );
  const [selectedIds, setSelectedIds] = useState(initialSavedProspectIds);
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [savedSignature, setSavedSignature] = useState(() =>
    picksSignature(initialSavedProspectIds),
  );
  const [savedDisplayName, setSavedDisplayName] = useState(() =>
    normalizeNhlDraft26DisplayName(initialDisplayName),
  );
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showSignInPrompt, setShowSignInPrompt] = useState(false);
  const [isPending, startTransition] = useTransition();
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    if (hasSavedPicksInDb) {
      return;
    }

    const pending = readNhlDraft26PendingBoard();
    if (pending) {
      const filteredIds = filterProspectIds(pending.prospectIds, prospectById);
      if (filteredIds.length > 0 || pending.displayName) {
        if (filteredIds.length > 0) {
          setSelectedIds(filteredIds);
        }
        if (pending.displayName) {
          setDisplayName(pending.displayName);
        }
        return;
      }
    }

    if (quickStartConsensus) {
      setSelectedIds(getNhlDraft26ConsensusTop10Ids());
    }
  }, [hasSavedPicksInDb, quickStartConsensus, prospectById]);

  const normalizedDisplayName = normalizeNhlDraft26DisplayName(displayName);

  useEffect(() => {
    if (!hydratedRef.current) return;
    if (isSignedIn) return;
    if (picksLocked) return;

    writeNhlDraft26PendingBoard({
      prospectIds: selectedIds,
      displayName: normalizedDisplayName,
      updatedAt: new Date().toISOString(),
    });
  }, [selectedIds, normalizedDisplayName, isSignedIn, picksLocked]);

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
  const displayNameValidation = validateNhlDraft26DisplayName(displayName);
  const hasUnsavedChanges =
    currentSignature !== savedSignature ||
    normalizedDisplayName !== savedDisplayName;
  const editingDisabled = picksLocked;

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
    if (picksLocked) {
      setSaveError("Pick entry is closed — the deadline has passed.");
      return;
    }
    if (!isComplete) {
      return;
    }
    if (!displayNameValidation.ok) {
      setSaveError(displayNameValidation.error);
      return;
    }

    if (!isSignedIn) {
      writeNhlDraft26PendingBoard({
        prospectIds: selectedIds,
        displayName: displayNameValidation.displayName,
        updatedAt: new Date().toISOString(),
      });
      setShowSignInPrompt(true);
      return;
    }

    clearSaveFeedback();
    startTransition(async () => {
      const result = await saveNhlDraft26PicksAction(
        selectedIds,
        displayNameValidation.displayName,
      );
      if (result.ok) {
        const nextSignature = picksSignature(selectedIds);
        setSavedSignature(nextSignature);
        setSavedDisplayName(displayNameValidation.displayName);
        clearNhlDraft26PendingBoard();
        setSaveMessage("Saved");
      } else {
        setSaveError(result.error);
      }
    });
  }

  const saveDisabled =
    picksLocked ||
    !isComplete ||
    !displayNameValidation.ok ||
    isPending ||
    (isSignedIn && !hasUnsavedChanges);

  const signInNext = "/nhldraft26/picks";

  return (
    <div className="space-y-6">
      <section className="ash-surface px-4 py-3 sm:px-5">
        {picksLocked ? (
          <p className="text-sm text-amber-200/95">
            Pick entry is <span className="font-medium text-amber-50">closed</span>.{" "}
            {deadline.friendlyLockPhrase} The lock was{" "}
            <span className="font-medium text-amber-50">{deadline.lockAtLabel}</span>. Your saved
            board is shown below if you submitted before then.
          </p>
        ) : (
          <p className="text-sm text-slate-400">
            Picks are <span className="font-medium text-emerald-200/95">open</span>.{" "}
            {deadline.friendlyLockPhrase}{" "}
            <span className="text-slate-200">({deadline.lockAtLabel})</span>
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
            Each slot is a real draft pick and team. Choose who you think they will select, then
            reorder your prospects before you save.
          </p>
          <ol className="mt-4 space-y-2">
            {pickSlots.map((slot, i) => {
              const p = selectedProspects[i];
              return (
                <li
                  key={`pick-slot-${slot.pickNumber}`}
                  className="rounded-lg border border-amber-500/20 bg-slate-950/50 px-3 py-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <NhlDraft26PickSlotTeam slot={slot} compact />
                      <div className="mt-1 border-t border-slate-700/35 pt-1">
                        {p ? (
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-ash-text">
                              {p.name}
                            </p>
                            <p className="truncate text-xs text-slate-400">
                              {p.position} · {p.teamLeague} · seed #{p.consensusRank}
                            </p>
                          </div>
                        ) : (
                          <p className="text-sm text-slate-500">Select a prospect</p>
                        )}
                      </div>
                    </div>
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
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      </div>

      <div className="ash-surface space-y-4 px-4 py-4 sm:px-5">
        <div>
          <label htmlFor="nhl-draft26-display-name" className="text-sm font-medium text-ash-text">
            Public leaderboard name
          </label>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            This name may appear publicly on the leaderboard. Use your Reddit username if you want
            people to recognize you.
          </p>
          <input
            id="nhl-draft26-display-name"
            type="text"
            value={displayName}
            onChange={(e) => {
              clearSaveFeedback();
              setDisplayName(e.target.value);
            }}
            disabled={editingDisabled}
            maxLength={NHL_DRAFT26_DISPLAY_NAME_MAX + 8}
            autoComplete="nickname"
            className="mt-2 w-full rounded-lg border border-slate-600/60 bg-slate-900/60 px-3 py-2 text-sm text-ash-text placeholder:text-slate-600 focus:border-amber-500/40 focus:outline-none focus:ring-1 focus:ring-amber-500/30 disabled:opacity-60"
            placeholder="e.g. u_your_reddit_name"
          />
          {!displayNameValidation.ok && displayName.length > 0 ? (
            <p className="mt-1.5 text-xs text-red-200/90" role="alert">
              {displayNameValidation.error}
            </p>
          ) : null}
          {!displayNameValidation.ok && displayName.length === 0 && !picksLocked ? (
            <p className="mt-1.5 text-xs text-slate-500">
              Required before you can save your board.
            </p>
          ) : null}
        </div>

        <button
          type="button"
          className="btn-primary w-full sm:w-auto"
          disabled={saveDisabled}
          onClick={handleSave}
        >
          {isPending ? "Saving…" : "Save my picks"}
        </button>
        {!isSignedIn && !picksLocked ? (
          <p className="text-sm text-slate-400">
            Your email will not appear on the public leaderboard.
          </p>
        ) : null}
        {picksLocked && isSignedIn ? (
          <p className="text-sm text-amber-200/90">
            Pick entry is closed. You cannot change or submit a new board.
          </p>
        ) : null}
        {!isComplete && !picksLocked ? (
          <p className="text-sm text-slate-400">
            Choose {NHL_DRAFT26_PICK_COUNT - selectedIds.length} more unique prospect
            {NHL_DRAFT26_PICK_COUNT - selectedIds.length === 1 ? "" : "s"} to save.
          </p>
        ) : null}
        {hasUnsavedChanges && isSignedIn && !picksLocked && isComplete ? (
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
            {selectedProspects
              .map((p, i) => {
                const slot = pickSlots[i];
                const team = slot ? `${slot.pickNumber}. ${slot.teamAbbreviation}` : `${i + 1}.`;
                return `${team} → ${prospectLabel(p)}`;
              })
              .join(" · ")}
          </p>
        ) : null}
      </div>

      {showSignInPrompt ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="nhl-draft26-sign-in-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-amber-500/25 bg-slate-900 px-5 py-6 shadow-xl">
            <h2
              id="nhl-draft26-sign-in-title"
              className="text-lg font-semibold text-ash-text"
            >
              Create a free account or sign in to save your board
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Your picks are ready — sign in to save them.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href={`/nhldraft26/signup?next=${encodeURIComponent(signInNext)}`}
                className="btn-primary no-underline"
              >
                Create account
              </Link>
              <Link
                href={`/nhldraft26/login?next=${encodeURIComponent(signInNext)}`}
                className="btn-ghost border-amber-500/25 no-underline"
              >
                Sign in
              </Link>
            </div>
            <button
              type="button"
              className="mt-4 text-sm text-slate-500 hover:text-slate-300"
              onClick={() => setShowSignInPrompt(false)}
            >
              Keep editing
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
