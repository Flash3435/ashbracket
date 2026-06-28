"use client";

import { useState, useTransition } from "react";
import type { Team } from "../../src/types/domain";
import type { SaveKnockoutPicksResult } from "../../types/knockoutPicksSave";
import { CountryFlagIcon } from "../tournament/Flag";

export type AdminKnockoutPickCorrectionRequest = {
  participantId: string;
  matchCode: string;
  teamId: string;
  reason: string;
};

export type AdminKnockoutPickCorrectionFn = (
  input: AdminKnockoutPickCorrectionRequest,
) => Promise<SaveKnockoutPicksResult>;

type AdminKnockoutPickCorrectionDialogProps = {
  matchCode: string;
  matchLabel: string;
  teams: Team[];
  allowedTeamIds: string[];
  currentTeamId?: string;
  onCorrect: AdminKnockoutPickCorrectionFn;
  participantId: string;
  onSuccess: (newTeamId: string) => void;
};

export function AdminKnockoutPickCorrectionDialog({
  matchCode,
  matchLabel,
  teams,
  allowedTeamIds,
  currentTeamId,
  onCorrect,
  participantId,
  onSuccess,
}: AdminKnockoutPickCorrectionDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const allowedTeams = teams.filter((t) => allowedTeamIds.includes(t.id));

  function resetForm() {
    setSelectedTeamId("");
    setReason("");
    setError(null);
  }

  function closeDialog() {
    if (isPending) return;
    setOpen(false);
    resetForm();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          resetForm();
          setOpen(true);
        }}
        className="rounded-lg border border-amber-700/50 bg-amber-950/30 px-3 py-1.5 text-sm font-medium text-amber-100 transition-colors hover:bg-amber-950/45"
      >
        Admin correction
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="presentation"
          onClick={closeDialog}
        >
          <div
            className="w-full max-w-md rounded-xl border border-ash-border bg-ash-surface p-4 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-knockout-correction-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              id="admin-knockout-correction-title"
              className="text-base font-semibold text-ash-text"
            >
              Admin correction
            </h3>
            <p className="mt-2 text-sm text-ash-muted">
              {matchLabel} has already kicked off. Record an organizer-approved
              correction for this participant?
            </p>
            {currentTeamId ? (
              <p className="mt-2 text-xs text-ash-muted">
                Current pick:{" "}
                <span className="text-ash-text">
                  {teams.find((t) => t.id === currentTeamId)?.name ?? "Unknown"}
                </span>
              </p>
            ) : null}

            <fieldset className="mt-4">
              <legend className="text-xs font-medium uppercase tracking-wide text-ash-muted">
                Pick winner
              </legend>
              <ul className="mt-2 space-y-2">
                {allowedTeams.map((team) => {
                  const selected = selectedTeamId === team.id;
                  return (
                    <li key={team.id}>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => setSelectedTeamId(team.id)}
                        className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                          selected
                            ? "border-ash-accent bg-ash-accent/15 text-ash-text"
                            : "border-ash-border bg-ash-body/50 text-ash-text hover:bg-ash-body"
                        } disabled:cursor-not-allowed disabled:opacity-50`}
                      >
                        <CountryFlagIcon countryCode={team.countryCode} size="md" />
                        <span className="font-medium">{team.name}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </fieldset>

            <label className="mt-4 block">
              <span className="text-xs font-medium uppercase tracking-wide text-ash-muted">
                Reason (required)
              </span>
              <textarea
                value={reason}
                disabled={isPending}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="Participant could not access account before kickoff; organizer-approved correction"
                className="mt-1 w-full rounded-lg border border-ash-border bg-ash-body px-3 py-2 text-sm text-ash-text placeholder:text-ash-muted/70 disabled:opacity-50"
              />
            </label>

            {error ? (
              <p
                className="mt-3 rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200"
                role="alert"
              >
                {error}
              </p>
            ) : null}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={isPending}
                onClick={closeDialog}
                className="rounded-lg border border-ash-border bg-ash-body px-3 py-1.5 text-sm font-medium text-ash-muted transition-colors hover:bg-ash-surface disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending || !selectedTeamId.trim() || !reason.trim()}
                onClick={() => {
                  setError(null);
                  startTransition(async () => {
                    const res = await onCorrect({
                      participantId,
                      matchCode,
                      teamId: selectedTeamId,
                      reason: reason.trim(),
                    });
                    if (!res.ok) {
                      setError(res.error);
                      return;
                    }
                    onSuccess(selectedTeamId);
                    setOpen(false);
                    resetForm();
                  });
                }}
                className="rounded-lg bg-ash-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-ash-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending ? "Saving…" : "Confirm correction"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
