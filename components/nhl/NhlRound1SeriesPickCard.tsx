"use client";

import { saveNhlRound1SeriesPickAction } from "@/lib/nhl/picks/actions";
import type { NhlSeriesRow } from "@/lib/nhl/types";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { NhlTeamLogo } from "./NhlTeamLogo";

function conferenceWord(side: NhlSeriesRow["side_or_conference"]): string {
  if (side === "east") return "East";
  if (side === "west") return "West";
  if (side === "cup") return "Stanley Cup";
  return "Playoffs";
}

function slotHeadline(series: NhlSeriesRow): string {
  if (series.side_or_conference === "east" || series.side_or_conference === "west") {
    const letter = series.side_or_conference === "east" ? "E" : "W";
    return `${letter} · ${series.slot_index}`;
  }
  return `Slot ${series.slot_index}`;
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
}: {
  abbr: string | null;
  name: string | null;
  seedLabel: string;
  teamSlug?: string | null;
  logoPath?: string | null;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  if (!abbr && !name) {
    return (
      <div className="rounded-lg border border-dashed border-slate-600/60 bg-slate-950/40 px-3 py-2.5">
        <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{seedLabel}</p>
        <p className="mt-0.5 text-sm font-medium text-slate-500">To be determined</p>
      </div>
    );
  }
  const primary = abbr ?? name ?? "—";
  const secondary = name && abbr && name !== abbr ? name : name && !abbr ? name : null;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
        selected
          ? "border-emerald-500/55 bg-emerald-950/35 ring-1 ring-emerald-500/25"
          : "border-blue-500/25 bg-slate-950/55 hover:border-blue-400/45 hover:bg-slate-900/60"
      } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
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
          {selected ? "Your pick" : "Tap to pick winner"}
        </p>
      </div>
    </button>
  );
}

export function NhlRound1SeriesPickCard({
  editionId,
  series,
  initialPickedTeamId,
  picksLocked,
  isAuthenticated,
}: {
  editionId: string;
  series: NhlSeriesRow;
  initialPickedTeamId: string | null;
  picksLocked: boolean;
  isAuthenticated: boolean;
}) {
  const [pickedId, setPickedId] = useState<string | null>(initialPickedTeamId);
  const [banner, setBanner] = useState<{ kind: "idle" | "saved" | "error"; text?: string }>({ kind: "idle" });
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setPickedId(initialPickedTeamId);
  }, [initialPickedTeamId]);

  const conf = conferenceWord(series.side_or_conference);
  const headline = slotHeadline(series);
  const hi = series.higher_seed_team_id;
  const lo = series.lower_seed_team_id;
  const hasPairing = Boolean(
    hi && lo && (series.higher_team_abbr || series.higher_team_name) && (series.lower_team_abbr || series.lower_team_name),
  );

  const canPick = isAuthenticated && !picksLocked && hasPairing && hi && lo;
  const controlsDisabled = !canPick || isPending;

  function pickTeam(teamId: string) {
    if (!canPick || teamId === pickedId) return;
    const previous = pickedId;
    setPickedId(teamId);
    setBanner({ kind: "idle" });
    startTransition(() => {
      void (async () => {
        const res = await saveNhlRound1SeriesPickAction({
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

  return (
    <article className="rounded-xl border border-blue-500/20 bg-gradient-to-b from-slate-950/70 to-slate-950/40 p-4 shadow-md shadow-blue-950/15">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-full border border-blue-400/25 bg-blue-950/40 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-blue-200/90">
          {conf}
        </span>
        <span className="font-mono text-[11px] font-medium uppercase tracking-wider text-slate-500">
          {headline}
        </span>
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
        />
      </div>

      {!isAuthenticated ? (
        <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
          <Link href="/nhl/login?next=%2Fnhl%2Fpicks" className="text-blue-300 underline-offset-2 hover:underline">
            Sign in
          </Link>{" "}
          to save your Round 1 winners for this edition.
        </p>
      ) : null}

      {isAuthenticated && picksLocked ? (
        <p className="mt-3 text-[11px] text-amber-200/90">Picks are locked for this edition; choices cannot be changed.</p>
      ) : null}

      {isAuthenticated && !picksLocked && !hasPairing ? (
        <p className="mt-3 text-[11px] text-slate-500">Opponents for this series are not filled in yet—you cannot pick until both teams are set.</p>
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
