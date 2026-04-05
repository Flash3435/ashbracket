"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import type {
  KnockoutPickPredictionKind,
  KnockoutPickSlotDraft,
} from "../../types/adminKnockoutPicks";
import type { SaveKnockoutPicksResult } from "../../types/knockoutPicksSave";
import type { Team } from "../../src/types/domain";
import { assignKnockoutTeamDeduped } from "../../lib/predictions/knockoutPickConsistency";
import { applyQuickPickToSlots } from "../../lib/predictions/knockoutQuickPickStrategies";
import { flagEmojiForFifaCountryCode } from "../../lib/teams/fifaToIso2ForFlag";
import {
  strengthLabelHint,
  teamStrengthLabel,
} from "../../lib/teams/teamStrengthLabel";

export type SaveKnockoutPicksFn = (input: {
  participantId: string;
  slots: Array<{
    predictionKind: KnockoutPickPredictionKind;
    tournamentStageId: string;
    slotKey: string | null;
    teamId: string;
  }>;
}) => Promise<SaveKnockoutPicksResult>;

export type KnockoutPicksWizardProps = {
  participantId: string;
  participantDisplayName: string;
  initialSlots: KnockoutPickSlotDraft[];
  teams: Team[];
  disabled?: boolean;
  readOnly?: boolean;
  lockedMessage?: string | null;
  savePicks: SaveKnockoutPicksFn;
  successMessage?: string;
  /** Optional secondary line under the success banner (e.g. when standings update separately). */
  successDetail?: string | null;
  /** Helper text under the save button; defaults to copy that mentions standings updates. */
  saveHelpText?: string;
};

const STEPS = [
  {
    id: 0,
    kind: "quarterfinalist" as const,
    title: "Quarter-finals",
    intro:
      "Pick eight teams you think will still be playing in the quarter-finals. These are your “last eight” — the heart of your knockout story.",
    hint: "You’ll narrow this list down on the next steps, so your later picks stay consistent.",
  },
  {
    id: 1,
    kind: "semifinalist" as const,
    title: "Semi-finals",
    intro:
      "Of those eight, choose the four you believe will make the semi-finals. Only teams you already picked can appear here.",
    hint: "If you change the quarter-finalists, we’ll clear any semi picks that no longer fit.",
  },
  {
    id: 2,
    kind: "finalist" as const,
    title: "The final",
    intro:
      "Pick the two teams you think will play in the final. Both must come from your semi-finalists.",
    hint: "Same idea: change a semi-finalist, and we’ll reset the final picks that break the chain.",
  },
  {
    id: 3,
    kind: "champion" as const,
    title: "Champion",
    intro:
      "Choose one winner — your tournament champion. They must be one of the two finalists you picked.",
    hint: "That’s it. Save when you’re happy; you can come back and edit until the pool locks.",
  },
];

function stepComplete(slots: KnockoutPickSlotDraft[], stepId: number): boolean {
  const kind = STEPS[stepId]?.kind;
  if (!kind) return false;
  const rows = slots.filter((s) => s.predictionKind === kind);
  return rows.length > 0 && rows.every((s) => s.teamId.trim() !== "");
}

function allowedTeamsForRow(
  row: KnockoutPickSlotDraft,
  slots: KnockoutPickSlotDraft[],
  allTeams: Team[],
): Team[] {
  if (row.predictionKind === "quarterfinalist") {
    const taken = new Set(
      slots
        .filter(
          (s) =>
            s.predictionKind === "quarterfinalist" &&
            s.rowKey !== row.rowKey &&
            s.teamId.trim(),
        )
        .map((s) => s.teamId.trim()),
    );
    return allTeams.filter((t) => !taken.has(t.id));
  }

  if (row.predictionKind === "semifinalist") {
    const qf = new Set(
      slots
        .filter((s) => s.predictionKind === "quarterfinalist" && s.teamId.trim())
        .map((s) => s.teamId.trim()),
    );
    const taken = new Set(
      slots
        .filter(
          (s) =>
            s.predictionKind === "semifinalist" &&
            s.rowKey !== row.rowKey &&
            s.teamId.trim(),
        )
        .map((s) => s.teamId.trim()),
    );
    return allTeams.filter(
      (t) =>
        qf.has(t.id) &&
        (!taken.has(t.id) || t.id === row.teamId.trim()),
    );
  }

  if (row.predictionKind === "finalist") {
    const sf = new Set(
      slots
        .filter((s) => s.predictionKind === "semifinalist" && s.teamId.trim())
        .map((s) => s.teamId.trim()),
    );
    const taken = new Set(
      slots
        .filter(
          (s) =>
            s.predictionKind === "finalist" &&
            s.rowKey !== row.rowKey &&
            s.teamId.trim(),
        )
        .map((s) => s.teamId.trim()),
    );
    return allTeams.filter(
      (t) =>
        sf.has(t.id) &&
        (!taken.has(t.id) || t.id === row.teamId.trim()),
    );
  }

  const fin = new Set(
    slots
      .filter((s) => s.predictionKind === "finalist" && s.teamId.trim())
      .map((s) => s.teamId.trim()),
  );
  return allTeams.filter((t) => fin.has(t.id));
}

export function KnockoutPicksWizard({
  participantId,
  participantDisplayName,
  initialSlots,
  teams,
  disabled = false,
  readOnly = false,
  lockedMessage = null,
  savePicks,
  successMessage = "Saved. Standings and public participant pages are updated.",
  successDetail = null,
  saveHelpText = "Saving writes every slot (including empty ones you cleared) and updates standings.",
}: KnockoutPicksWizardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [slots, setSlots] = useState<KnockoutPickSlotDraft[]>(initialSlots);
  const [step, setStep] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [quickHint, setQuickHint] = useState<string | null>(null);
  const [openRowKey, setOpenRowKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setSlots(initialSlots);
  }, [initialSlots]);

  useEffect(() => {
    if (!success) return;
    const t = window.setTimeout(() => setSuccess(false), 5000);
    return () => window.clearTimeout(t);
  }, [success]);

  useEffect(() => {
    if (!quickHint) return;
    const t = window.setTimeout(() => setQuickHint(null), 6000);
    return () => window.clearTimeout(t);
  }, [quickHint]);

  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);

  const formDisabled = disabled || readOnly || isPending;

  const currentStepDef = STEPS[step];
  const stepRows = useMemo(
    () => slots.filter((s) => s.predictionKind === STEPS[step]!.kind),
    [slots, step],
  );

  function setTeamForRow(rowKey: string, teamId: string) {
    setSlots((prev) => assignKnockoutTeamDeduped(prev, rowKey, teamId));
  }

  function applyQuick(mode: "random" | "favorites" | "balanced") {
    setSlots((prev) => applyQuickPickToSlots(prev, teams, mode));
    setQuickHint(
      mode === "random"
        ? "We dropped in a random bracket — adjust anything you like."
        : mode === "favorites"
          ? "We leaned on popular picks for the last eight, then narrowed down — tweak as you wish."
          : "We spread teams across regions for the last eight, then narrowed down — edit freely.",
    );
    setOpenRowKey(null);
    setStep(0);
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

  function goNext() {
    if (step >= STEPS.length - 1) return;
    if (!stepComplete(slots, step)) return;
    setStep((s) => s + 1);
    setOpenRowKey(null);
    setSearch("");
  }

  function goPrev() {
    if (step <= 0) return;
    setStep((s) => s - 1);
    setOpenRowKey(null);
    setSearch("");
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

  const canGoNext = stepComplete(slots, step) && step < STEPS.length - 1;
  const qfCount = slots.filter(
    (s) => s.predictionKind === "quarterfinalist" && s.teamId.trim(),
  ).length;

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <p className="text-sm text-zinc-600">
        {readOnly ? "Viewing picks for " : "Editing picks for "}
        <span className="font-medium text-zinc-900">
          {participantDisplayName}
        </span>
        {readOnly
          ? " — this pool is locked; picks cannot be changed."
          : ". Use the steps below, then save. Partial saves are OK."}
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
        <div
          className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
          role="status"
        >
          <p className={successDetail ? "font-medium" : undefined}>{successMessage}</p>
          {successDetail ? (
            <p className="mt-1.5 text-xs font-normal leading-relaxed text-emerald-800/95">
              {successDetail}
            </p>
          ) : null}
        </div>
      ) : null}
      {quickHint ? (
        <p
          className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950"
          role="status"
        >
          {quickHint}
        </p>
      ) : null}

      <nav aria-label="Bracket steps" className="flex flex-wrap gap-2">
        {STEPS.map((s, i) => {
          const done = stepComplete(slots, i);
          const active = i === step;
          return (
            <button
              key={s.id}
              type="button"
              disabled={formDisabled}
              onClick={() => {
                setStep(i);
                setOpenRowKey(null);
                setSearch("");
              }}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                active
                  ? "bg-emerald-700 text-white"
                  : done
                    ? "bg-emerald-100 text-emerald-900 hover:bg-emerald-200"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {i + 1}. {s.title}
            </button>
          );
        })}
      </nav>

      {currentStepDef ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">
            {currentStepDef.title}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-700">
            {currentStepDef.intro}
          </p>
          <p className="mt-2 text-xs text-zinc-500">{currentStepDef.hint}</p>

          {step === 0 && !readOnly && !formDisabled ? (
            <div className="mt-4 rounded-md border border-dashed border-zinc-200 bg-zinc-50/80 p-3">
              <p className="text-sm font-medium text-zinc-800">
                Quick starter brackets
              </p>
              <p className="mt-1 text-xs text-zinc-600">
                We’ll fill all rounds at once in a way that still makes sense
                (later picks always come from earlier ones). You can change
                anything afterward.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => applyQuick("favorites")}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 shadow-sm hover:bg-zinc-50"
                >
                  Fan favorites mix
                </button>
                <button
                  type="button"
                  onClick={() => applyQuick("balanced")}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 shadow-sm hover:bg-zinc-50"
                >
                  Balanced spread
                </button>
                <button
                  type="button"
                  onClick={() => applyQuick("random")}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 shadow-sm hover:bg-zinc-50"
                >
                  Surprise me (random)
                </button>
              </div>
            </div>
          ) : null}

          {step === 1 && qfCount < 8 ? (
            <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-950">
              Pick all eight quarter-finalists first (step 1). You’ve chosen{" "}
              {qfCount} so far.
            </p>
          ) : null}
          {step === 2 &&
          slots.filter((s) => s.predictionKind === "semifinalist" && s.teamId.trim())
            .length < 4 ? (
            <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-950">
              Choose four semi-finalists on the previous step before locking in
              your finalists.
            </p>
          ) : null}
          {step === 3 &&
          slots.filter((s) => s.predictionKind === "finalist" && s.teamId.trim())
            .length < 2 ? (
            <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-950">
              Pick both finalists on the step before this one first.
            </p>
          ) : null}

          <ul className="mt-4 space-y-3">
            {stepRows.map((row) => {
              const team = row.teamId ? teamById.get(row.teamId) : undefined;
              const flag = team
                ? flagEmojiForFifaCountryCode(team.countryCode)
                : "";
              const strength = team
                ? teamStrengthLabel(team.countryCode)
                : null;
              const options = allowedTeamsForRow(row, slots, teams);
              const q = search.trim().toLowerCase();
              const filtered = q
                ? options.filter(
                    (t) =>
                      t.name.toLowerCase().includes(q) ||
                      t.countryCode.toLowerCase().includes(q),
                  )
                : options;

              return (
                <li key={row.rowKey} className="rounded-lg border border-zinc-100 bg-zinc-50/50 p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                        {row.slotLabel}
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="text-2xl leading-none" aria-hidden>
                          {flag || "🌍"}
                        </span>
                        <div>
                          <p className="text-sm font-medium text-zinc-900">
                            {team?.name ?? "No team selected"}
                          </p>
                          {team && strength ? (
                            <p
                              className="text-xs text-zinc-600"
                              title={strengthLabelHint(strength)}
                            >
                              {strength}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={formDisabled}
                      onClick={() => {
                        setOpenRowKey((k) =>
                          k === row.rowKey ? null : row.rowKey,
                        );
                        setSearch("");
                      }}
                      className="shrink-0 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {team ? "Change" : "Choose team"}
                    </button>
                  </div>

                  {openRowKey === row.rowKey ? (
                    <div className="mt-3 border-t border-zinc-200 pt-3">
                      <label className="block text-xs font-medium text-zinc-600">
                        Search teams
                        <input
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          disabled={formDisabled}
                          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm outline-none ring-emerald-700/20 focus:border-emerald-600 focus:ring-2"
                          placeholder="Type a country name or code"
                          autoComplete="off"
                        />
                      </label>
                      {options.length === 0 ? (
                        <p className="mt-2 text-sm text-amber-800">
                          {row.predictionKind === "semifinalist"
                            ? "Finish your quarter-final picks first, or clear a conflicting semi pick."
                            : row.predictionKind === "finalist"
                              ? "Finish your semi-final picks first."
                              : row.predictionKind === "champion"
                                ? "Pick two finalists first."
                                : "No teams available."}
                        </p>
                      ) : (
                        <ul className="mt-2 max-h-52 overflow-y-auto rounded-md border border-zinc-200 bg-white p-1 sm:grid sm:max-h-64 sm:grid-cols-2 sm:gap-1">
                          {filtered.map((t) => {
                            const f = flagEmojiForFifaCountryCode(t.countryCode);
                            const st = teamStrengthLabel(t.countryCode);
                            return (
                              <li key={t.id}>
                                <button
                                  type="button"
                                  disabled={formDisabled}
                                  onClick={() => {
                                    setTeamForRow(row.rowKey, t.id);
                                    setOpenRowKey(null);
                                    setSearch("");
                                  }}
                                  className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <span className="text-xl" aria-hidden>
                                    {f || "🌍"}
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block font-medium text-zinc-900">
                                      {t.name}
                                    </span>
                                    <span className="block text-[11px] text-zinc-500">
                                      {t.countryCode} · {st}
                                    </span>
                                  </span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>

          <div className="mt-4 flex flex-wrap gap-2 border-t border-zinc-100 pt-4">
            <button
              type="button"
              disabled={formDisabled || step <= 0}
              onClick={goPrev}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Back
            </button>
            {step < STEPS.length - 1 ? (
              <button
                type="button"
                disabled={formDisabled || !canGoNext}
                onClick={goNext}
                className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next step
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {!readOnly ? (
        <div>
          <button
            type="submit"
            disabled={formDisabled}
            className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Saving…" : "Save picks"}
          </button>
          <p className="mt-2 text-xs text-zinc-500">{saveHelpText}</p>
        </div>
      ) : null}
    </form>
  );
}
