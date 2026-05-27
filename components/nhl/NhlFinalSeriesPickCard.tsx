"use client";

import {
  saveNhlConferenceFinalSeriesPickAction,
  saveNhlStanleyCupFinalSeriesPickAction,
} from "@/lib/nhl/picks/actions";
import { scoringWinnerTeamId } from "@/lib/nhl/nhlPicksProgression";
import { buildNhlSeriesStatePresentation } from "@/lib/nhl/nhlSeriesStateText";
import type { NhlSeriesRow } from "@/lib/nhl/types";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { NhlTeamLogo } from "./NhlTeamLogo";

type FinalRoundCode = "CF" | "SCF";

function conferenceWord(side: NhlSeriesRow["side_or_conference"]): string {
  if (side === "east") return "East";
  if (side === "west") return "West";
  return "Stanley Cup";
}

function slotHeadline(series: NhlSeriesRow, roundCode: FinalRoundCode): string {
  if (roundCode === "SCF") return "Cup Final";
  if (series.side_or_conference === "east" || series.side_or_conference === "west") {
    const letter = series.side_or_conference === "east" ? "E" : "W";
    return `${letter} · Conference Final`;
  }
  return "Conference Final";
}

function waitingOnLabel(roundCode: FinalRoundCode): string {
  return roundCode === "SCF" ? "Waiting on Conference Finals" : "Waiting on Round 2";
}

function roundBadgeLabel(roundCode: FinalRoundCode, conf: string): string {
  if (roundCode === "SCF") return "Stanley Cup Final";
  return `${conf} · Conference Finals`;
}

function SelectableTeamRow({
  abbr,
  name,
  seedLabel,
  teamSlug,
  logoPath,
  selected,
  disabled,
  onSelect,
  resultEmphasis,
  emptyLabel,
}: {
  abbr: string | null;
  name: string | null;
  seedLabel: string;
  teamSlug?: string | null;
  logoPath?: string | null;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
  resultEmphasis?: "winner" | "loser" | "neutral";
  emptyLabel: string;
}) {
  if (!abbr && !name) {
    return (
      <div className="rounded-lg border border-dashed border-slate-600/60 bg-slate-950/40 px-3 py-2.5">
        <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{seedLabel}</p>
        <p className="mt-0.5 text-sm font-medium text-slate-500">{emptyLabel}</p>
      </div>
    );
  }
  const primary = abbr ?? name ?? "—";
  const secondary = name && abbr && name !== abbr ? name : name && !abbr ? name : null;
  const resultRing =
    resultEmphasis === "winner"
      ? "ring-1 ring-emerald-400/35"
      : resultEmphasis === "loser"
        ? "opacity-[0.68] saturate-75"
        : "";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
        selected
          ? "border-emerald-500/55 bg-emerald-950/35 ring-1 ring-emerald-500/25"
          : "border-amber-500/25 bg-slate-950/55 hover:border-amber-400/45 hover:bg-slate-900/60"
      } ${resultRing} ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
    >
      <NhlTeamLogo
        className="mt-0.5"
        size="md"
        teamSlug={teamSlug}
        abbreviation={abbr}
        logoPath={logoPath}
        name={name ?? abbr}
      />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{seedLabel}</p>
        <p className="mt-0.5 font-mono text-base font-semibold tracking-tight text-ash-text">{primary}</p>
        {secondary ? (
          <p className="mt-0.5 truncate text-xs leading-snug text-slate-400" title={secondary}>
            {secondary}
          </p>
        ) : null}
        <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">
          {resultEmphasis === "winner"
            ? "Series winner"
            : resultEmphasis === "loser"
              ? "Eliminated"
              : selected
                ? "Your pick"
                : "Tap to pick winner"}
        </p>
      </div>
    </button>
  );
}

export function NhlFinalSeriesPickCard({
  editionId,
  series,
  roundCode,
  initialPickedTeamId,
  picksLocked,
  isAuthenticated,
  matchupReady,
}: {
  editionId: string;
  series: NhlSeriesRow;
  roundCode: FinalRoundCode;
  initialPickedTeamId: string | null;
  picksLocked: boolean;
  isAuthenticated: boolean;
  matchupReady: boolean;
}) {
  const [pickedId, setPickedId] = useState<string | null>(initialPickedTeamId);
  const [banner, setBanner] = useState<{ kind: "idle" | "saved" | "error"; text?: string }>({ kind: "idle" });
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setPickedId(initialPickedTeamId);
  }, [initialPickedTeamId]);

  const conf = conferenceWord(series.side_or_conference);
  const headline = slotHeadline(series, roundCode);
  const hi = series.higher_seed_team_id;
  const lo = series.lower_seed_team_id;
  const hasPairing = matchupReady && Boolean(hi && lo);

  const pres = buildNhlSeriesStatePresentation(series);
  const resolvedWinnerId = pres.winnerTeamId ?? scoringWinnerTeamId(series);
  function resultForTeam(teamId: string | null): "winner" | "loser" | "neutral" {
    if (!resolvedWinnerId || !teamId) return "neutral";
    if (resolvedWinnerId === teamId) return "winner";
    return "loser";
  }

  const seriesDecided = Boolean(resolvedWinnerId);
  const canPick = isAuthenticated && !picksLocked && hasPairing && hi && lo && !seriesDecided;
  const controlsDisabled = !canPick || isPending;
  const emptyLabel = waitingOnLabel(roundCode);

  const accentBorder = roundCode === "SCF" ? "border-yellow-500/25" : "border-amber-500/25";
  const accentBadge =
    roundCode === "SCF"
      ? "border-yellow-400/30 bg-yellow-950/40 text-yellow-100/95"
      : "border-amber-400/25 bg-amber-950/40 text-amber-100/95";
  const accentStatus =
    roundCode === "SCF"
      ? "border-yellow-400/25 bg-yellow-950/45 text-yellow-100/95"
      : "border-amber-400/25 bg-amber-950/45 text-amber-100/95";

  function pickTeam(teamId: string) {
    if (!canPick || teamId === pickedId) return;
    const previous = pickedId;
    setPickedId(teamId);
    setBanner({ kind: "idle" });
    startTransition(() => {
      void (async () => {
        const res =
          roundCode === "CF"
            ? await saveNhlConferenceFinalSeriesPickAction({
                editionId,
                seriesId: series.id,
                pickedTeamId: teamId,
              })
            : await saveNhlStanleyCupFinalSeriesPickAction({
                editionId,
                seriesId: series.id,
                pickedTeamId: teamId,
              });
        if (!res.ok) {
          setPickedId(previous);
          setBanner({ kind: "error", text: res.error });
          return;
        }
        setBanner({ kind: "saved", text: "Pick saved." });
        window.setTimeout(() => {
          setBanner((b) => (b.kind === "saved" ? { kind: "idle" } : b));
        }, 2200);
      })();
    });
  }

  const pickedLabel =
    pickedId && hi && pickedId === hi
      ? (series.higher_team_abbr ?? series.higher_team_name ?? "Higher seed")
      : pickedId && lo && pickedId === lo
        ? (series.lower_team_abbr ?? series.lower_team_name ?? "Lower seed")
        : null;

  const pickCorrect =
    seriesDecided && pickedId && resolvedWinnerId ? pickedId === resolvedWinnerId : null;

  const roundSaveHint =
    roundCode === "SCF" ? "Stanley Cup winner" : `${conf} conference champion`;

  return (
    <article
      className={`rounded-xl border ${accentBorder} bg-gradient-to-b from-slate-950/70 to-slate-950/40 p-4 shadow-md shadow-amber-950/10`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${accentBadge}`}
        >
          {roundBadgeLabel(roundCode, conf)}
        </span>
        <span className="font-mono text-[11px] font-medium uppercase tracking-wider text-slate-500">
          {headline}
        </span>
      </div>
      <div className="mt-3 rounded-lg border border-slate-600/35 bg-slate-900/35 px-3 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${accentStatus}`}
          >
            {pres.statusLabel}
          </span>
          {pres.scoreHigherLower ? (
            <span className="font-mono text-xs font-semibold tabular-nums text-slate-200">
              {pres.scoreHigherLower}
            </span>
          ) : null}
        </div>
        <p className="mt-2 text-[11px] leading-snug text-slate-300">{pres.primaryLine}</p>
      </div>

      <div className="mt-3 space-y-2">
        <SelectableTeamRow
          abbr={series.higher_team_abbr}
          name={series.higher_team_name}
          seedLabel="Higher seed"
          teamSlug={series.higher_team_slug}
          logoPath={series.higher_team_logo_path}
          selected={Boolean(hi && pickedId === hi)}
          disabled={controlsDisabled || !hi}
          onSelect={() => hi && pickTeam(hi)}
          resultEmphasis={resolvedWinnerId ? resultForTeam(hi) : "neutral"}
          emptyLabel={emptyLabel}
        />
        <p className="py-0.5 text-center text-[11px] font-medium uppercase tracking-widest text-slate-500">
          vs
        </p>
        <SelectableTeamRow
          abbr={series.lower_team_abbr}
          name={series.lower_team_name}
          seedLabel="Lower seed"
          teamSlug={series.lower_team_slug}
          logoPath={series.lower_team_logo_path}
          selected={Boolean(lo && pickedId === lo)}
          disabled={controlsDisabled || !lo}
          onSelect={() => lo && pickTeam(lo)}
          resultEmphasis={resolvedWinnerId ? resultForTeam(lo) : "neutral"}
          emptyLabel={emptyLabel}
        />
      </div>

      {isAuthenticated && hasPairing && pickedId && pickedLabel ? (
        <div className="mt-3 rounded-lg border border-slate-600/40 bg-slate-900/45 px-3 py-2.5">
          <p className="text-[11px] text-slate-400">
            Your {roundSaveHint} pick:{" "}
            <span className="font-semibold text-slate-100">{pickedLabel}</span>
          </p>
          {seriesDecided && pickCorrect !== null ? (
            <p className="mt-2">
              <span
                className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                  pickCorrect
                    ? "border-emerald-500/40 bg-emerald-950/35 text-emerald-100/95"
                    : "border-rose-500/40 bg-rose-950/30 text-rose-100/95"
                }`}
              >
                {pickCorrect ? "Your pick was correct" : "Your pick was incorrect"}
              </span>
            </p>
          ) : !seriesDecided ? (
            <p className="mt-1.5 text-[10px] text-slate-500">
              Result pending — pick locked in once the series ends.
            </p>
          ) : null}
        </div>
      ) : null}

      {!isAuthenticated ? (
        <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
          <Link href="/nhl/login?next=%2Fnhl%2Fpicks" className="text-blue-300 underline-offset-2 hover:underline">
            Sign in
          </Link>{" "}
          to save your {roundSaveHint} pick for this edition.
        </p>
      ) : null}

      {isAuthenticated && picksLocked ? (
        <p className="mt-3 text-[11px] text-amber-200/90">
          Picks are locked for this edition; choices cannot be changed.
        </p>
      ) : null}

      {isAuthenticated && !picksLocked && !hasPairing ? (
        <p className="mt-3 text-[11px] text-slate-500">
          {roundCode === "SCF"
            ? "Stanley Cup winner pick opens once both conference finalists are known."
            : "Conference Finals picks open once both Round 2 winners are known in this conference."}
        </p>
      ) : null}

      {isPending ? <p className="mt-3 text-[11px] text-blue-200/90">Saving…</p> : null}
      {banner.kind === "saved" && banner.text ? (
        <p className="mt-3 text-[11px] text-emerald-200/90">{banner.text}</p>
      ) : null}
      {banner.kind === "error" && banner.text ? (
        <p className="mt-3 text-[11px] text-red-200/90">{banner.text}</p>
      ) : null}
    </article>
  );
}
