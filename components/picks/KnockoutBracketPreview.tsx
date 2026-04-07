"use client";

import { useMemo } from "react";
import { flagEmojiForFifaCountryCode } from "../../lib/teams/fifaToIso2ForFlag";
import {
  filterKnockoutSlots,
  pairKnockoutSlots,
  sortKnockoutDraftsBySlot,
  type BracketSide,
} from "../../lib/predictions/knockoutBracketLayout";
import { thirdPlaceSlotInvalidReason } from "../../lib/predictions/knockoutPickConsistency";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { Team } from "../../src/types/domain";

export type KnockoutBracketPreviewProps = {
  slots: KnockoutPickSlotDraft[];
  teams: Team[];
  /** When false, the R32→champion columns show placeholders instead of user slot pairings. */
  knockoutBracketPicksUnlocked?: boolean;
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
      <div className="min-h-[36px] rounded border border-dashed border-ash-border/60 bg-ash-body/20 px-2 py-1.5 text-[11px] text-ash-muted">
        —
      </div>
    );
  }
  const tid = side.teamId.trim();
  const team = tid ? teamById.get(tid) : undefined;
  const picked = Boolean(tid && team);
  const flag = team
    ? flagEmojiForFifaCountryCode(team.countryCode)
    : "";

  return (
    <div
      className={`flex min-h-[36px] items-center gap-2 rounded border px-2 py-1.5 ${
        picked
          ? "border-ash-accent/50 bg-ash-accent/15 ring-1 ring-ash-accent/25"
          : "border-ash-border/70 bg-ash-body/30"
      }`}
    >
      <span className="text-lg leading-none" aria-hidden>
        {picked ? flag : "🌍"}
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-xs font-medium ${
            picked ? "text-ash-text" : "text-ash-muted"
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

function ThirdPlaceStrip({
  rows,
  teamById,
  allSlots,
}: {
  rows: KnockoutPickSlotDraft[];
  teamById: Map<string, Team>;
  allSlots: KnockoutPickSlotDraft[];
}) {
  const sorted = sortKnockoutDraftsBySlot(rows);
  return (
    <div className="mb-4 rounded-lg border border-ash-border/60 bg-ash-body/25 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-ash-muted">
        Third-place qualifiers
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-ash-muted">
        Your eight advancing third-place teams (order does not matter for scoring).
        They cannot overlap teams you picked 1st or 2nd in a group. FIFA decides
        which bracket positions they occupy after the group stage.
      </p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {sorted.map((row) => {
          const tid = row.teamId.trim();
          const team = tid ? teamById.get(tid) : undefined;
          const picked = Boolean(tid && team);
          const flag = team
            ? flagEmojiForFifaCountryCode(team.countryCode)
            : "";
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
                <span aria-hidden>{picked ? flag : "○"}</span>
                <span className="truncate font-medium">
                  {picked ? team!.name : "Not picked"}
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

/**
 * Read-only knockout bracket layout (R32 → champion) from current pick drafts.
 */
function PendingKnockoutColumn({
  title,
  shortTitle,
  lineCount,
}: {
  title: string;
  shortTitle: string;
  lineCount: number;
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
        {Array.from({ length: lineCount }, (_, i) => (
          <div
            key={i}
            className="flex min-h-[36px] flex-col justify-center rounded-md border border-dashed border-ash-border/50 bg-ash-body/15 px-2 py-1.5"
          >
            <p className="text-[10px] font-medium text-ash-muted">
              Awaiting official matchups
            </p>
            <p className="text-[9px] leading-snug text-ash-border-hover">
              Picks open after the pool publishes the real bracket.
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function KnockoutBracketPreview({
  slots,
  teams,
  knockoutBracketPicksUnlocked = true,
}: KnockoutBracketPreviewProps) {
  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);

  const third = filterKnockoutSlots(slots, "third_place_qualifier");
  const r32 = pairKnockoutSlots(filterKnockoutSlots(slots, "round_of_32"));
  const r16 = pairKnockoutSlots(filterKnockoutSlots(slots, "round_of_16"));
  const qf = pairKnockoutSlots(filterKnockoutSlots(slots, "quarterfinalist"));
  const sf = pairKnockoutSlots(filterKnockoutSlots(slots, "semifinalist"));
  const fin = pairKnockoutSlots(filterKnockoutSlots(slots, "finalist"));
  const champRow = slots.find((s) => s.predictionKind === "champion");

  const champTid = champRow?.teamId.trim() ?? "";
  const champTeam = champTid ? teamById.get(champTid) : undefined;
  const champPicked = Boolean(champTid && champTeam);
  const champFlag = champTeam
    ? flagEmojiForFifaCountryCode(champTeam.countryCode)
    : "";

  return (
    <div className="space-y-3">
      <p className="text-sm text-ash-muted">
        Read-only preview. Empty cells mean that slot is not filled yet. Switch
        to <span className="font-medium text-ash-text">List view</span> to edit.
        Group stage and bonus questions stay in the list steps.
      </p>

      <ThirdPlaceStrip rows={third} teamById={teamById} allSlots={slots} />

      <div
        className="overflow-x-auto rounded-lg border border-ash-border bg-ash-body/20 p-2 sm:p-3"
        role="region"
        aria-label="Knockout bracket preview"
      >
        <div className="flex h-[min(85vh,920px)] min-w-[640px] gap-1 sm:min-w-0 sm:gap-2">
          {knockoutBracketPicksUnlocked ? (
            <RoundColumn
              title="Round of 32"
              shortTitle="R32"
              pairs={r32}
              teamById={teamById}
            />
          ) : (
            <PendingKnockoutColumn
              title="Round of 32"
              shortTitle="R32"
              lineCount={16}
            />
          )}
          {knockoutBracketPicksUnlocked ? (
            <>
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
              <RoundColumn
                title="Final"
                shortTitle="F"
                pairs={fin}
                teamById={teamById}
              />
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
                  <span className="text-2xl" aria-hidden>
                    {champPicked ? champFlag : "🏆"}
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
                        : "Not picked"}
                  </p>
                  {champPicked ? (
                    <p className="text-[11px] text-ash-muted">
                      {champTeam!.countryCode}
                    </p>
                  ) : null}
                </div>
              </div>
            </>
          ) : (
            <>
              <PendingKnockoutColumn
                title="Round of 16"
                shortTitle="R16"
                lineCount={8}
              />
              <PendingKnockoutColumn
                title="Quarter-finals"
                shortTitle="QF"
                lineCount={4}
              />
              <PendingKnockoutColumn
                title="Semi-finals"
                shortTitle="SF"
                lineCount={2}
              />
              <PendingKnockoutColumn title="Final" shortTitle="F" lineCount={1} />
              <div className="flex h-full min-w-[100px] max-w-[140px] flex-1 flex-col justify-center">
                <h3 className="mb-2 text-center text-[10px] font-semibold uppercase tracking-wide text-ash-muted sm:text-xs">
                  Champion
                </h3>
                <div className="rounded-lg border border-dashed border-ash-border/60 bg-ash-body/15 p-3 text-center">
                  <span className="text-2xl" aria-hidden>
                    🏆
                  </span>
                  <p className="mt-2 text-[11px] leading-snug text-ash-muted">
                    Opens with knockout picks
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
