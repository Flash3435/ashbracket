"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import type {
  KnockoutPickPredictionKind,
  KnockoutPickSlotDraft,
} from "../../types/adminKnockoutPicks";
import type { SaveKnockoutPicksResult } from "../../types/knockoutPicksSave";
import type { Team } from "../../src/types/domain";

export type SaveKnockoutPicksFn = (input: {
  participantId: string;
  slots: Array<{
    predictionKind: KnockoutPickPredictionKind;
    tournamentStageId: string;
    slotKey: string | null;
    teamId: string;
  }>;
}) => Promise<SaveKnockoutPicksResult>;

type ParticipantKnockoutPicksFormProps = {
  participantId: string;
  participantDisplayName: string;
  initialSlots: KnockoutPickSlotDraft[];
  teams: Team[];
  disabled?: boolean;
  /** Pool locked or other read-only mode — no submit, selects disabled. */
  readOnly?: boolean;
  /** Explains why the form is read-only (shown above fields). */
  lockedMessage?: string | null;
  savePicks: SaveKnockoutPicksFn;
  /** Shown after successful save (defaults to standings copy). */
  successMessage?: string;
};

export function ParticipantKnockoutPicksForm({
  participantId,
  participantDisplayName,
  initialSlots,
  teams,
  disabled = false,
  readOnly = false,
  lockedMessage = null,
  savePicks,
  successMessage = "Saved. Standings and public participant pages are updated.",
}: ParticipantKnockoutPicksFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [slots, setSlots] = useState<KnockoutPickSlotDraft[]>(initialSlots);
  const [actionError, setActionError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setSlots(initialSlots);
  }, [initialSlots]);

  useEffect(() => {
    if (!success) return;
    const t = window.setTimeout(() => setSuccess(false), 5000);
    return () => window.clearTimeout(t);
  }, [success]);

  const slotsBySection = useMemo(() => {
    const map = new Map<string, KnockoutPickSlotDraft[]>();
    for (const s of slots) {
      const list = map.get(s.sectionLabel) ?? [];
      list.push(s);
      map.set(s.sectionLabel, list);
    }
    return map;
  }, [slots]);

  function setTeamForRow(rowKey: string, teamId: string) {
    setSlots((prev) =>
      prev.map((s) => (s.rowKey === rowKey ? { ...s, teamId } : s)),
    );
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (disabled || readOnly) return;
    setActionError(null);
    setSuccess(false);
    startTransition(async () => {
      const res = await savePicks({
        participantId,
        slots: slots.map((s) => ({
          predictionKind: s.predictionKind,
          tournamentStageId: s.tournamentStageId,
          slotKey: s.slotKey,
          teamId: s.teamId,
        })),
      });
      if (!res.ok) {
        setActionError(res.error);
        return;
      }
      setSuccess(true);
      router.refresh();
    });
  }

  if (slots.length === 0) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        Knockout stages are not available. Ensure{" "}
        <code className="rounded bg-amber-100/80 px-1 py-0.5 text-[11px]">
          quarterfinal
        </code>
        ,{" "}
        <code className="rounded bg-amber-100/80 px-1 py-0.5 text-[11px]">
          semifinal
        </code>
        , and{" "}
        <code className="rounded bg-amber-100/80 px-1 py-0.5 text-[11px]">
          final
        </code>{" "}
        exist in <code className="text-[11px]">tournament_stages</code>.
      </div>
    );
  }

  const formDisabled = disabled || readOnly || isPending;

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      <p className="text-sm text-zinc-600">
        {readOnly ? "Viewing picks for " : "Editing picks for "}
        <span className="font-medium text-zinc-900">
          {participantDisplayName}
        </span>
        {readOnly
          ? " — this pool is locked; picks cannot be changed."
          : ". Save applies all slots at once and recomputes standings."}
      </p>

      {lockedMessage ? (
        <p
          className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
          role="status"
        >
          {lockedMessage}
        </p>
      ) : null}

      {actionError ? (
        <p
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          role="alert"
        >
          {actionError}
        </p>
      ) : null}
      {success ? (
        <p
          className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
          role="status"
        >
          {successMessage}
        </p>
      ) : null}

      {Array.from(slotsBySection.entries()).map(([sectionLabel, rows]) => (
        <section
          key={sectionLabel}
          className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm"
        >
          <h2 className="mb-4 border-b border-zinc-100 pb-2 text-base font-semibold text-zinc-900">
            {sectionLabel}
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {rows.map((row) => (
              <li key={row.rowKey}>
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    {row.slotLabel}
                  </span>
                  <select
                    value={row.teamId}
                    onChange={(e) =>
                      setTeamForRow(row.rowKey, e.target.value)
                    }
                    disabled={formDisabled}
                    className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none ring-emerald-700/20 focus:border-emerald-600 focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="">— None —</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.countryCode})
                      </option>
                    ))}
                  </select>
                </label>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {!readOnly ? (
        <div>
          <button
            type="submit"
            disabled={formDisabled}
            className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Saving…" : "Save picks"}
          </button>
        </div>
      ) : null}
    </form>
  );
}
