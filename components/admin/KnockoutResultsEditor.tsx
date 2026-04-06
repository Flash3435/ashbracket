"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { setKnockoutResultAction } from "../../app/admin/results/actions";
import { fifaRankShort } from "../../lib/teams/fifaRankDisplay";
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
                const rowKey = resultRowKey(section.kind, slotKey);
                const value = teamIdForSlot(stage.id, section.kind, slotKey);
                const saving = savingKey === rowKey && isPending;

                return (
                  <li key={rowKey}>
                    <label className="block space-y-1.5">
                      <span className="text-xs font-medium uppercase tracking-wide text-ash-muted">
                        {slotLabel(slotKey)}
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
