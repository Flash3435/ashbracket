"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { setKnockoutResultAction } from "../../app/(worldcup)/admin/results/actions";
import { fifaRankShort } from "../../lib/teams/fifaRankDisplay";
import type {
  KnockoutEditorSection,
  KnockoutResultsSlotBinding,
} from "../../lib/admin/knockoutResultsConfig";
import { resultRowKey } from "../../lib/admin/knockoutResultsConfig";
import type { Result, Team, TournamentStage } from "../../src/types/domain";

type StageByCode = Partial<
  Record<TournamentStage["code"], TournamentStage | undefined>
>;

type KnockoutResultsEditorProps = {
  editionId: string;
  sections: KnockoutEditorSection[];
  teams: Team[];
  stageByCode: StageByCode;
  initialResults: Result[];
  disabled?: boolean;
  isSimulation?: boolean;
  isProduction?: boolean;
};

function slotLabel(
  slotKey: string | null,
  binding: KnockoutResultsSlotBinding,
): string {
  if (slotKey === null) return "Champion";
  if (binding === "group_finish") return `Group ${slotKey}`;
  return `Slot ${slotKey}`;
}

function matchesSlot(
  r: Result,
  tournamentStageId: string,
  kind: string,
  slotKey: string | null,
  binding: KnockoutResultsSlotBinding,
): boolean {
  if (r.tournamentStageId !== tournamentStageId || r.kind !== kind) return false;
  if (binding === "group_finish") {
    const letter = (slotKey ?? "").toUpperCase();
    return (r.groupCode ?? "").toUpperCase() === letter && r.slotKey == null;
  }
  return (
    r.groupCode === null &&
    (r.slotKey === slotKey || (r.slotKey === null && slotKey === null))
  );
}

export function KnockoutResultsEditor({
  editionId,
  sections,
  teams,
  stageByCode,
  initialResults,
  disabled = false,
  isSimulation = false,
  isProduction = false,
}: KnockoutResultsEditorProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [results, setResults] = useState<Result[]>(initialResults);
  const [actionError, setActionError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    setResults(initialResults);
  }, [initialResults]);

  function teamIdForSlot(
    tournamentStageId: string,
    kind: string,
    slotKey: string | null,
    binding: KnockoutResultsSlotBinding,
  ): string {
    const row = results.find((r) =>
      matchesSlot(r, tournamentStageId, kind, slotKey, binding),
    );
    return row?.teamId ?? "";
  }

  function handleSelectChange(
    tournamentStageId: string,
    kind: string,
    slotKey: string | null,
    teamId: string,
    binding: KnockoutResultsSlotBinding,
  ) {
    if (disabled) return;
    const rowKeyUi =
      binding === "group_finish" && slotKey
        ? `${kind}|g:${slotKey}`
        : resultRowKey(kind, slotKey);
    setActionError(null);
    setSavingKey(rowKeyUi);
    startTransition(async () => {
      const res = await setKnockoutResultAction({
        editionId,
        tournamentStageId,
        kind,
        slotKey: binding === "group_finish" ? null : slotKey,
        groupCode: binding === "group_finish" ? slotKey : null,
        teamId: teamId || null,
      });
      setSavingKey(null);
      if (!res.ok) {
        setActionError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      {isProduction ? (
        <p
          className={`rounded-md border px-3 py-2 text-sm ${
            isSimulation
              ? "border-amber-600/60 bg-amber-950/35 text-amber-100"
              : "border-red-800/70 bg-red-950/40 text-red-100"
          }`}
          role="alert"
        >
          <strong>Production:</strong> each save updates{" "}
          {isSimulation
            ? "simulation test results and recalculates simulation pool standings only."
            : "live official results and recalculates live pool standings."}
        </p>
      ) : null}
      {actionError ? (
        <p className="rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {actionError}
        </p>
      ) : null}

      {sections.map((section) => {
        const stage = stageByCode[section.stageCode as TournamentStage["code"]];
        if (!stage) {
          return (
            <section
              key={section.kind}
              className="rounded-lg border border-amber-700/50 bg-amber-950/25 p-4"
            >
              <h2 className="text-sm font-bold text-amber-100">
                {section.label}
              </h2>
              <p className="mt-1 text-sm text-amber-100/90">
                This stage is not available yet. Ask your site host to finish
                tournament setup.
              </p>
            </section>
          );
        }

        return (
          <section
            key={`${section.kind}-${section.stageCode}`}
            className="ash-surface p-4"
          >
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 border-b border-ash-border pb-3">
              <div>
                <h2 className="text-base font-bold text-ash-text">
                  {section.label}
                </h2>
                <p className="mt-0.5 text-xs text-ash-muted">
                  {stage.label}
                </p>
              </div>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {section.slotKeys.map((slotKey) => {
                const binding: KnockoutResultsSlotBinding =
                  section.slotBinding ?? "bracket";
                const rowKey =
                  binding === "group_finish" && slotKey
                    ? `${section.kind}|g:${slotKey}`
                    : resultRowKey(section.kind, slotKey);
                const value = teamIdForSlot(stage.id, section.kind, slotKey, binding);
                const saving = savingKey === rowKey && isPending;

                return (
                  <li key={rowKey}>
                    <label className="block space-y-1.5">
                      <span className="text-xs font-medium uppercase tracking-wide text-ash-muted">
                        {slotLabel(slotKey, binding)}
                        {saving ? (
                          <span className="ml-2 font-normal normal-case text-ash-accent">
                            Saving…
                          </span>
                        ) : null}
                      </span>
                      <select
                        disabled={disabled || saving}
                        value={value}
                        onChange={(e) =>
                          handleSelectChange(
                            stage.id,
                            section.kind,
                            slotKey,
                            e.target.value,
                            binding,
                          )
                        }
                        className="w-full rounded-md border border-ash-border bg-ash-body px-3 py-2 text-sm text-ash-text shadow-sm outline-none ring-ash-accent/20 focus:border-ash-accent focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <option value="">— None —</option>
                        {teams.map((t) => {
                          const fr = fifaRankShort(t);
                          return (
                            <option key={t.id} value={t.id}>
                              {`${t.name} (${t.countryCode})${fr ? ` · ${fr}` : ""}`}
                            </option>
                          );
                        })}
                      </select>
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
