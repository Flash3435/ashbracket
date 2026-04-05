"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { setKnockoutResultAction } from "../../app/admin/results/actions";
import type { KnockoutEditorSection } from "../../lib/admin/knockoutResultsConfig";
import { resultRowKey } from "../../lib/admin/knockoutResultsConfig";
import type { Result, Team, TournamentStage } from "../../src/types/domain";

type StageByCode = Partial<
  Record<TournamentStage["code"], TournamentStage | undefined>
>;

type KnockoutResultsEditorProps = {
  sections: KnockoutEditorSection[];
  teams: Team[];
  stageByCode: StageByCode;
  initialResults: Result[];
  disabled?: boolean;
};

function slotLabel(slotKey: string | null): string {
  if (slotKey === null) return "Champion";
  return `Slot ${slotKey}`;
}

function matchesSlot(
  r: Result,
  tournamentStageId: string,
  kind: string,
  slotKey: string | null,
): boolean {
  return (
    r.tournamentStageId === tournamentStageId &&
    r.kind === kind &&
    r.groupCode === null &&
    (r.slotKey === slotKey || (r.slotKey === null && slotKey === null))
  );
}

export function KnockoutResultsEditor({
  sections,
  teams,
  stageByCode,
  initialResults,
  disabled = false,
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
  ): string {
    const row = results.find((r) =>
      matchesSlot(r, tournamentStageId, kind, slotKey),
    );
    return row?.teamId ?? "";
  }

  function handleSelectChange(
    tournamentStageId: string,
    kind: string,
    slotKey: string | null,
    teamId: string,
  ) {
    if (disabled) return;
    const key = resultRowKey(kind, slotKey);
    setActionError(null);
    setSavingKey(key);
    startTransition(async () => {
      const res = await setKnockoutResultAction({
        tournamentStageId,
        kind,
        slotKey,
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
      {actionError ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {actionError}
        </p>
      ) : null}

      {sections.map((section) => {
        const stage = stageByCode[section.stageCode as TournamentStage["code"]];
        if (!stage) {
          return (
            <section
              key={section.kind}
              className="rounded-lg border border-amber-200 bg-amber-50/80 p-4"
            >
              <h2 className="text-sm font-semibold text-amber-900">
                {section.label}
              </h2>
              <p className="mt-1 text-sm text-amber-800">
                Stage &quot;{section.stageCode}&quot; is not loaded. Check
                tournament_stages.
              </p>
            </section>
          );
        }

        return (
          <section
            key={`${section.kind}-${section.stageCode}`}
            className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm"
          >
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-100 pb-3">
              <div>
                <h2 className="text-base font-semibold text-zinc-900">
                  {section.label}
                </h2>
                <p className="mt-0.5 text-xs text-zinc-500">
                  Stage: {stage.label} ({stage.code}) · kind:{" "}
                  <code className="rounded bg-zinc-100 px-1 py-0.5 text-[11px]">
                    {section.kind}
                  </code>
                </p>
              </div>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {section.slotKeys.map((slotKey) => {
                const rowKey = resultRowKey(section.kind, slotKey);
                const value = teamIdForSlot(stage.id, section.kind, slotKey);
                const saving = savingKey === rowKey && isPending;

                return (
                  <li key={rowKey}>
                    <label className="block space-y-1.5">
                      <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                        {slotLabel(slotKey)}
                        {saving ? (
                          <span className="ml-2 font-normal normal-case text-emerald-600">
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
                          )
                        }
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
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
