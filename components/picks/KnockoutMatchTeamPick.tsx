"use client";

import { CountryFlagIcon } from "../tournament/Flag";
import {
  fifaRankSnapshotTitle,
  teamPickMetaLine,
} from "../../lib/teams/fifaRankDisplay";
import {
  strengthLabelHint,
  teamStrengthLabel,
} from "../../lib/teams/teamStrengthLabel";
import { knockoutMatchTeamPickAriaLabel } from "../../lib/picks/knockoutMatchPickRows";
import type { Team } from "../../src/types/domain";

export function KnockoutMatchTeamPickButton({
  team,
  opponent,
  selected,
  disabled,
  onPick,
  pickKind = "winner",
  fifaMatchNo,
}: {
  team: Team;
  opponent: Team;
  selected: boolean;
  disabled: boolean;
  onPick: () => void;
  pickKind?: "winner" | "champion";
  fifaMatchNo: number;
}) {
  const strength = teamStrengthLabel(team.countryCode);
  const meta = teamPickMetaLine(team, strength);
  const pickLabel =
    fifaMatchNo > 0
      ? knockoutMatchTeamPickAriaLabel({
          teamName: team.name,
          fifaMatchNo,
          pickKind,
        })
      : pickKind === "champion"
        ? `Pick ${team.name} as champion`
        : `Pick ${team.name} to beat ${opponent.name}`;
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      aria-label={pickLabel}
      onClick={onPick}
      className={`flex min-h-[3.25rem] w-full flex-col items-center justify-center gap-1.5 rounded-lg border px-3 py-3 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ash-accent/60 disabled:cursor-not-allowed disabled:opacity-50 ${
        selected
          ? "border-ash-accent/55 bg-ash-accent/15 ring-1 ring-inset ring-ash-accent/50"
          : "border-ash-border bg-ash-body hover:border-ash-accent/40 hover:bg-ash-accent/10 active:bg-ash-accent/15"
      }`}
    >
      <CountryFlagIcon countryCode={team.countryCode} size="lg" />
      <span className="text-sm font-semibold text-ash-text">{team.name}</span>
      <span
        className="text-[11px] text-ash-muted"
        title={
          [fifaRankSnapshotTitle(team), strengthLabelHint(strength)]
            .filter(Boolean)
            .join(" — ") || undefined
        }
      >
        {meta}
      </span>
      <span className="text-[11px] font-medium text-ash-accent/90">
        {selected ? "Selected" : `Pick ${team.name}`}
      </span>
    </button>
  );
}

export function KnockoutMatchDirectTeamPick({
  teams,
  selectedTeamId,
  disabled,
  onPick,
  pickKind = "winner",
  fifaMatchNo,
}: {
  teams: readonly [Team, Team] | readonly [Team];
  selectedTeamId?: string;
  disabled: boolean;
  onPick: (teamId: string) => void;
  pickKind?: "winner" | "champion";
  fifaMatchNo: number;
}) {
  if (teams.length === 1) {
    const team = teams[0]!;
    const groupLabel =
      pickKind === "champion"
        ? `Pick champion: ${team.name}`
        : `Pick winner: ${team.name}`;
    return (
      <div className="mt-2" role="group" aria-label={groupLabel}>
        <KnockoutMatchTeamPickButton
          team={team}
          opponent={team}
          selected={selectedTeamId === team.id}
          disabled={disabled}
          pickKind={pickKind}
          fifaMatchNo={fifaMatchNo}
          onPick={() => onPick(team.id)}
        />
      </div>
    );
  }

  const [home, away] = teams as [Team, Team];
  const groupLabel =
    pickKind === "champion"
      ? `Pick champion: ${home.name} vs ${away.name}`
      : `Pick winner: ${home.name} vs ${away.name}`;
  return (
    <div
      className="mt-2 flex flex-col gap-2 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-stretch sm:gap-3"
      role="group"
      aria-label={groupLabel}
    >
      <KnockoutMatchTeamPickButton
        team={home}
        opponent={away}
        selected={selectedTeamId === home.id}
        disabled={disabled}
        pickKind={pickKind}
        fifaMatchNo={fifaMatchNo}
        onPick={() => onPick(home.id)}
      />
      <span
        className="flex items-center justify-center px-0.5 text-xs font-medium uppercase tracking-wide text-ash-muted sm:py-0"
        aria-hidden="true"
      >
        vs
      </span>
      <KnockoutMatchTeamPickButton
        team={away}
        opponent={home}
        selected={selectedTeamId === away.id}
        disabled={disabled}
        pickKind={pickKind}
        fifaMatchNo={fifaMatchNo}
        onPick={() => onPick(away.id)}
      />
    </div>
  );
}
