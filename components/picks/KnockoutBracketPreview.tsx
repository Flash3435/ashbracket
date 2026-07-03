"use client";

import { useMemo } from "react";
import { NO_CHAMPION_PICK_SAVED_LABEL } from "../../lib/bracket/knockoutBracketDisplayCopy";
import { BracketMatchCard } from "../bracket/BracketMatchCard";
import { LockedLaterRoundsPanel } from "../bracket/LockedLaterRoundsPanel";
import {
  CountryFlagIcon,
  CountryFlagPlaceholder,
} from "../tournament/Flag";
import { deriveParticipantBracket } from "../../lib/bracket/deriveParticipantBracket";
import { officialKnockoutPreviewPairs } from "../../lib/bracket/officialKnockoutPreviewPairs";
import {
  filterKnockoutSlots,
  pairKnockoutSlots,
  sortKnockoutDraftsBySlot,
  type BracketSide,
} from "../../lib/predictions/knockoutBracketLayout";
import { thirdPlaceSlotInvalidReason } from "../../lib/predictions/knockoutPickConsistency";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { Team } from "../../src/types/domain";
import { PreRoundOf32BracketBanner } from "./PreRoundOf32BracketBanner";

export type KnockoutBracketPreviewProps = {
  slots: KnockoutPickSlotDraft[];
  teams: Team[];
  /** When false, the R32→champion columns show placeholders instead of user slot pairings. */
  knockoutBracketPicksUnlocked?: boolean;
  /** Jump to list view in the edit wizard. */
  onSwitchToListView?: () => void;
  /** Hide list-view CTA (read-only contexts). */
  showListViewCta?: boolean;
};

function TeamCell({
  side,
  teamById,
}: {
  side: BracketSide | null;
  teamById: Map<string, Team>;
}) {
  if (!side) {
    return (
      <div className="min-h-[32px] rounded border border-dashed border-ash-border/50 bg-ash-body/15 px-2 py-1 text-[11px] text-ash-muted">
        —
      </div>
    );
  }
  const tid = side.teamId.trim();
  const team = tid ? teamById.get(tid) : undefined;
  const picked = Boolean(tid && team);

  return (
    <div
      className={`flex min-h-[32px] items-center gap-2 rounded border px-2 py-1 ${
        picked
          ? "border-ash-accent/50 bg-ash-accent/15 ring-1 ring-ash-accent/25"
          : "border-dashed border-amber-700/35 bg-amber-950/10"
      }`}
    >
      {picked ? (
        <CountryFlagIcon countryCode={team!.countryCode} size="md" />
      ) : (
        <CountryFlagPlaceholder size="md" />
      )}
      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-xs font-medium ${
            picked ? "text-ash-text" : "text-amber-100/85"
          }`}
        >
          {picked ? team!.name : tid ? "Unknown team" : "Not picked"}
        </p>
        {picked ? (
          <p className="truncate text-[10px] text-ash-muted">{team!.countryCode}</p>
        ) : null}
      </div>
    </div>
  );
}

function MatchBox({
  top,
  bottom,
  teamById,
}: {
  top: BracketSide | null;
  bottom: BracketSide | null;
  teamById: Map<string, Team>;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-ash-border/50 bg-ash-body/20 p-1.5">
      <TeamCell side={top} teamById={teamById} />
      <TeamCell side={bottom} teamById={teamById} />
    </div>
  );
}

function RoundColumn({
  title,
  shortTitle,
  pairs,
  teamById,
}: {
  title: string;
  shortTitle: string;
  pairs: ReturnType<typeof pairKnockoutSlots>;
  teamById: Map<string, Team>;
}) {
  return (
    <div className="flex h-full min-w-[128px] max-w-[180px] flex-1 flex-col border-r border-ash-border/40 pr-2 last:border-r-0 last:pr-0">
      <h3
        className="mb-2 shrink-0 text-center text-[10px] font-semibold uppercase tracking-wide text-ash-muted sm:text-xs"
        title={title}
      >
        <span className="sm:hidden">{shortTitle}</span>
        <span className="hidden sm:inline">{title}</span>
      </h3>
      <div className="flex min-h-0 flex-1 flex-col justify-between gap-1">
        {pairs.map((p) => (
          <MatchBox
            key={p.matchIndex}
            top={p.top}
            bottom={p.bottom}
            teamById={teamById}
          />
        ))}
      </div>
    </div>
  );
}

function ThirdPlaceQualificationStrip({
  rows,
  teamById,
  allSlots,
}: {
  rows: KnockoutPickSlotDraft[];
  teamById: Map<string, Team>;
  allSlots: KnockoutPickSlotDraft[];
}) {
  const sorted = sortKnockoutDraftsBySlot(rows);
  const filled = sorted.filter((row) => row.teamId.trim()).length;

  return (
    <div className="rounded-lg border border-ash-border/60 bg-ash-body/25 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-ash-accent/90">
            Stage 2 — qualification picks
          </p>
          <p className="mt-1 text-sm font-medium text-ash-text">
            Best third-place teams (not Round of 32 slots)
          </p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-ash-muted">
            Pick one third-place team per group row — eight groups total. These are
            qualification choices only. FIFA and organizers assign bracket positions
            later; your list here does not place teams into knockout matchups.
          </p>
        </div>
        <div
          className="shrink-0 rounded-md border border-ash-accent/35 bg-ash-accent/10 px-3 py-1.5 text-center"
          role="status"
          aria-live="polite"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ash-muted">
            Selected
          </p>
          <p className="text-lg font-bold tabular-nums text-ash-text">
            {filled}
            <span className="text-sm font-semibold text-ash-muted"> / 8</span>
          </p>
        </div>
      </div>
      <ul className="mt-3 flex flex-wrap gap-2">
        {sorted.map((row) => {
          const tid = row.teamId.trim();
          const team = tid ? teamById.get(tid) : undefined;
          const picked = Boolean(tid && team);
          const conflict = thirdPlaceSlotInvalidReason(row, allSlots);
          return (
            <li
              key={row.rowKey}
              className={`inline-flex max-w-[220px] flex-col gap-0.5 rounded-lg border px-2.5 py-1.5 text-xs ${
                conflict
                  ? "border-amber-700/50 bg-amber-950/25 text-amber-100"
                  : picked
                    ? "border-ash-accent/40 bg-ash-accent/10 text-ash-text"
                    : "border-ash-border/60 text-ash-muted"
              }`}
            >
              <span className="inline-flex items-center gap-1.5">
                {picked ? (
                  <CountryFlagIcon countryCode={team!.countryCode} size="xs" />
                ) : (
                  <span aria-hidden>○</span>
                )}
                <span className="truncate font-medium">
                  {picked ? team!.name : row.slotLabel || "Not picked"}
                </span>
              </span>
              {conflict ? (
                <span className="block text-[10px] leading-snug text-amber-200/95">
                  {conflict} — fix in list view.
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PreRoundOf32KnockoutTree({
  slots,
  teams,
}: {
  slots: KnockoutPickSlotDraft[];
  teams: Team[];
}) {
  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const bracket = useMemo(
    () =>
      deriveParticipantBracket({
        slots,
        teams,
        knockoutBracketPicksUnlocked: false,
      }),
    [slots, teams],
  );

  return (
    <div className="space-y-2">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-ash-muted">
          Knockout bracket — preview
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-ash-muted">
          Round of 32 sides from your group picks appear below. Third-route slots show
          FIFA-style labels (e.g. 3 ABCDF) until those matchups are confirmed. Confirmed
          matchups can be picked in list view; unconfirmed slots stay locked.
        </p>
      </div>
      <div
        className="overflow-x-auto rounded-lg border border-ash-border/70 bg-ash-body/15 p-2 sm:p-3"
        role="region"
        aria-label="Knockout bracket preview before official Round of 32"
      >
        <div className="flex min-w-[520px] flex-nowrap gap-2 pb-1">
          <div className="flex min-w-[168px] shrink-0 flex-col border-r border-ash-border/40 pr-2">
            <h3 className="mb-2 shrink-0 text-center text-[10px] font-semibold uppercase tracking-wide text-ash-muted sm:text-xs">
              Round of 32
            </h3>
            <div className="flex flex-col gap-2">
              {bracket.roundOf32.map((m) => (
                <BracketMatchCard key={m.matchKey} match={m} teamById={teamById} />
              ))}
            </div>
          </div>
          <LockedLaterRoundsPanel />
        </div>
      </div>
    </div>
  );
}

/**
 * Read-only knockout bracket layout (R32 → champion) from current pick drafts.
 */
export function KnockoutBracketPreview({
  slots,
  teams,
  knockoutBracketPicksUnlocked = true,
  onSwitchToListView,
  showListViewCta = true,
}: KnockoutBracketPreviewProps) {
  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);

  const previewInput = useMemo(
    () => ({ slots, teams, knockoutBracketPicksUnlocked: true }),
    [slots, teams],
  );

  const third = filterKnockoutSlots(slots, "third_place_qualifier");
  const r32 = pairKnockoutSlots(filterKnockoutSlots(slots, "round_of_32"));
  const r16 = useMemo(
    () => officialKnockoutPreviewPairs("round_of_16", previewInput),
    [previewInput],
  );
  const qf = useMemo(
    () => officialKnockoutPreviewPairs("quarterfinalist", previewInput),
    [previewInput],
  );
  const sf = useMemo(
    () => officialKnockoutPreviewPairs("semifinalist", previewInput),
    [previewInput],
  );
  const fin = useMemo(
    () => officialKnockoutPreviewPairs("finalist", previewInput),
    [previewInput],
  );
  const champRow = slots.find((s) => s.predictionKind === "champion");

  const champTid = champRow?.teamId.trim() ?? "";
  const champTeam = champTid ? teamById.get(champTid) : undefined;
  const champPicked = Boolean(champTid && champTeam);

  if (!knockoutBracketPicksUnlocked) {
    return (
      <div className="space-y-4">
        <PreRoundOf32BracketBanner
          onSwitchToListView={onSwitchToListView}
          showListViewCta={showListViewCta}
        />
        <ThirdPlaceQualificationStrip rows={third} teamById={teamById} allSlots={slots} />
        <PreRoundOf32KnockoutTree slots={slots} teams={teams} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-ash-muted">
        How your Round of 32 through champion picks line up. Empty cells are unfilled
        slots — use <span className="font-medium text-ash-text">List view</span> to edit.
      </p>

      <ThirdPlaceQualificationStrip rows={third} teamById={teamById} allSlots={slots} />

      <div
        className="overflow-x-auto rounded-lg border border-ash-border bg-ash-body/20 p-2 sm:p-3"
        role="region"
        aria-label="Knockout bracket preview"
      >
        <div className="flex h-[min(85vh,920px)] min-w-[640px] gap-1 sm:min-w-0 sm:gap-2">
          <RoundColumn
            title="Round of 32"
            shortTitle="R32"
            pairs={r32}
            teamById={teamById}
          />
          <RoundColumn
            title="Round of 16"
            shortTitle="R16"
            pairs={r16}
            teamById={teamById}
          />
          <RoundColumn
            title="Quarter-finals"
            shortTitle="QF"
            pairs={qf}
            teamById={teamById}
          />
          <RoundColumn
            title="Semi-finals"
            shortTitle="SF"
            pairs={sf}
            teamById={teamById}
          />
          <RoundColumn title="Final" shortTitle="F" pairs={fin} teamById={teamById} />
          <div className="flex h-full min-w-[100px] max-w-[140px] flex-1 flex-col justify-center">
            <h3 className="mb-2 text-center text-[10px] font-semibold uppercase tracking-wide text-ash-muted sm:text-xs">
              Champion
            </h3>
            <div
              className={`rounded-lg border p-3 text-center ${
                champPicked
                  ? "border-ash-accent/50 bg-ash-accent/15 ring-1 ring-ash-accent/30"
                  : "border-ash-border/70 bg-ash-body/30"
              }`}
            >
              <span className="inline-flex justify-center" aria-hidden>
                {champPicked ? (
                  <CountryFlagIcon countryCode={champTeam!.countryCode} size="lg" />
                ) : (
                  <span className="text-2xl leading-none">🏆</span>
                )}
              </span>
              <p
                className={`mt-2 text-sm font-semibold ${
                  champPicked ? "text-ash-text" : "text-ash-muted"
                }`}
              >
                {champPicked
                  ? champTeam!.name
                  : champTid
                    ? "Unknown team"
                    : NO_CHAMPION_PICK_SAVED_LABEL}
              </p>
              {champPicked ? (
                <p className="text-[11px] text-ash-muted">{champTeam!.countryCode}</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
