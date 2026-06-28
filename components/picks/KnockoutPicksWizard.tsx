"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { SaveKnockoutPicksResult } from "../../types/knockoutPicksSave";
import type { Team } from "../../src/types/domain";
import {
  assignParticipantPickDeduped,
  buildTeamIdToGroupLetter,
  buildThirdPlacePickChooserOptionsForGroup,
  eligibleRoundOf32Pool,
  isGroupScheduleLoaded,
  pruneParticipantPicks,
  THIRD_PLACE_DISABLED_MAX_SELECTED,
  thirdPlaceRowUnavailableReason,
  thirdPlaceSlotInvalidReason,
} from "../../lib/predictions/knockoutPickConsistency";
import { pruneOfficialKnockoutPathPicks } from "../../lib/predictions/pruneOfficialKnockoutPathPicks";
import { applyQuickPickToSlots } from "../../lib/predictions/knockoutQuickPickStrategies";
import { CountryFlagIcon } from "../tournament/Flag";
import { KickoffTimeDisplay } from "../datetime/KickoffTimeDisplay";
import {
  fifaRankSnapshotTitle,
  teamPickMetaLine,
} from "../../lib/teams/fifaRankDisplay";
import {
  strengthLabelHint,
  teamStrengthLabel,
} from "../../lib/teams/teamStrengthLabel";
import {
  mergeSavedWarningWithRefreshFailure,
  resolvePicksSaveClientNextStep,
  tryRefreshPicksPage,
} from "../../lib/predictions/participantPicksSaveFlow";
import {
  picksDraftSignature,
  picksSaveButtonDisabled,
  picksSaveButtonLabel,
  picksSaveStatusLine,
  reconcilePicksSaveUiState,
  type PicksSaveUiState,
} from "../../lib/predictions/picksSaveState";
import {
  readPicksMainViewPreference,
  writePicksMainViewPreference,
  type PicksMainView,
} from "../../lib/picks/picksMainViewPreference";
import { KnockoutBracketPreview } from "./KnockoutBracketPreview";
import { PicksProgressSummaryPanel } from "./PicksProgressSummaryPanel";
import { PoolPickDeadlineBanner } from "./PoolPickDeadlineBanner";
import { KnockoutBracketPathReviewBanner } from "./KnockoutBracketPathReviewBanner";
import { buildPoolPickDeadlineStatus } from "../../lib/picks/poolPickDeadlineDisplay";
import {
  buildPicksProgressSummary,
  wizardStepIndexForNextSection,
} from "../../lib/picks/picksProgressSummary";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import {
  allowedTeamsForGradualR32Match,
  allowedTeamsForGradualR32Slot,
  applyGradualR32MatchWinnerToSlots,
  buildGradualR32MatchPickRows,
  buildGradualR32SavePayload,
  countGradualR32MatchupsFilled,
  getGradualKnockoutSelectionState,
  hasGradualR32WinnerStorage,
  isFullKnockoutBracketPicksUnlocked,
  isGradualR32WinnerPickRow,
  promoteGradualR32WinnersToRoundOf32Slots,
  readGradualR32MatchWinner,
  r32MatchIndexForR16SlotKey,
  r32SlotLockMessage,
  r32SlotLockReason,
  r32SlotRowDisplay,
  shouldUseR32MatchRowUi,
} from "../../lib/picks/gradualKnockoutUnlock";
import {
  allowedTeamsForKnockoutMatchRow,
  applyKnockoutMatchWinnerToSlots,
  buildKnockoutMatchPickRows,
  countKnockoutMatchupsFilled,
  FINAL_MATCH_INCOMPLETE_MSG,
  knockoutMatchStepComplete,
  usesKnockoutMatchPickRows,
  type KnockoutMatchPickRow,
  type KnockoutWizardBracketKind,
} from "../../lib/picks/knockoutMatchPickRows";
import { isKnockoutProgressionKind } from "../../lib/predictions/knockoutProgressionKinds";

export type SaveKnockoutPicksFn = (input: {
  participantId: string;
  slots: Array<{
    predictionKind: string;
    tournamentStageId: string;
    slotKey: string | null;
    groupCode: string | null;
    bonusKey: string | null;
    teamId: string;
  }>;
}) => Promise<SaveKnockoutPicksResult>;

export type GroupPickChooserEntry = {
  team: Team;
  disabled?: boolean;
  disabledReason?: string;
};

export type KnockoutPicksWizardProps = {
  participantId: string;
  participantDisplayName: string;
  initialSlots: KnockoutPickSlotDraft[];
  /**
   * When false, Round of 32 through champion steps are hidden until organizers publish
   * all 32 official Round of 32 results. Defaults to true (e.g. admin pick editor).
   */
  knockoutBracketPicksUnlocked?: boolean;
  /** Official tournament schedule rows for gradual Round of 32 unlock. */
  tournamentMatches?: TournamentMatchPublicRow[] | null;
  teams: Team[];
  /**
   * Group letter (e.g. "A") → FIFA country codes in that group from official
   * group fixtures. When empty, group slots fall back to the full team list.
   */
  groupTeamCountryCodesByLetter?: Record<string, string[]>;
  disabled?: boolean;
  readOnly?: boolean;
  /** Pool pick deadline (ISO). Pass `null` when no deadline; omit for admin views. */
  poolLockAtIso?: string | null;
  /** @deprecated Prefer `poolLockAtIso` — raw lock hint string. */
  lockedMessage?: string | null;
  savePicks: SaveKnockoutPicksFn;
  successMessage?: string;
  successDetail?: string | null;
  saveHelpText?: string;
  postSaveRedirectTo?: string;
  /**
   * When true (and not `readOnly`), group finishes, third-place advancers, and bonus
   * picks cannot change. Knockout bracket rows stay editable once the official Round
   * of 32 is published.
   */
  preBracketSelectionsLocked?: boolean;
  /**
   * Initial display when no saved preference (`rememberPicksMainView`). Account picks
   * use `"bracket"`; admin pick wizard keeps `"list"`.
   */
  defaultPicksMainView?: PicksMainView;
  /** When true, persist list/bracket choice in localStorage (account picks only). */
  rememberPicksMainView?: boolean;
};

function isPreBracketPickSlot(slot: KnockoutPickSlotDraft): boolean {
  const k = slot.predictionKind;
  return (
    k === "group_winner" ||
    k === "group_runner_up" ||
    k === "third_place_qualifier" ||
    k === "bonus_pick"
  );
}

type BracketStepKind =
  | "third_place_qualifier"
  | "round_of_32"
  | "round_of_16"
  | "quarterfinalist"
  | "semifinalist"
  | "finalist"
  | "champion";

type WizardStepDef =
  | { id: number; mode: "group"; title: string; intro: string; hint: string }
  | {
      id: number;
      mode: "bracket";
      bracketKind: BracketStepKind;
      title: string;
      intro: string;
      hint: string;
    }
  | { id: number; mode: "bonus"; title: string; intro: string; hint: string };

function participantWizardSteps(
  knockoutBracketPicksUnlocked: boolean,
  fullBracketPicksUnlocked: boolean,
  gradualR32Pickable: boolean,
  bonusQuestionCount: number,
): WizardStepDef[] {
  const core: WizardStepDef[] = [
    {
      id: 0,
      mode: "group",
      title: "Group stage",
      intro:
        "For every letter group, pick who finishes 1st and who finishes 2nd. Scoring uses the real top two in each group.",
      hint: "You can jump between steps anytime. Third-place and knockout steps apply their own rules so you cannot reuse the same nation where it would conflict.",
    },
    {
      id: 0,
      mode: "bracket",
      bracketKind: "third_place_qualifier",
      title: "Best third-place teams",
      intro:
        "Continue from the group stage: each Group A-L row represents that group's third-place finisher. Choose from any eight of the twelve groups total, with at most one eligible team per group. Order still does not matter for scoring or FIFA routing, because you are only naming who qualifies, not where they play in the Round of 32.",
      hint: "A team cannot appear here if you already have them finishing 1st or 2nd in a group. All eight choices must be different nations. FIFA decides bracket placement via Annex C; your Stage 2 list never assigns a team to a specific R32 slot.",
    },
  ];

  const fullKnockoutChain: WizardStepDef[] = [
    {
      id: 0,
      mode: "bracket",
      bracketKind: "round_of_32",
      title: "Round of 32",
      intro: knockoutBracketPicksUnlocked
        ? "This step only appears after organizers publish the official Round of 32 (all 32 teams in their real FIFA slots). Pick the nation in each slot using the real pairings — your Stage 2 list only predicted which third-place teams qualify, not where FIFA placed them."
        : "Confirmed Round of 32 matchups can be picked as they become official. Unconfirmed slots stay locked until the bracket is published.",
      hint: knockoutBracketPicksUnlocked
        ? "Eligible teams usually match your group top-two and third-place advancers; we highlight that pool when earlier steps are filled. Knockout points count once per team by furthest round reached (see pool rules)."
        : "Pick only from the two teams in each confirmed matchup. Each match locks at kickoff. Later rounds unlock once the full Round of 32 is official.",
    },
    {
      id: 0,
      mode: "bracket",
      bracketKind: "round_of_16",
      title: "Round of 16",
      intro:
        "Pick the winner of each Round of 16 matchup. Each pairing is built from your Round of 32 winners.",
      hint: "Changing Round of 32 winners can clear picks here that no longer fit.",
    },
    {
      id: 0,
      mode: "bracket",
      bracketKind: "quarterfinalist",
      title: "Quarter-finals",
      intro: "Pick the winner of each quarter-final matchup.",
      hint: "Each pairing comes from your Round of 16 winners.",
    },
    {
      id: 0,
      mode: "bracket",
      bracketKind: "semifinalist",
      title: "Semi-finals",
      intro: "Pick the winner of each semi-final matchup.",
      hint: "Each pairing comes from your quarter-final winners.",
    },
    {
      id: 0,
      mode: "bracket",
      bracketKind: "finalist",
      title: "The final",
      intro: "Pick your tournament champion from the two finalists.",
      hint: "The winner is saved as your champion pick.",
    },
    {
      id: 0,
      mode: "bracket",
      bracketKind: "champion",
      title: "Champion",
      intro: "Confirm your tournament champion from the final matchup.",
      hint: "This mirrors your final pick. Save whenever you’re ready — you can edit until the pool locks.",
    },
  ];

  const knockoutChain: WizardStepDef[] = fullBracketPicksUnlocked
    ? fullKnockoutChain
    : gradualR32Pickable
      ? [fullKnockoutChain[0]!]
      : [];

  const bonusIntro =
    bonusQuestionCount > 0
      ? `${bonusQuestionCount} tournament-wide question${bonusQuestionCount === 1 ? "" : "s"} — most goals, most yellow cards, most red cards when your pool includes them, plus any extras from the host. One team per question.`
      : "Tournament-wide bonus questions: one team per category.";

  const bonus: WizardStepDef[] = [
    {
      id: 0,
      mode: "bonus",
      title: "Bonus picks",
      intro: bonusIntro,
      hint: "Independent from the bracket chain — pick any eligible team per category.",
    },
  ];

  return [...core, ...knockoutChain, ...bonus].map((s, i) => ({ ...s, id: i }));
}

function groupPickRows(slots: KnockoutPickSlotDraft[]): KnockoutPickSlotDraft[] {
  return slots
    .filter(
      (s) =>
        s.predictionKind === "group_winner" ||
        s.predictionKind === "group_runner_up",
    )
    .sort((a, b) => {
      const ga = a.groupCode ?? "";
      const gb = b.groupCode ?? "";
      if (ga !== gb) return ga.localeCompare(gb);
      if (a.predictionKind === b.predictionKind) return 0;
      return a.predictionKind === "group_winner" ? -1 : 1;
    });
}

function stepRowsFor(
  slots: KnockoutPickSlotDraft[],
  stepIdx: number,
  steps: WizardStepDef[],
  options?: { gradualR32MatchRows?: boolean },
): KnockoutPickSlotDraft[] {
  const def = steps[stepIdx];
  if (!def) return [];
  if (def.mode === "group") return groupPickRows(slots);
  if (def.mode === "bonus")
    return slots.filter((s) => s.predictionKind === "bonus_pick");
  if (
    options?.gradualR32MatchRows &&
    def.mode === "bracket" &&
    def.bracketKind === "round_of_32"
  ) {
    return slots
      .filter((s) => s.predictionKind === "round_of_16")
      .sort(
        (a, b) =>
          parseInt(a.slotKey ?? "0", 10) - parseInt(b.slotKey ?? "0", 10),
      );
  }
  return slots.filter((s) => s.predictionKind === def.bracketKind);
}

function stepComplete(
  slots: KnockoutPickSlotDraft[],
  stepIdx: number,
  steps: WizardStepDef[],
  options?: {
    gradualR32MatchRows?: boolean;
    gradualKnockout?: ReturnType<typeof getGradualKnockoutSelectionState>;
    teams?: Team[];
    fullBracketPicksUnlocked?: boolean;
    knockoutBracketPicksUnlocked?: boolean;
    tournamentMatches?: TournamentMatchPublicRow[] | null;
  },
): boolean {
  const def = steps[stepIdx];
  if (
    def?.mode === "bracket" &&
    options?.fullBracketPicksUnlocked &&
    usesKnockoutMatchPickRows(def.bracketKind, true) &&
    options.teams
  ) {
    const rows = buildKnockoutMatchPickRows({
      bracketKind: def.bracketKind as KnockoutWizardBracketKind,
      slots,
      teams: options.teams,
      tournamentMatches: options.tournamentMatches,
      gradual: options.gradualKnockout,
      knockoutBracketPicksUnlocked: options.knockoutBracketPicksUnlocked,
    });
    return knockoutMatchStepComplete(rows);
  }
  if (
    def?.mode === "bracket" &&
    def.bracketKind === "champion" &&
    options?.fullBracketPicksUnlocked &&
    options.teams
  ) {
    const rows = buildKnockoutMatchPickRows({
      bracketKind: "finalist",
      slots,
      teams: options.teams,
      tournamentMatches: options.tournamentMatches,
      gradual: options.gradualKnockout,
      knockoutBracketPicksUnlocked: options.knockoutBracketPicksUnlocked,
    });
    return knockoutMatchStepComplete(rows);
  }
  if (
    def?.mode === "bracket" &&
    def.bracketKind === "third_place_qualifier"
  ) {
    const thirdRows = slots.filter(
      (s) => s.predictionKind === "third_place_qualifier",
    );
    const filled = thirdRows.filter((s) => s.teamId.trim()).length;
    return (
      filled === 8 &&
      thirdRows.every((row) => thirdPlaceSlotInvalidReason(row, slots) == null)
    );
  }
  if (
    options?.gradualR32MatchRows &&
    def?.mode === "bracket" &&
    def.bracketKind === "round_of_32" &&
    options.gradualKnockout &&
    options.teams
  ) {
    const pickable = options.gradualKnockout.matchStates.filter((m) => m.pickable);
    if (pickable.length === 0) return true;
    return pickable.every((m) =>
      Boolean(
        readGradualR32MatchWinner(
          m.matchIndex,
          slots,
          options.teams!,
          m,
        ),
      ),
    );
  }
  const rows = stepRowsFor(slots, stepIdx, steps, options);
  return rows.length > 0 && rows.every((s) => s.teamId.trim() !== "");
}

/**
 * Teams eligible for a group finish slot: roster from the official schedule when
 * available; sibling finish in the same group may appear disabled with a reason.
 */
function buildGroupPickChooserOptions(
  row: KnockoutPickSlotDraft,
  slots: KnockoutPickSlotDraft[],
  allTeams: Team[],
  groupTeamCountryCodesByLetter: Record<string, string[]> | undefined,
): GroupPickChooserEntry[] {
  const gc = (row.groupCode ?? "").toUpperCase();
  const loaded = isGroupScheduleLoaded(groupTeamCountryCodesByLetter);
  const codes = loaded ? groupTeamCountryCodesByLetter![gc] : null;

  let pool: Team[];
  if (!loaded) {
    pool = [...allTeams];
  } else if (codes && codes.length > 0) {
    const set = new Set(codes.map((c) => c.toUpperCase()));
    pool = allTeams.filter((t) => set.has(t.countryCode.toUpperCase()));
  } else {
    pool = [];
  }
  pool.sort((a, b) => a.name.localeCompare(b.name));

  const otherKind =
    row.predictionKind === "group_winner" ? "group_runner_up" : "group_winner";
  const sibling = slots.find(
    (s) =>
      s.groupCode === row.groupCode &&
      s.predictionKind === otherKind &&
      s.rowKey !== row.rowKey,
  );
  const otherId = sibling?.teamId.trim() ?? "";
  const siblingLabel = sibling?.slotLabel ?? "the other finish";

  const currentId = row.teamId.trim();
  return pool.map((team) => {
    if (otherId && team.id === otherId && team.id !== currentId) {
      return {
        team,
        disabled: true,
        disabledReason: `Already picked for ${siblingLabel} in Group ${gc}.`,
      };
    }
    return { team };
  });
}

function allowedTeamsForPickRow(
  row: KnockoutPickSlotDraft,
  slots: KnockoutPickSlotDraft[],
  allTeams: Team[],
  gradualR32Teams: Team[] | null | undefined,
): Team[] {
  if (row.predictionKind === "round_of_32") {
    if (gradualR32Teams != null) {
      if (gradualR32Teams.length === 0) return [];
      const taken = new Set(
        slots
          .filter(
            (s) =>
              s.predictionKind === "round_of_32" &&
              s.rowKey !== row.rowKey &&
              s.teamId.trim(),
          )
          .map((s) => s.teamId.trim()),
      );
      return gradualR32Teams.filter(
        (t) => !taken.has(t.id) || t.id === row.teamId.trim(),
      );
    }
    const eligible = eligibleRoundOf32Pool(slots);
    const taken = new Set(
      slots
        .filter(
          (s) =>
            s.predictionKind === "round_of_32" &&
            s.rowKey !== row.rowKey &&
            s.teamId.trim(),
        )
        .map((s) => s.teamId.trim()),
    );
    if (eligible.size === 0) {
      return allTeams.filter(
        (t) => !taken.has(t.id) || t.id === row.teamId.trim(),
      );
    }
    return allTeams.filter(
      (t) =>
        eligible.has(t.id) &&
        (!taken.has(t.id) || t.id === row.teamId.trim()),
    );
  }

  if (row.predictionKind === "round_of_16") {
    if (gradualR32Teams != null) {
      if (gradualR32Teams.length === 0) return [];
      return gradualR32Teams;
    }
    const r32 = new Set(
      slots
        .filter((s) => s.predictionKind === "round_of_32" && s.teamId.trim())
        .map((s) => s.teamId.trim()),
    );
    const taken = new Set(
      slots
        .filter(
          (s) =>
            s.predictionKind === "round_of_16" &&
            s.rowKey !== row.rowKey &&
            s.teamId.trim(),
        )
        .map((s) => s.teamId.trim()),
    );
    if (r32.size === 0) {
      return allTeams.filter(
        (t) => !taken.has(t.id) || t.id === row.teamId.trim(),
      );
    }
    return allTeams.filter(
      (t) =>
        r32.has(t.id) &&
        (!taken.has(t.id) || t.id === row.teamId.trim()),
    );
  }

  if (row.predictionKind === "quarterfinalist") {
    const r16 = new Set(
      slots
        .filter((s) => s.predictionKind === "round_of_16" && s.teamId.trim())
        .map((s) => s.teamId.trim()),
    );
    const r32 = new Set(
      slots
        .filter((s) => s.predictionKind === "round_of_32" && s.teamId.trim())
        .map((s) => s.teamId.trim()),
    );
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
    if (r16.size === 0 && r32.size === 0) {
      return allTeams.filter(
        (t) => !taken.has(t.id) || t.id === row.teamId.trim(),
      );
    }
    const pool =
      r16.size > 0
        ? r16
        : r32;
    return allTeams.filter(
      (t) =>
        pool.has(t.id) &&
        (!taken.has(t.id) || t.id === row.teamId.trim()),
    );
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

  if (row.predictionKind === "champion") {
    const fin = new Set(
      slots
        .filter((s) => s.predictionKind === "finalist" && s.teamId.trim())
        .map((s) => s.teamId.trim()),
    );
    return allTeams.filter((t) => fin.has(t.id));
  }

  if (row.predictionKind === "bonus_pick") {
    return allTeams;
  }

  return allTeams;
}

function teamMatchesChooserSearch(
  t: Team,
  qLower: string,
  rankQuery: number | null,
): boolean {
  if (!qLower) return true;
  return (
    (rankQuery != null && t.fifaRank === rankQuery) ||
    t.name.toLowerCase().includes(qLower) ||
    t.countryCode.toLowerCase().includes(qLower)
  );
}

function R32MatchTeamPickButton({
  team,
  opponent,
  selected,
  disabled,
  onPick,
  pickKind = "winner",
}: {
  team: Team;
  opponent: Team;
  selected: boolean;
  disabled: boolean;
  onPick: () => void;
  pickKind?: "winner" | "champion";
}) {
  const strength = teamStrengthLabel(team.countryCode);
  const meta = teamPickMetaLine(team, strength);
  const pickLabel =
    pickKind === "champion"
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
          : "border-ash-border bg-ash-body hover:border-ash-accent/40 hover:bg-ash-accent/10"
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
    </button>
  );
}

function R32MatchDirectTeamPick({
  teams,
  selectedTeamId,
  disabled,
  onPick,
  pickKind = "winner",
}: {
  teams: [Team, Team];
  selectedTeamId?: string;
  disabled: boolean;
  onPick: (teamId: string) => void;
  pickKind?: "winner" | "champion";
}) {
  const [home, away] = teams;
  const groupLabel =
    pickKind === "champion"
      ? `Pick champion: ${home.name} vs ${away.name}`
      : `Pick winner: ${home.name} vs ${away.name}`;
  return (
    <div
      className="mt-2 grid grid-cols-[1fr_auto_1fr] items-stretch gap-2 sm:gap-3"
      role="group"
      aria-label={groupLabel}
    >
      <R32MatchTeamPickButton
        team={home}
        opponent={away}
        selected={selectedTeamId === home.id}
        disabled={disabled}
        pickKind={pickKind}
        onPick={() => onPick(home.id)}
      />
      <span
        className="flex items-center justify-center px-0.5 text-xs font-medium uppercase tracking-wide text-ash-muted"
        aria-hidden="true"
      >
        vs
      </span>
      <R32MatchTeamPickButton
        team={away}
        opponent={home}
        selected={selectedTeamId === away.id}
        disabled={disabled}
        pickKind={pickKind}
        onPick={() => onPick(away.id)}
      />
    </div>
  );
}

function emptyOptionsHint(row: KnockoutPickSlotDraft): string {
  switch (row.predictionKind) {
    case "group_winner":
    case "group_runner_up":
      return "No teams are listed for this group in the official schedule yet. Ask an organizer to load group fixtures, or try again later.";
    case "round_of_32":
      return "Finish your group picks (and ideally third-place picks) first, or clear a conflicting slot.";
    case "round_of_16":
      return "Finish your Round of 32 picks first, or clear a conflicting slot.";
    case "quarterfinalist":
      return "Finish your Round of 16 picks first (or Round of 32 if you skipped it), or clear a conflicting pick.";
    case "semifinalist":
      return "Finish your quarter-final picks first.";
    case "finalist":
      return "Finish your semi-final picks first.";
    case "champion":
      return "Pick two finalists first.";
    case "third_place_qualifier":
      return "No eligible third-place options remain in this group. Check your group winners and runners-up.";
    default:
      return "No teams available.";
  }
}

export function KnockoutPicksWizard({
  participantId,
  participantDisplayName,
  initialSlots,
  knockoutBracketPicksUnlocked = true,
  tournamentMatches = null,
  teams,
  groupTeamCountryCodesByLetter,
  disabled = false,
  readOnly = false,
  poolLockAtIso,
  lockedMessage = null,
  preBracketSelectionsLocked = false,
  savePicks,
  successMessage = "Saved. Standings and public participant pages are updated.",
  successDetail = null,
  saveHelpText = "Saving writes every slot (including empty ones you cleared) and updates standings.",
  postSaveRedirectTo,
  defaultPicksMainView = "bracket",
  rememberPicksMainView = false,
}: KnockoutPicksWizardProps) {
  const router = useRouter();
  const [isSaving, startSaveTransition] = useTransition();
  const gradualKnockout = useMemo(
    () =>
      getGradualKnockoutSelectionState({
        matches: tournamentMatches,
        teams,
        fullRoundOf32Official: knockoutBracketPicksUnlocked,
      }),
    [tournamentMatches, teams, knockoutBracketPicksUnlocked],
  );
  const gradualR32Pickable = gradualKnockout.pickableCount > 0;
  const fullBracketPicksUnlocked = isFullKnockoutBracketPicksUnlocked({
    officialRoundOf32Complete: knockoutBracketPicksUnlocked,
    gradual: gradualKnockout,
  });
  const gradualR32MatchRows = shouldUseR32MatchRowUi({
    tournamentMatches,
    knockoutBracketPicksUnlocked,
    gradualPickableCount: gradualKnockout.pickableCount,
  });
  const useLegacyR32SlotUi =
    knockoutBracketPicksUnlocked && !gradualR32MatchRows;
  const knockoutPicksAccessible =
    knockoutBracketPicksUnlocked || gradualR32Pickable;
  const knockoutPathRepairOnLoad = useMemo(
    () => pruneOfficialKnockoutPathPicks(initialSlots),
    [initialSlots],
  );
  const normalizedInitialSlots = useMemo(
    () =>
      pruneParticipantPicks(knockoutPathRepairOnLoad.slots, {
        freezeKnockoutProgressionPicks: !knockoutPicksAccessible,
      }),
    [knockoutPathRepairOnLoad.slots, knockoutPicksAccessible],
  );
  const showKnockoutPathReviewBanner =
    knockoutPathRepairOnLoad.cleared.length > 0 &&
    knockoutPicksAccessible &&
    fullBracketPicksUnlocked;
  const knockoutPathRepairUnsaved = useMemo(() => {
    if (!showKnockoutPathReviewBanner) return false;
    return (
      picksDraftSignature(normalizedInitialSlots) !==
      picksDraftSignature(initialSlots)
    );
  }, [
    showKnockoutPathReviewBanner,
    normalizedInitialSlots,
    initialSlots,
  ]);
  const initialSignature = useMemo(
    () => picksDraftSignature(normalizedInitialSlots),
    [normalizedInitialSlots],
  );
  const [slots, setSlots] = useState<KnockoutPickSlotDraft[]>(
    () => normalizedInitialSlots,
  );
  const gradualR32MatchRowsByKey = useMemo(() => {
    if (!gradualR32MatchRows) return null;
    const rows = buildGradualR32MatchPickRows({
      slots,
      state: gradualKnockout,
      teams,
      fullRoundOf32Official: knockoutBracketPicksUnlocked,
    });
    return new Map(rows.map((r) => [r.rowKey, r]));
  }, [
    gradualR32MatchRows,
    slots,
    gradualKnockout,
    teams,
    knockoutBracketPicksUnlocked,
  ]);
  const [step, setStep] = useState(0);

  const bonusQuestionCount = useMemo(
    () => slots.filter((s) => s.predictionKind === "bonus_pick").length,
    [slots],
  );

  const wizardSteps = useMemo(
    () =>
      participantWizardSteps(
        knockoutBracketPicksUnlocked,
        fullBracketPicksUnlocked,
        gradualR32Pickable,
        bonusQuestionCount,
      ),
    [
      knockoutBracketPicksUnlocked,
      fullBracketPicksUnlocked,
      gradualR32Pickable,
      bonusQuestionCount,
    ],
  );
  const picksProgress = useMemo(
    () =>
      buildPicksProgressSummary(slots, {
        knockoutBracketPicksUnlocked: fullBracketPicksUnlocked,
        preKnockoutLocked: preBracketSelectionsLocked,
      }),
    [slots, fullBracketPicksUnlocked, preBracketSelectionsLocked],
  );
  const deadlineStatus = useMemo(
    () =>
      poolLockAtIso !== undefined
        ? buildPoolPickDeadlineStatus({
            lockAtIso: poolLockAtIso,
            knockoutBracketPicksUnlocked,
            tournamentMatches,
          })
        : null,
    [poolLockAtIso, knockoutBracketPicksUnlocked, tournamentMatches],
  );
  const [savedSignature, setSavedSignature] = useState(() => initialSignature);
  const [saveUiState, setSaveUiState] = useState<PicksSaveUiState>({
    kind: "saved",
    lastSavedAt: null,
  });
  const [quickHint, setQuickHint] = useState<string | null>(null);
  const [openRowKey, setOpenRowKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [picksMainView, setPicksMainView] = useState<PicksMainView>(
    defaultPicksMainView,
  );
  const lastParticipantIdRef = useRef(participantId);

  useEffect(() => {
    if (!rememberPicksMainView) return;
    setPicksMainView(readPicksMainViewPreference(defaultPicksMainView));
  }, [rememberPicksMainView, defaultPicksMainView]);

  function selectPicksMainView(view: PicksMainView) {
    setPicksMainView(view);
    if (rememberPicksMainView) writePicksMainViewPreference(view);
    setOpenRowKey(null);
    setSearch("");
  }

  function promoteGradualR32BeforeLaterKnockoutStep(nextStepIdx: number) {
    const target = wizardSteps[nextStepIdx];
    if (!target || target.mode !== "bracket") return;
    if (
      target.bracketKind === "round_of_32" ||
      target.bracketKind === "third_place_qualifier"
    ) {
      return;
    }
    if (
      !fullBracketPicksUnlocked ||
      knockoutBracketPicksUnlocked ||
      !gradualR32MatchRows
    ) {
      return;
    }
    setSlots((prev) => {
      if (!hasGradualR32WinnerStorage(prev, gradualKnockout, teams)) {
        return prev;
      }
      return promoteGradualR32WinnersToRoundOf32Slots(
        prev,
        gradualKnockout,
        teams,
      );
    });
  }

  function continueToNextSection() {
    const next = picksProgress.nextSection;
    if (!next) return;
    const stepIdx = wizardStepIndexForNextSection(next, wizardSteps);
    selectPicksMainView("list");
    if (stepIdx != null) {
      promoteGradualR32BeforeLaterKnockoutStep(stepIdx);
      setStep(stepIdx);
      setOpenRowKey(null);
      setSearch("");
      window.setTimeout(() => {
        document
          .getElementById("picks-progress-summary")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 0);
    }
  }
  const draftSignature = useMemo(() => picksDraftSignature(slots), [slots]);

  useEffect(() => {
    const sameParticipant = lastParticipantIdRef.current === participantId;
    lastParticipantIdRef.current = participantId;
    setSlots(normalizedInitialSlots);
    setSavedSignature(initialSignature);
    setSaveUiState((prev) => ({
      kind: "saved",
      lastSavedAt: sameParticipant ? prev.lastSavedAt : null,
    }));
  }, [participantId, normalizedInitialSlots, initialSignature]);

  useEffect(() => {
    setStep((s) =>
      s >= wizardSteps.length ? Math.max(0, wizardSteps.length - 1) : s,
    );
  }, [wizardSteps.length]);

  useEffect(() => {
    if (!quickHint) return;
    const t = window.setTimeout(() => setQuickHint(null), 6000);
    return () => window.clearTimeout(t);
  }, [quickHint]);

  useEffect(() => {
    if (isSaving) return;
    setSaveUiState((prev) =>
      reconcilePicksSaveUiState({
        draftSignature,
        savedSignature,
        currentState: prev,
      }),
    );
  }, [draftSignature, savedSignature, isSaving]);

  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const thirdPlaceTeamGroupById = useMemo(
    () => buildTeamIdToGroupLetter(teams, groupTeamCountryCodesByLetter),
    [teams, groupTeamCountryCodesByLetter],
  );

  const coreDisabled = disabled || readOnly || isSaving;
  const preBracketActive = preBracketSelectionsLocked && !readOnly;

  function pickRowDisabled(row: KnockoutPickSlotDraft): boolean {
    if (coreDisabled || (preBracketActive && isPreBracketPickSlot(row))) {
      return true;
    }
    if (isGradualR32WinnerPickRow(row, useLegacyR32SlotUi)) {
      const gradualRow = gradualR32MatchRowsByKey?.get(row.rowKey);
      return gradualRow?.lockReason !== "pickable";
    }
    if (row.predictionKind === "round_of_32" && !knockoutBracketPicksUnlocked) {
      const reason = r32SlotLockReason(
        row.slotKey,
        gradualKnockout,
        knockoutBracketPicksUnlocked,
      );
      return reason !== "pickable";
    }
    if (
      isKnockoutProgressionKind(row.predictionKind) &&
      !fullBracketPicksUnlocked
    ) {
      return true;
    }
    if (
      row.predictionKind === "round_of_32" &&
      knockoutBracketPicksUnlocked
    ) {
      const reason = r32SlotLockReason(
        row.slotKey,
        gradualKnockout,
        knockoutBracketPicksUnlocked,
      );
      return reason === "started";
    }
    return false;
  }

  function gradualTeamsForRow(row: KnockoutPickSlotDraft): Team[] | null {
    if (isGradualR32WinnerPickRow(row, useLegacyR32SlotUi)) {
      const matchIndex = r32MatchIndexForR16SlotKey(row.slotKey);
      if (matchIndex < 0) return [];
      return allowedTeamsForGradualR32Match(
        matchIndex,
        gradualKnockout,
        teams,
        knockoutBracketPicksUnlocked,
      );
    }
    if (row.predictionKind !== "round_of_32" || knockoutBracketPicksUnlocked) {
      return null;
    }
    const restricted = allowedTeamsForGradualR32Slot(
      row.slotKey,
      gradualKnockout,
      teams,
      knockoutBracketPicksUnlocked,
    );
    return restricted;
  }

  const currentStepDef = wizardSteps[step];
  const currentKnockoutMatchRows = useMemo(() => {
    if (
      currentStepDef?.mode !== "bracket" ||
      !fullBracketPicksUnlocked ||
      !usesKnockoutMatchPickRows(currentStepDef.bracketKind, true)
    ) {
      return null;
    }
    return buildKnockoutMatchPickRows({
      bracketKind: currentStepDef.bracketKind as KnockoutWizardBracketKind,
      slots,
      teams,
      tournamentMatches,
      gradual: gradualKnockout,
      knockoutBracketPicksUnlocked,
    });
  }, [
    currentStepDef,
    fullBracketPicksUnlocked,
    slots,
    teams,
    tournamentMatches,
    gradualKnockout,
    knockoutBracketPicksUnlocked,
  ]);
  const championStepFinalRows = useMemo(() => {
    if (
      currentStepDef?.mode !== "bracket" ||
      currentStepDef.bracketKind !== "champion" ||
      !fullBracketPicksUnlocked
    ) {
      return null;
    }
    return buildKnockoutMatchPickRows({
      bracketKind: "finalist",
      slots,
      teams,
      tournamentMatches,
      gradual: gradualKnockout,
      knockoutBracketPicksUnlocked,
    });
  }, [
    currentStepDef,
    fullBracketPicksUnlocked,
    slots,
    teams,
    tournamentMatches,
    gradualKnockout,
    knockoutBracketPicksUnlocked,
  ]);
  const activeKnockoutMatchRows =
    currentKnockoutMatchRows ?? championStepFinalRows;
  const stepRowOptions = useMemo(
    () => ({
      gradualR32MatchRows,
      gradualKnockout,
      teams,
      fullBracketPicksUnlocked,
      knockoutBracketPicksUnlocked,
      tournamentMatches,
    }),
    [
      gradualR32MatchRows,
      gradualKnockout,
      teams,
      fullBracketPicksUnlocked,
      knockoutBracketPicksUnlocked,
      tournamentMatches,
    ],
  );
  const stepRows = useMemo(
    () => stepRowsFor(slots, step, wizardSteps, stepRowOptions),
    [slots, step, wizardSteps, stepRowOptions],
  );

  function setKnockoutMatchWinner(
    matchRow: KnockoutMatchPickRow,
    teamId: string,
  ) {
    setSlots((prev) => {
      const id = teamId.trim();
      const bracketKind =
        currentStepDef?.mode === "bracket"
          ? (currentStepDef.bracketKind as KnockoutWizardBracketKind)
          : undefined;
      const freshRow =
        bracketKind &&
        usesKnockoutMatchPickRows(bracketKind, true) &&
        fullBracketPicksUnlocked
          ? buildKnockoutMatchPickRows({
              bracketKind,
              slots: prev,
              teams,
              tournamentMatches,
              gradual: gradualKnockout,
              knockoutBracketPicksUnlocked,
            }).find((r) => r.rowKey === matchRow.rowKey) ?? matchRow
          : matchRow;
      if (
        id &&
        id !== freshRow.homeTeamId &&
        id !== freshRow.awayTeamId
      ) {
        return prev;
      }
      if (freshRow.lockReason !== "pickable") {
        return prev;
      }
      const next = applyKnockoutMatchWinnerToSlots(prev, freshRow, id);
      return pruneParticipantPicks(next, {
        freezeKnockoutProgressionPicks: !knockoutPicksAccessible,
      });
    });
  }

  function setTeamForRow(rowKey: string, teamId: string) {
    let autoClearNotice: string | null = null;
    setSlots((prev) => {
      const row = prev.find((x) => x.rowKey === rowKey);
      if (
        row &&
        preBracketSelectionsLocked &&
        !readOnly &&
        isPreBracketPickSlot(row)
      ) {
        return prev;
      }
      if (
        row &&
        isGradualR32WinnerPickRow(row, useLegacyR32SlotUi)
      ) {
        const matchIndex = r32MatchIndexForR16SlotKey(row.slotKey);
        if (matchIndex < 0) return prev;
        return applyGradualR32MatchWinnerToSlots(
          prev,
          matchIndex,
          teamId,
          gradualKnockout,
        );
      }
      const next = assignParticipantPickDeduped(prev, rowKey, teamId, {
        freezeKnockoutProgressionPicks: !knockoutPicksAccessible,
      });
      if (
        row &&
        (row.predictionKind === "group_winner" ||
          row.predictionKind === "group_runner_up")
      ) {
        const clearedThirds = prev
          .filter(
            (s) =>
              s.predictionKind === "third_place_qualifier" &&
              s.teamId.trim() &&
              !next.some(
                (n) => n.rowKey === s.rowKey && n.teamId.trim() === s.teamId.trim(),
              ),
          )
          .map((s) => teamById.get(s.teamId.trim())?.name ?? "a third-place pick");
        if (clearedThirds.length > 0) {
          autoClearNotice =
            clearedThirds.length === 1
              ? `${clearedThirds[0]} was cleared from Stage 2 because that team is now in your group top two.`
              : `${clearedThirds.length} Stage 2 picks were cleared because those teams are now in your group top two.`;
        }
      }
      return next;
    });
    if (autoClearNotice) setQuickHint(autoClearNotice);
  }

  function applyQuick(mode: "random" | "favorites" | "balanced") {
    setSlots((prev) =>
      applyQuickPickToSlots(prev, teams, mode, {
        fillKnockoutProgression: knockoutBracketPicksUnlocked,
        groupTeamCountryCodesByLetter,
      }),
    );
    setQuickHint(
      knockoutBracketPicksUnlocked
        ? mode === "random"
          ? "We filled the bracket from groups through champion — adjust anything you like."
          : mode === "favorites"
            ? "We leaned on popular picks through the whole path — tweak as you wish."
            : "We spread teams across regions for groups, then narrowed down — edit freely."
        : mode === "random"
          ? "We filled group finishes and your eight third-place advancers — confirmed Round of 32 matchups will open for picks as they become official."
          : mode === "favorites"
            ? "We leaned on popular picks for groups and third-place advancers. Pick confirmed knockout matchups in list view as they unlock."
            : "We spread teams for groups and third-place advancers. Pick confirmed Round of 32 matchups in list view as they become available.",
    );
    setOpenRowKey(null);
    setStep(0);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (disabled || readOnly) return;
    const submittedSignature = draftSignature;
    let saveSlots = slots;
    if (
      fullBracketPicksUnlocked &&
      gradualR32MatchRows &&
      hasGradualR32WinnerStorage(saveSlots, gradualKnockout, teams)
    ) {
      saveSlots = promoteGradualR32WinnersToRoundOf32Slots(
        saveSlots,
        gradualKnockout,
        teams,
      );
    }
    const submittedSlots =
      gradualR32MatchRows && !fullBracketPicksUnlocked
      ? buildGradualR32SavePayload({
          slots: saveSlots,
          state: gradualKnockout,
          omitFrozenPreBracketPicks: preBracketActive,
        })
      : saveSlots.map((s) => ({
          predictionKind: s.predictionKind,
          tournamentStageId: s.tournamentStageId,
          slotKey: s.slotKey,
          groupCode: s.groupCode,
          bonusKey: s.bonusKey,
          teamId: s.teamId,
        }));
    setSaveUiState((prev) => ({
      kind: "saving",
      lastSavedAt: prev.lastSavedAt,
    }));
    startSaveTransition(async () => {
      try {
        const res = await savePicks({
          participantId,
          slots: submittedSlots,
        });
        const next = resolvePicksSaveClientNextStep(res, { postSaveRedirectTo });
        if (next.step === "show_error") {
          setSaveUiState((prev) => ({
            kind: "error",
            failedSignature: submittedSignature,
            message: next.message,
            lastSavedAt: prev.lastSavedAt,
          }));
          return;
        }
        if (next.step === "redirect") {
          router.push(next.to);
          return;
        }

        setSavedSignature(submittedSignature);
        setSaveUiState({
          kind: "saved",
          lastSavedAt: Date.now(),
          warning: next.warning,
        });

        const refreshResult = await tryRefreshPicksPage(() => router.refresh());
        if (refreshResult.refreshFailed) {
          setSaveUiState((prev) =>
            prev.kind === "saved"
              ? {
                  ...prev,
                  warning: mergeSavedWarningWithRefreshFailure(
                    prev.warning,
                    true,
                  ),
                }
              : prev,
          );
        }
      } catch (error) {
        const message =
          error instanceof Error && error.message.trim()
            ? error.message.trim()
            : "Could not reach the server. Your picks may or may not have saved — reload to check.";
        setSaveUiState((prev) => ({
          kind: "error",
          failedSignature: submittedSignature,
          message,
          lastSavedAt: prev.lastSavedAt,
        }));
      }
    });
  }

  function goNext() {
    if (step >= wizardSteps.length - 1) return;
    if (!stepComplete(slots, step, wizardSteps, stepRowOptions)) return;
    const nextStep = step + 1;
    promoteGradualR32BeforeLaterKnockoutStep(nextStep);
    setStep(nextStep);
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
      <div className="rounded-md border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
        Tournament stages are not set up yet. Ensure{" "}
        <code className="rounded bg-amber-950/60 px-1 py-0.5 text-[11px] text-amber-100">
          group
        </code>
        ,{" "}
        <code className="rounded bg-amber-950/60 px-1 py-0.5 text-[11px] text-amber-100">
          round_of_32
        </code>
        ,{" "}
        <code className="rounded bg-amber-950/60 px-1 py-0.5 text-[11px] text-amber-100">
          round_of_16
        </code>
        ,{" "}
        <code className="rounded bg-amber-950/60 px-1 py-0.5 text-[11px] text-amber-100">
          quarterfinal
        </code>
        ,{" "}
        <code className="rounded bg-amber-950/60 px-1 py-0.5 text-[11px] text-amber-100">
          semifinal
        </code>
        , and{" "}
        <code className="rounded bg-amber-950/60 px-1 py-0.5 text-[11px] text-amber-100">
          final
        </code>{" "}
        exist in{" "}
        <code className="text-[11px] text-amber-200">tournament_stages</code>.
      </div>
    );
  }

  const canGoNext =
    stepComplete(slots, step, wizardSteps, stepRowOptions) &&
    step < wizardSteps.length - 1;

  const groupStepIdx = wizardSteps.findIndex((s) => s.mode === "group");
  const groupFilled =
    groupStepIdx >= 0
      ? stepRowsFor(slots, groupStepIdx, wizardSteps).filter((s) => s.teamId.trim())
          .length
      : 0;
  const groupTotal =
    groupStepIdx >= 0 ? stepRowsFor(slots, groupStepIdx, wizardSteps).length : 0;
  const thirdFilled = slots.filter(
    (s) => s.predictionKind === "third_place_qualifier" && s.teamId.trim(),
  ).length;
  const r32MatchRowTargetCount = gradualR32MatchRows
    ? gradualKnockout.matchStates.filter((m) =>
        knockoutBracketPicksUnlocked ? m.confirmed && !m.started : m.pickable,
      ).length
    : 32;
  const r32Filled = gradualR32MatchRows
    ? countGradualR32MatchupsFilled({
        slots,
        state: gradualKnockout,
        teams,
        matchIndices: gradualKnockout.matchStates
          .filter((m) =>
            knockoutBracketPicksUnlocked ? m.confirmed && !m.started : m.pickable,
          )
          .map((m) => m.matchIndex),
      })
    : slots.filter(
        (s) => s.predictionKind === "round_of_32" && s.teamId.trim(),
      ).length;
  const effectiveSaveHelpText = gradualR32MatchRows
    ? "Save confirmed matchup winners as they unlock. Locked matchups are not changed when you save."
    : saveHelpText;
  const r16MatchRowsFilled = fullBracketPicksUnlocked
    ? countKnockoutMatchupsFilled(
        buildKnockoutMatchPickRows({
          bracketKind: "round_of_16",
          slots,
          teams,
          tournamentMatches,
          gradual: gradualKnockout,
          knockoutBracketPicksUnlocked,
        }),
        { onlyPickable: true },
      )
    : slots.filter(
        (s) => s.predictionKind === "round_of_16" && s.teamId.trim(),
      ).length;
  const qfMatchRowsFilled = fullBracketPicksUnlocked
    ? countKnockoutMatchupsFilled(
        buildKnockoutMatchPickRows({
          bracketKind: "quarterfinalist",
          slots,
          teams,
          tournamentMatches,
          gradual: gradualKnockout,
          knockoutBracketPicksUnlocked,
        }),
        { onlyPickable: true },
      )
    : slots.filter(
        (s) => s.predictionKind === "quarterfinalist" && s.teamId.trim(),
      ).length;

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <p className="text-sm text-ash-muted">
        {readOnly ? "Viewing picks for " : "Editing picks for "}
        <span className="font-medium text-ash-text">
          {participantDisplayName}
        </span>
        {readOnly
          ? " — this view is read-only."
          : preBracketActive
            ? " Group stage, third-place, and bonus picks are locked — see the deadline banner above for what you can still edit."
            : ". Start in bracket view to see what’s filled and what’s missing, or switch to list view to edit step by step — then save."}
      </p>

      {deadlineStatus ? (
        <PoolPickDeadlineBanner status={deadlineStatus} />
      ) : lockedMessage ? (
        <p
          className="rounded-md border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-100"
          role="status"
        >
          {lockedMessage}
        </p>
      ) : null}

      {showKnockoutPathReviewBanner ? (
        <KnockoutBracketPathReviewBanner unsavedRepair={knockoutPathRepairUnsaved} />
      ) : null}

      {saveUiState.kind === "error" ? (
        <p
          className="rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200"
          role="alert"
        >
          {saveUiState.message}
        </p>
      ) : null}
      {saveUiState.kind === "saved" && saveUiState.lastSavedAt != null ? (
        <div
          className="rounded-md border border-ash-accent/40 bg-ash-accent/10 px-3 py-2 text-sm text-ash-muted"
          role="status"
        >
          <p className={successDetail ? "font-medium text-ash-text" : undefined}>
            {successMessage}
          </p>
          {successDetail ? (
            <p className="mt-1.5 text-xs font-normal leading-relaxed text-ash-muted">
              {successDetail}
            </p>
          ) : null}
        </div>
      ) : null}
      {saveUiState.kind === "saved" && saveUiState.warning ? (
        <p
          className="rounded-md border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-100"
          role="status"
        >
          {saveUiState.warning}
        </p>
      ) : null}
      {quickHint ? (
        <p
          className="rounded-md border border-sky-800/60 bg-sky-950/30 px-3 py-2 text-sm text-sky-100"
          role="status"
        >
          {quickHint}
        </p>
      ) : null}

      {!knockoutPicksAccessible && !readOnly ? (
        <p
          className="rounded-md border border-sky-800/50 bg-sky-950/25 px-3 py-2 text-sm text-sky-100"
          role="status"
        >
          Stage 3 (Round of 32 through champion) opens as official matchups are
          confirmed. Use List view to edit group stage, third-place qualification,
          and bonus picks.
        </p>
      ) : !knockoutBracketPicksUnlocked &&
          gradualR32Pickable &&
          !fullBracketPicksUnlocked &&
          !readOnly ? (
        <p
          className="rounded-md border border-sky-800/50 bg-sky-950/25 px-3 py-2 text-sm text-sky-100"
          role="status"
        >
          Confirmed Round of 32 matchups are open for picks. Unconfirmed slots stay
          locked. Later knockout rounds unlock once the full bracket is official.
        </p>
      ) : !knockoutBracketPicksUnlocked &&
          fullBracketPicksUnlocked &&
          gradualR32MatchRows &&
          !readOnly ? (
        <p
          className="rounded-md border border-sky-800/50 bg-sky-950/25 px-3 py-2 text-sm text-sky-100"
          role="status"
        >
          The official Round of 32 is set. Pick match winners, then continue through
          Round of 16, the quarters, semis, final, and champion.
        </p>
      ) : null}

      {!readOnly ? (
        <div className="space-y-3">
          <PicksProgressSummaryPanel
            summary={picksProgress}
            onContinue={continueToNextSection}
            showListViewHint={picksMainView === "bracket"}
            onSwitchToListView={() => selectPicksMainView("list")}
          />
        </div>
      ) : null}

      <div
        className="flex flex-wrap items-center gap-2 border-b border-ash-border pb-4"
        role="tablist"
        aria-label="Picks display mode"
      >
        <span className="text-xs font-medium uppercase tracking-wide text-ash-muted">
          View
        </span>
        <button
          type="button"
          role="tab"
          aria-selected={picksMainView === "bracket"}
          onClick={() => selectPicksMainView("bracket")}
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
            picksMainView === "bracket"
              ? "bg-ash-accent text-white"
              : "bg-ash-surface text-ash-muted ring-1 ring-ash-border hover:bg-ash-border/30"
          }`}
        >
          Bracket view
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={picksMainView === "list"}
          onClick={() => selectPicksMainView("list")}
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
            picksMainView === "list"
              ? "bg-ash-accent text-white"
              : "bg-ash-surface text-ash-muted ring-1 ring-ash-border hover:bg-ash-border/30"
          }`}
        >
          List view
        </button>
      </div>
      <p className="-mt-2 text-xs leading-relaxed text-ash-muted">
        {knockoutPicksAccessible
          ? "Bracket view is the default — it shows your full path and empty slots at a glance. List view is best when you want to work through picks one step at a time."
          : "Bracket view shows a preview of your future knockout path from group-stage picks. Switch to List view to edit group stage, third-place qualification, bonus picks, and confirmed knockout matchups."}
      </p>

      {picksMainView === "bracket" ? (
        <section className="ash-surface p-4">
          <h2 className="text-lg font-bold text-ash-text">
            {knockoutBracketPicksUnlocked ? "Knockout bracket" : "Bracket preview"}
          </h2>
          <p className="mt-1 text-xs text-ash-muted">
            {knockoutBracketPicksUnlocked
              ? "How your Round of 32 through champion picks line up. This mirrors your list selections (including unsaved changes until you save)."
              : knockoutPicksAccessible
                ? "Your qualification picks plus a preview of Round of 32 from group results. Confirmed matchups are pickable in list view; unconfirmed slots stay locked until official."
                : "Your qualification picks and a preview of Round of 32 from group results. Confirmed matchups will become pickable as they are available; unconfirmed slots stay locked until confirmed."}
          </p>
          <div className="mt-4">
            <KnockoutBracketPreview
              slots={slots}
              teams={teams}
              knockoutBracketPicksUnlocked={fullBracketPicksUnlocked}
              onSwitchToListView={
                !readOnly && !knockoutBracketPicksUnlocked
                  ? () => selectPicksMainView("list")
                  : undefined
              }
              showListViewCta={!readOnly}
            />
          </div>
        </section>
      ) : null}

      {picksMainView === "list" ? (
        <>
      <nav aria-label="Tournament pick steps" className="flex flex-wrap gap-2">
        {wizardSteps.map((s, i) => {
          const done = stepComplete(slots, i, wizardSteps, stepRowOptions);
          const active = i === step;
          const rows = stepRowsFor(slots, i, wizardSteps, stepRowOptions);
          const missingInStep =
            stepRowOptions.gradualR32MatchRows &&
            s.mode === "bracket" &&
            s.bracketKind === "round_of_32" &&
            stepRowOptions.gradualKnockout &&
            stepRowOptions.teams
              ? Math.max(
                  0,
                  stepRowOptions.gradualKnockout.pickableCount -
                    countGradualR32MatchupsFilled({
                      slots,
                      state: stepRowOptions.gradualKnockout,
                      teams: stepRowOptions.teams,
                      matchIndices: stepRowOptions.gradualKnockout.matchStates
                        .filter((m) => m.pickable)
                        .map((m) => m.matchIndex),
                    }),
                )
              : s.mode === "bracket" &&
                  stepRowOptions.fullBracketPicksUnlocked &&
                  usesKnockoutMatchPickRows(s.bracketKind, true) &&
                  stepRowOptions.teams
                ? (() => {
                    const matchRows = buildKnockoutMatchPickRows({
                      bracketKind: s.bracketKind as KnockoutWizardBracketKind,
                      slots,
                      teams: stepRowOptions.teams,
                      tournamentMatches: stepRowOptions.tournamentMatches,
                      gradual: stepRowOptions.gradualKnockout,
                      knockoutBracketPicksUnlocked:
                        stepRowOptions.knockoutBracketPicksUnlocked,
                    });
                    const pickable = matchRows.filter(
                      (r) => r.lockReason === "pickable",
                    );
                    return Math.max(
                      0,
                      pickable.length -
                        countKnockoutMatchupsFilled(matchRows, {
                          onlyPickable: true,
                        }),
                    );
                  })()
              : s.mode === "bracket" && s.bracketKind === "third_place_qualifier"
              ? Math.max(
                  0,
                  8 -
                    rows.filter((r) => r.teamId.trim()).length,
                )
              : rows.filter((r) => !r.teamId.trim()).length;
          return (
            <button
              key={s.id}
              type="button"
              disabled={coreDisabled}
              title={
                done
                  ? `${s.title} — complete`
                  : missingInStep > 0
                    ? `${s.title} — ${missingInStep} missing`
                    : s.title
              }
              onClick={() => {
                promoteGradualR32BeforeLaterKnockoutStep(i);
                setStep(i);
                setOpenRowKey(null);
                setSearch("");
              }}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                active
                  ? "bg-ash-accent text-white"
                  : done
                    ? "bg-ash-accent/20 text-ash-accent hover:bg-ash-accent/30"
                    : missingInStep > 0
                      ? "bg-amber-950/35 text-amber-100 ring-1 ring-amber-700/45 hover:bg-amber-950/50"
                      : "bg-ash-surface text-ash-muted ring-1 ring-ash-border hover:bg-ash-border/30"
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {i + 1}. {s.title}
              {!done && missingInStep > 0 ? (
                <span className="ml-1 tabular-nums opacity-80">
                  ({missingInStep})
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      {currentStepDef ? (
        <section className="ash-surface p-4">
          <h2 className="text-lg font-bold text-ash-text">
            {currentStepDef.title}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ash-muted">
            {currentStepDef.intro}
          </p>
          <p className="mt-2 text-xs text-ash-border-hover">
            {currentStepDef.hint}
          </p>

          {currentStepDef.mode === "bracket" &&
          currentStepDef.bracketKind === "third_place_qualifier" ? (
            <div className="mt-4 flex flex-col gap-3 rounded-lg border border-ash-border/80 bg-gradient-to-br from-ash-body/70 to-ash-body/30 px-3 py-3 sm:flex-row sm:items-stretch sm:justify-between sm:gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-wide text-ash-muted">
                  Same letter groups as Stage 1
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-ash-text">
                  Each row below is one group's third-place finisher. Only that
                  group's eligible teams appear in the picker, and only eight of
                  these twelve groups should end with a selection.
                </p>
              </div>
              <div
                className="flex shrink-0 flex-col justify-center rounded-md border border-ash-accent/40 bg-ash-accent/10 px-4 py-2 text-center sm:min-w-[9rem]"
                role="status"
                aria-live="polite"
              >
                <p className="text-[10px] font-semibold uppercase tracking-wide text-ash-muted">
                  Selected
                </p>
                <p className="text-xl font-bold tabular-nums tracking-tight text-ash-text">
                  {thirdFilled}{" "}
                  <span className="text-sm font-semibold text-ash-muted">of 8</span>
                </p>
              </div>
            </div>
          ) : null}

          {currentStepDef.mode === "group" &&
          !readOnly &&
          !coreDisabled &&
          !preBracketSelectionsLocked ? (
            <div className="ash-surface mt-4 border border-ash-border bg-ash-body/30 p-3">
              <p className="text-sm font-medium text-ash-text">
                {knockoutBracketPicksUnlocked
                  ? "Quick starter (groups through champion)"
                  : "Quick starter (groups & third-place advancers)"}
              </p>
              <p className="mt-1 text-xs text-ash-muted">
                {knockoutBracketPicksUnlocked
                  ? "We’ll fill group finishes, your eight third-place advancers, every knockout round, and the champion in one coherent pass. Bonus questions stay for you to choose."
                  : "We’ll fill group finishes and your eight third-place advancers. Confirmed Round of 32 matchups can be picked in list view as they become official; later rounds unlock once the full bracket is confirmed. Bonus questions stay for you to choose."}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => applyQuick("favorites")}
                  className="rounded-lg border border-ash-border bg-ash-body px-3 py-1.5 text-xs font-medium text-ash-text transition-colors hover:bg-ash-surface"
                >
                  Fan favorites mix
                </button>
                <button
                  type="button"
                  onClick={() => applyQuick("balanced")}
                  className="rounded-lg border border-ash-border bg-ash-body px-3 py-1.5 text-xs font-medium text-ash-text transition-colors hover:bg-ash-surface"
                >
                  Balanced spread
                </button>
                <button
                  type="button"
                  onClick={() => applyQuick("random")}
                  className="rounded-lg border border-ash-border bg-ash-body px-3 py-1.5 text-xs font-medium text-ash-text transition-colors hover:bg-ash-surface"
                >
                  Surprise me (random)
                </button>
              </div>
            </div>
          ) : null}

          {currentStepDef.mode === "group" && groupFilled < groupTotal ? (
            <p className="mt-4 rounded-md border border-amber-700/40 bg-amber-950/25 px-3 py-2 text-sm text-amber-100">
              Pick first and second for every group. You’ve filled {groupFilled}{" "}
              of {groupTotal} slots.
            </p>
          ) : null}
          {currentStepDef.mode === "bracket" &&
          currentStepDef.bracketKind === "third_place_qualifier" ? (
            <div className="mt-4 space-y-3">
              <p className="rounded-md border border-ash-border/60 bg-ash-body/25 px-3 py-2 text-xs leading-relaxed text-ash-muted">
                Each Stage 2 row is locked to its own group. Teams already chosen
                1st or 2nd in that same group are excluded, no nation can appear
                twice, and exactly eight groups should end up with a selected
                third-place team. If you change Stage 1, conflicting Stage 2 picks
                clear immediately; reloads also reapply these checks to stored data.
              </p>
              {thirdFilled < 8 ? (
                <p className="rounded-md border border-amber-700/40 bg-amber-950/25 px-3 py-2 text-sm text-amber-100">
                  Choose exactly eight groups whose third-place team will advance.
                  The counter above tracks progress toward eight.
                </p>
              ) : (
                <p className="rounded-md border border-sky-800/40 bg-sky-950/20 px-3 py-2 text-sm text-sky-100">
                  You already have eight groups selected. Clear one of your current
                  eight if you want to choose a different group.
                </p>
              )}
            </div>
          ) : null}
          {currentStepDef.mode === "bracket" &&
          currentStepDef.bracketKind === "round_of_32" &&
          (gradualR32MatchRows
            ? r32Filled < r32MatchRowTargetCount
            : r32Filled < 32) ? (
            <p className="mt-4 rounded-md border border-amber-700/40 bg-amber-950/25 px-3 py-2 text-sm text-amber-100">
              {gradualR32MatchRows
                ? `Pick confirmed matchups as they unlock. ${r32MatchRowTargetCount} matchups available now · ${r32Filled} of ${r32MatchRowTargetCount} filled.`
                : `Pick all 32 Round of 32 teams in their official slots. ${r32Filled} of 32 so far.`}
            </p>
          ) : null}
          {currentStepDef.mode === "bracket" &&
          currentStepDef.bracketKind === "round_of_16" &&
          (fullBracketPicksUnlocked
            ? r16MatchRowsFilled < 8
            : r16MatchRowsFilled < 16) ? (
            <p className="mt-4 rounded-md border border-amber-700/40 bg-amber-950/25 px-3 py-2 text-sm text-amber-100">
              {fullBracketPicksUnlocked
                ? `Pick all eight Round of 16 matchups. ${r16MatchRowsFilled} of 8 so far.`
                : `Pick sixteen Round of 16 teams. ${r16MatchRowsFilled} of 16 so far.`}
            </p>
          ) : null}
          {currentStepDef.mode === "bracket" &&
          currentStepDef.bracketKind === "quarterfinalist" &&
          (fullBracketPicksUnlocked
            ? qfMatchRowsFilled < 4
            : qfMatchRowsFilled < 8) ? (
            <p className="mt-4 rounded-md border border-amber-700/40 bg-amber-950/25 px-3 py-2 text-sm text-amber-100">
              {fullBracketPicksUnlocked
                ? `Pick all four quarter-final matchups. ${qfMatchRowsFilled} of 4 so far.`
                : `Pick all eight quarter-finalists. ${qfMatchRowsFilled} of 8 so far.`}
            </p>
          ) : null}
          {currentStepDef.mode === "bracket" &&
          currentStepDef.bracketKind === "semifinalist" &&
          slots.filter((s) => s.predictionKind === "semifinalist" && s.teamId.trim())
            .length < 4 ? (
            <p className="mt-4 rounded-md border border-amber-700/40 bg-amber-950/25 px-3 py-2 text-sm text-amber-100">
              Choose four semi-finalists on the previous step first.
            </p>
          ) : null}
          {currentStepDef.mode === "bracket" &&
          currentStepDef.bracketKind === "finalist" &&
          fullBracketPicksUnlocked &&
          currentKnockoutMatchRows?.some((r) => r.lockReason === "incomplete") ? (
            <p className="mt-4 rounded-md border border-amber-700/40 bg-amber-950/25 px-3 py-2 text-sm text-amber-100">
              {FINAL_MATCH_INCOMPLETE_MSG}
            </p>
          ) : currentStepDef.mode === "bracket" &&
            currentStepDef.bracketKind === "finalist" &&
            !fullBracketPicksUnlocked &&
            slots.filter((s) => s.predictionKind === "finalist" && s.teamId.trim())
              .length < 2 ? (
            <p className="mt-4 rounded-md border border-amber-700/40 bg-amber-950/25 px-3 py-2 text-sm text-amber-100">
              {FINAL_MATCH_INCOMPLETE_MSG}
            </p>
          ) : null}

          <ul className="mt-4 space-y-3">
            {activeKnockoutMatchRows
              ? activeKnockoutMatchRows.map((matchRow) => {
                  const matchTeams = allowedTeamsForKnockoutMatchRow(
                    matchRow,
                    teams,
                  );
                  const matchupPair: [Team, Team] | null =
                    matchTeams.length === 2
                      ? [matchTeams[0]!, matchTeams[1]!]
                      : null;
                  const effectiveTeamId = matchRow.winnerTeamId;
                  const team = effectiveTeamId
                    ? teamById.get(effectiveTeamId)
                    : undefined;
                  const strength = team
                    ? teamStrengthLabel(team.countryCode)
                    : null;
                  const isEmptyPick = !effectiveTeamId;
                  const isChampionPickRow =
                    matchRow.savePredictionKind === "champion";
                  const directPickEligible =
                    matchRow.lockReason === "pickable" && matchupPair != null;
                  const useDirectEmptyLayout = directPickEligible && isEmptyPick;
                  const championDirectPick =
                    isChampionPickRow && directPickEligible && isEmptyPick;
                  const rowPickDisabled =
                    coreDisabled ||
                    !fullBracketPicksUnlocked ||
                    matchRow.lockReason !== "pickable";
                  const heading = matchRow.display.heading;
                  const matchupLine =
                    matchRow.display.emptyPrimaryLine &&
                    matchRow.lockReason === "pickable"
                      ? matchRow.display.emptyPrimaryLine
                      : null;
                  const chooseButtonLabel =
                    matchRow.display.chooseButtonLabel ??
                    (isChampionPickRow ? "Pick champion" : "Pick winner");

                  return (
                    <li
                      key={matchRow.rowKey}
                      className={`rounded-lg border p-3 ${
                        directPickEligible && !isEmptyPick
                          ? "border-ash-accent/45 bg-ash-accent/[0.07]"
                          : isEmptyPick && matchRow.lockReason === "pickable"
                            ? "border-dashed border-amber-700/40 bg-amber-950/15"
                            : "border-ash-border bg-ash-body/40"
                      }`}
                    >
                      {useDirectEmptyLayout ? (
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-ash-muted">
                            {heading}
                          </p>
                          {championDirectPick && matchupLine ? (
                            <p className="mt-1 text-sm font-medium text-ash-text">
                              {matchupLine}
                            </p>
                          ) : null}
                          {championDirectPick ? (
                            <p className="mt-1 text-xs text-ash-muted">
                              Tap a finalist to set your champion pick.
                            </p>
                          ) : null}
                          <R32MatchDirectTeamPick
                            teams={matchupPair}
                            disabled={rowPickDisabled}
                            pickKind={isChampionPickRow ? "champion" : "winner"}
                            onPick={(teamId) => {
                              setKnockoutMatchWinner(matchRow, teamId);
                              setOpenRowKey(null);
                              setSearch("");
                            }}
                          />
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-ash-muted">
                              {heading}
                            </p>
                            {isChampionPickRow && matchupLine && isEmptyPick ? (
                              <p className="mt-1 text-sm font-medium text-ash-text">
                                {matchupLine}
                              </p>
                            ) : (
                              <div className="mt-1 flex items-center gap-2">
                                <CountryFlagIcon
                                  countryCode={team?.countryCode ?? ""}
                                  size="lg"
                                />
                                <div>
                                  <p
                                    className={`text-sm font-medium ${
                                      isEmptyPick
                                        ? "text-amber-100/90"
                                        : "text-ash-text"
                                    }`}
                                  >
                                    {team?.name ??
                                      (isChampionPickRow
                                        ? matchupLine
                                        : matchRow.display.emptyPrimaryLine) ??
                                      "Pick needed"}
                                  </p>
                                  {team && strength ? (
                                    <p
                                      className="text-xs text-ash-muted"
                                      title={
                                        [
                                          fifaRankSnapshotTitle(team),
                                          strengthLabelHint(strength),
                                        ]
                                          .filter(Boolean)
                                          .join(" ") || undefined
                                      }
                                    >
                                      {isChampionPickRow
                                        ? `Your champion pick · ${teamPickMetaLine(team, strength)}`
                                        : teamPickMetaLine(team, strength)}
                                    </p>
                                  ) : isChampionPickRow && team ? (
                                    <p className="text-xs text-ash-muted">
                                      Your champion pick
                                    </p>
                                  ) : null}
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="flex shrink-0 gap-2">
                            {team ? (
                              <button
                                type="button"
                                disabled={rowPickDisabled}
                                onClick={() => {
                                  setKnockoutMatchWinner(matchRow, "");
                                  setOpenRowKey(null);
                                  setSearch("");
                                }}
                                className="rounded-lg border border-ash-border bg-ash-body px-3 py-1.5 text-sm font-medium text-ash-muted transition-colors hover:bg-ash-surface disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Clear
                              </button>
                            ) : null}
                            {(isChampionPickRow ||
                              !directPickEligible ||
                              team ||
                              isEmptyPick) &&
                            matchRow.lockReason !== "started" ? (
                              <button
                                type="button"
                                disabled={rowPickDisabled}
                                onClick={() => {
                                  setOpenRowKey((k) =>
                                    k === matchRow.rowKey ? null : matchRow.rowKey,
                                  );
                                  setSearch("");
                                }}
                                className="rounded-lg border border-ash-border bg-ash-body px-3 py-1.5 text-sm font-medium text-ash-text transition-colors hover:bg-ash-surface disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {team ? "Change" : chooseButtonLabel}
                              </button>
                            ) : null}
                          </div>
                        </div>
                      )}

                      {matchRow.display.statusLine && isEmptyPick ? (
                        <p
                          className="mt-2 rounded-md border border-sky-800/40 bg-sky-950/20 px-3 py-2 text-xs text-sky-100"
                          role="status"
                        >
                          {matchRow.display.statusLine}
                        </p>
                      ) : null}
                      {matchRow.kickoffIso &&
                      isEmptyPick &&
                      matchRow.lockReason === "pickable" ? (
                        <p className="mt-2 text-xs text-ash-muted">
                          Locks:{" "}
                          <KickoffTimeDisplay
                            iso={matchRow.kickoffIso}
                            emptyLabel="Time TBD"
                          />
                        </p>
                      ) : null}
                      {openRowKey === matchRow.rowKey &&
                      (!useDirectEmptyLayout || !isEmptyPick) ? (
                        <div className="mt-3 border-t border-ash-border pt-3">
                          {matchupPair ? (
                            <R32MatchDirectTeamPick
                              teams={matchupPair}
                              selectedTeamId={effectiveTeamId || undefined}
                              disabled={rowPickDisabled}
                              pickKind={isChampionPickRow ? "champion" : "winner"}
                              onPick={(teamId) => {
                                setKnockoutMatchWinner(matchRow, teamId);
                                setOpenRowKey(null);
                                setSearch("");
                              }}
                            />
                          ) : (
                            <p className="text-sm text-amber-200">
                              {matchRow.display.statusLine ??
                                FINAL_MATCH_INCOMPLETE_MSG}
                            </p>
                          )}
                        </div>
                      ) : null}
                    </li>
                  );
                })
              : null}
            {!activeKnockoutMatchRows
              ? stepRows.map((row) => {
              const isR32WizardStep =
                currentStepDef?.mode === "bracket" &&
                currentStepDef.bracketKind === "round_of_32";
              const gradualMatchRow = isR32WizardStep
                ? gradualR32MatchRowsByKey?.get(row.rowKey)
                : undefined;
              const effectiveTeamId =
                gradualMatchRow?.winnerTeamId ?? row.teamId.trim();
              const team = effectiveTeamId
                ? teamById.get(effectiveTeamId)
                : undefined;
              const strength = team
                ? teamStrengthLabel(team.countryCode)
                : null;
              const isGroupRow =
                row.predictionKind === "group_winner" ||
                row.predictionKind === "group_runner_up";
              const isThirdPlaceRow =
                row.predictionKind === "third_place_qualifier";
              const isThirdPlaceStepUi =
                currentStepDef.mode === "bracket" &&
                currentStepDef.bracketKind === "third_place_qualifier";
              const groupEntries = isGroupRow
                ? buildGroupPickChooserOptions(
                    row,
                    slots,
                    teams,
                    groupTeamCountryCodesByLetter,
                  )
                : null;
              const thirdPlaceEntries = isThirdPlaceRow
                ? buildThirdPlacePickChooserOptionsForGroup(
                    row,
                    slots,
                    teams,
                    groupTeamCountryCodesByLetter,
                  )
                : null;
              const flatOptions =
                isGroupRow || isThirdPlaceRow
                  ? null
                  : allowedTeamsForPickRow(
                      row,
                      slots,
                      teams,
                      gradualTeamsForRow(row),
                    );
              const r32LockMessage =
                gradualMatchRow == null &&
                row.predictionKind === "round_of_32"
                  ? r32SlotLockMessage(
                      row.slotKey,
                      gradualKnockout,
                      knockoutBracketPicksUnlocked,
                    )
                  : null;
              const r32RowDisplay =
                gradualMatchRow?.display ??
                (row.predictionKind === "round_of_32"
                  ? r32SlotRowDisplay(
                      row.slotKey,
                      gradualKnockout,
                      teams,
                      knockoutBracketPicksUnlocked,
                      row.slotLabel,
                    )
                  : null);
              const r32LockReason =
                gradualMatchRow?.lockReason ??
                (row.predictionKind === "round_of_32"
                  ? r32SlotLockReason(
                      row.slotKey,
                      gradualKnockout,
                      knockoutBracketPicksUnlocked,
                    )
                  : null);
              const thirdInvalidReason = isThirdPlaceRow
                ? thirdPlaceSlotInvalidReason(row, slots, {
                    teamIdToGroupLetter: thirdPlaceTeamGroupById,
                  })
                : null;
              const thirdRowUnavailable = isThirdPlaceRow
                ? thirdPlaceRowUnavailableReason(row, slots)
                : null;
              const thirdRowChooseDisabled =
                Boolean(thirdRowUnavailable) && !row.teamId.trim();
              const q = search.trim().toLowerCase();
              const rankQuery = /^\d{1,3}$/.test(q) ? parseInt(q, 10) : null;
              const filteredChooserEntries =
                groupEntries == null
                  ? null
                  : q
                    ? groupEntries.filter(({ team: t }) =>
                        teamMatchesChooserSearch(t, q, rankQuery),
                      )
                    : groupEntries;
              const filteredThirdPlaceEntries =
                thirdPlaceEntries == null
                  ? null
                  : !q
                    ? thirdPlaceEntries
                    : thirdPlaceEntries.filter(({ team: t }) =>
                        teamMatchesChooserSearch(t, q, rankQuery),
                      );
              const filteredFlat =
                flatOptions == null
                  ? null
                  : q
                    ? flatOptions.filter((t) =>
                        teamMatchesChooserSearch(t, q, rankQuery),
                      )
                    : flatOptions;

              const heading =
                r32RowDisplay?.heading ??
                (row.predictionKind === "group_winner" ||
                row.predictionKind === "group_runner_up"
                  ? `${row.sectionLabel} — ${row.slotLabel}`
                  : row.predictionKind === "third_place_qualifier" && row.groupCode
                    ? `Group ${row.groupCode} — 3rd-place team`
                  : row.predictionKind === "bonus_pick"
                    ? row.slotLabel
                    : row.slotLabel);

              const isEmptyPick = !effectiveTeamId;
              const isGradualR32Row = isGradualR32WinnerPickRow(
                row,
                useLegacyR32SlotUi,
              );
              const r32MatchTeams: [Team, Team] | null =
                isGradualR32Row && flatOptions?.length === 2
                  ? [flatOptions[0]!, flatOptions[1]!]
                  : null;
              const r32DirectPickEligible =
                r32MatchTeams != null && r32LockReason === "pickable";
              const r32RowPickDisabled = pickRowDisabled(row);

              return (
                <li
                  key={row.rowKey}
                  className={`rounded-lg border p-3 ${
                    isThirdPlaceStepUi && isThirdPlaceRow
                      ? row.teamId.trim()
                        ? "border-ash-accent/45 bg-ash-accent/[0.07]"
                        : "border-dashed border-amber-700/35 bg-amber-950/10"
                      : r32DirectPickEligible && !isEmptyPick
                        ? "border-ash-accent/45 bg-ash-accent/[0.07]"
                        : isEmptyPick && !thirdRowChooseDisabled
                          ? "border-dashed border-amber-700/40 bg-amber-950/15"
                          : "border-ash-border bg-ash-body/40"
                  }`}
                >
                  {r32DirectPickEligible && isEmptyPick ? (
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-ash-muted">
                        {heading}
                      </p>
                      <R32MatchDirectTeamPick
                        teams={r32MatchTeams}
                        disabled={r32RowPickDisabled}
                        onPick={(teamId) => {
                          setTeamForRow(row.rowKey, teamId);
                          setOpenRowKey(null);
                          setSearch("");
                        }}
                      />
                    </div>
                  ) : (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-ash-muted">
                        {heading}
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        <CountryFlagIcon
                          countryCode={team?.countryCode ?? ""}
                          size="lg"
                        />
                        <div>
                          <p
                            className={`text-sm font-medium ${
                              isEmptyPick ? "text-amber-100/90" : "text-ash-text"
                            }`}
                          >
                            {team?.name ??
                              r32RowDisplay?.emptyPrimaryLine ??
                              r32LockMessage ??
                              "Pick needed"}
                          </p>
                          {team && strength ? (
                            <p
                              className="text-xs text-ash-muted"
                              title={
                                [
                                  fifaRankSnapshotTitle(team),
                                  strengthLabelHint(strength),
                                ]
                                  .filter(Boolean)
                                  .join(" ") || undefined
                              }
                            >
                              {teamPickMetaLine(team, strength)}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {team ? (
                        <button
                          type="button"
                          disabled={r32RowPickDisabled}
                          onClick={() => {
                            setTeamForRow(row.rowKey, "");
                            setOpenRowKey(null);
                            setSearch("");
                          }}
                          className="rounded-lg border border-ash-border bg-ash-body px-3 py-1.5 text-sm font-medium text-ash-muted transition-colors hover:bg-ash-surface disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Clear
                        </button>
                      ) : null}
                      {!r32DirectPickEligible || team ? (
                        <button
                          type="button"
                          disabled={r32RowPickDisabled || thirdRowChooseDisabled}
                          onClick={() => {
                            if (thirdRowChooseDisabled) return;
                            setOpenRowKey((k) =>
                              k === row.rowKey ? null : row.rowKey,
                            );
                            setSearch("");
                          }}
                          className="rounded-lg border border-ash-border bg-ash-body px-3 py-1.5 text-sm font-medium text-ash-text transition-colors hover:bg-ash-surface disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {team
                            ? "Change"
                            : thirdRowChooseDisabled
                              ? THIRD_PLACE_DISABLED_MAX_SELECTED
                              : (r32RowDisplay?.chooseButtonLabel ?? "Choose team")}
                        </button>
                      ) : null}
                    </div>
                  </div>
                  )}

                  {r32LockMessage && !r32RowDisplay ? (
                    <p
                      className="mt-2 rounded-md border border-sky-800/40 bg-sky-950/20 px-3 py-2 text-xs text-sky-100"
                      role="status"
                    >
                      {r32LockMessage}
                    </p>
                  ) : null}
                  {r32RowDisplay?.statusLine && isEmptyPick ? (
                    <p
                      className="mt-2 rounded-md border border-sky-800/40 bg-sky-950/20 px-3 py-2 text-xs text-sky-100"
                      role="status"
                    >
                      {r32RowDisplay.statusLine}
                    </p>
                  ) : null}
                  {r32RowDisplay?.kickoffIso &&
                  isEmptyPick &&
                  r32LockReason === "pickable" ? (
                    <p className="mt-2 text-xs text-ash-muted">
                      Locks:{" "}
                      <KickoffTimeDisplay
                        iso={r32RowDisplay.kickoffIso}
                        emptyLabel="Time TBD"
                      />
                    </p>
                  ) : null}
                  {r32DirectPickEligible &&
                  !isEmptyPick &&
                  openRowKey === row.rowKey ? (
                    <R32MatchDirectTeamPick
                      teams={r32MatchTeams}
                      selectedTeamId={effectiveTeamId}
                      disabled={r32RowPickDisabled}
                      onPick={(teamId) => {
                        setTeamForRow(row.rowKey, teamId);
                        setOpenRowKey(null);
                        setSearch("");
                      }}
                    />
                  ) : null}
                  {thirdInvalidReason ? (
                    <p
                      className="mt-2 rounded-md border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-xs text-amber-100"
                      role="alert"
                    >
                      This pick no longer fits your group-stage choices:{" "}
                      {thirdInvalidReason}. Choose another team or adjust the
                      group finish for that nation.
                    </p>
                  ) : null}
                  {thirdRowUnavailable ? (
                    <p
                      className="mt-2 rounded-md border border-sky-800/40 bg-sky-950/20 px-3 py-2 text-xs text-sky-100"
                      role="status"
                    >
                      <span className="font-medium">{THIRD_PLACE_DISABLED_MAX_SELECTED}.</span>{" "}
                      {thirdRowUnavailable}
                    </p>
                  ) : null}

                  {openRowKey === row.rowKey && !r32DirectPickEligible ? (
                    <div className="mt-3 border-t border-ash-border pt-3">
                      {thirdRowChooseDisabled ? (
                        <p className="rounded-md border border-sky-800/40 bg-sky-950/20 px-3 py-2 text-sm text-sky-100">
                          {thirdRowUnavailable}
                        </p>
                      ) : (
                        <>
                      <label className="block text-xs font-medium text-ash-muted">
                        {isGroupRow && row.groupCode
                          ? `Search teams in Group ${row.groupCode}`
                          : isThirdPlaceRow
                            ? row.groupCode
                              ? `Search eligible teams in Group ${row.groupCode}`
                              : "Search teams"
                          : "Search teams"}
                        <input
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          disabled={pickRowDisabled(row)}
                          className="mt-1 w-full rounded-md border border-ash-border bg-ash-body px-2 py-1.5 text-sm text-ash-text outline-none ring-ash-accent/20 focus:border-ash-accent focus:ring-2"
                          placeholder={
                            isGroupRow && row.groupCode
                              ? `Country name, code, or FIFA rank — Group ${row.groupCode} only`
                              : isThirdPlaceRow
                                ? row.groupCode
                                  ? `Country name, code, or FIFA rank — Group ${row.groupCode} only`
                                  : "Country name, code, or rank"
                                : "Type a country name or code"
                          }
                          autoComplete="off"
                        />
                      </label>
                      {groupEntries != null ? (
                        groupEntries.length === 0 ? (
                          <p className="mt-2 text-sm text-amber-200">
                            {emptyOptionsHint(row)}
                          </p>
                        ) : filteredChooserEntries != null &&
                          filteredChooserEntries.length === 0 ? (
                          <p className="mt-2 text-sm text-ash-muted">
                            No teams in this group match your search.
                          </p>
                        ) : (
                          <ul className="mt-2 max-h-52 overflow-y-auto rounded-md border border-ash-border bg-ash-body p-1 sm:grid sm:max-h-64 sm:grid-cols-2 sm:gap-1">
                            {filteredChooserEntries!.map(
                              ({ team: t, disabled: optDisabled, disabledReason }) => {
                                const st = teamStrengthLabel(t.countryCode);
                                const meta = teamPickMetaLine(t, st);
                                const blocked = Boolean(optDisabled);
                                return (
                                  <li key={t.id}>
                                    <button
                                      type="button"
                                      disabled={pickRowDisabled(row) || blocked}
                                      title={blocked ? disabledReason : undefined}
                                      onClick={() => {
                                        if (blocked) return;
                                        setTeamForRow(row.rowKey, t.id);
                                        setOpenRowKey(null);
                                        setSearch("");
                                      }}
                                      className={`flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50 ${
                                        blocked
                                          ? "opacity-50"
                                          : "hover:bg-ash-accent/15"
                                      }`}
                                    >
                                      <CountryFlagIcon
                                        countryCode={t.countryCode}
                                        size="md"
                                        className="self-center"
                                      />
                                      <span className="min-w-0 flex-1">
                                        <span
                                          className={`block font-medium ${
                                            blocked
                                              ? "text-ash-muted"
                                              : "text-ash-text"
                                          }`}
                                        >
                                          {t.name}
                                        </span>
                                        <span
                                          className="block text-[11px] text-ash-muted"
                                          title={
                                            [
                                              fifaRankSnapshotTitle(t),
                                              `${t.countryCode} · ${strengthLabelHint(st)}`,
                                            ]
                                              .filter(Boolean)
                                              .join(" — ")
                                          }
                                        >
                                          {t.countryCode} · {meta}
                                        </span>
                                        {blocked && disabledReason ? (
                                          <span className="mt-0.5 block text-[11px] text-amber-200/90">
                                            {disabledReason}
                                          </span>
                                        ) : null}
                                      </span>
                                    </button>
                                  </li>
                                );
                              },
                            )}
                          </ul>
                        )
                      ) : thirdPlaceEntries != null ? (
                        thirdPlaceEntries.length === 0 ? (
                          <p className="mt-2 text-sm text-amber-200">
                            {emptyOptionsHint(row)}
                          </p>
                        ) : filteredThirdPlaceEntries != null &&
                          filteredThirdPlaceEntries.length === 0 ? (
                          <p className="mt-2 text-sm text-ash-muted">
                            No teams match your search.
                          </p>
                        ) : (
                          <ul className="mt-2 max-h-52 overflow-y-auto rounded-md border border-ash-border bg-ash-body p-1 sm:grid sm:max-h-64 sm:grid-cols-2 sm:gap-1">
                            {filteredThirdPlaceEntries!.map(
                              ({ team: t, disabled: optDisabled, disabledReason }) => {
                                const st = teamStrengthLabel(t.countryCode);
                                const meta = teamPickMetaLine(t, st);
                                const blocked = Boolean(optDisabled);
                                const isRowSelection = row.teamId.trim() === t.id;
                                return (
                                  <li key={t.id}>
                                    <button
                                      type="button"
                                      disabled={pickRowDisabled(row) || blocked}
                                      title={blocked ? disabledReason : undefined}
                                      onClick={() => {
                                        if (blocked) return;
                                        setTeamForRow(row.rowKey, t.id);
                                        setOpenRowKey(null);
                                        setSearch("");
                                      }}
                                      className={`flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                                        blocked ? "opacity-50" : "hover:bg-ash-accent/15"
                                      } ${
                                        !blocked && isRowSelection
                                          ? "bg-ash-accent/15 ring-1 ring-inset ring-ash-accent/50"
                                          : ""
                                      }`}
                                    >
                                      <CountryFlagIcon
                                        countryCode={t.countryCode}
                                        size="md"
                                        className="self-center"
                                      />
                                      <span className="min-w-0 flex-1">
                                        <span
                                          className={`block font-medium ${
                                            blocked ? "text-ash-muted" : "text-ash-text"
                                          }`}
                                        >
                                          {t.name}
                                        </span>
                                        <span
                                          className="block text-[11px] text-ash-muted"
                                          title={
                                            [
                                              fifaRankSnapshotTitle(t),
                                              `${t.countryCode} · ${strengthLabelHint(st)}`,
                                            ]
                                              .filter(Boolean)
                                              .join(" — ")
                                          }
                                        >
                                          {t.countryCode} · {meta}
                                        </span>
                                        {blocked && disabledReason ? (
                                          <span className="mt-0.5 block text-[11px] text-amber-200/90">
                                            {disabledReason}
                                          </span>
                                        ) : null}
                                      </span>
                                    </button>
                                  </li>
                                );
                              },
                            )}
                          </ul>
                        )
                      ) : flatOptions != null ? (
                        flatOptions.length === 0 ? (
                          <p className="mt-2 text-sm text-amber-200">
                            {emptyOptionsHint(row)}
                          </p>
                        ) : filteredFlat != null &&
                          filteredFlat.length === 0 ? (
                          <p className="mt-2 text-sm text-ash-muted">
                            No teams match your search.
                          </p>
                        ) : (
                          <ul className="mt-2 max-h-52 overflow-y-auto rounded-md border border-ash-border bg-ash-body p-1 sm:grid sm:max-h-64 sm:grid-cols-2 sm:gap-1">
                            {filteredFlat!.map((t) => {
                              const st = teamStrengthLabel(t.countryCode);
                              const meta = teamPickMetaLine(t, st);
                              return (
                                <li key={t.id}>
                                  <button
                                    type="button"
                                    disabled={pickRowDisabled(row)}
                                    onClick={() => {
                                      setTeamForRow(row.rowKey, t.id);
                                      setOpenRowKey(null);
                                      setSearch("");
                                    }}
                                    className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-ash-accent/15 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    <CountryFlagIcon
                                      countryCode={t.countryCode}
                                      size="md"
                                      className="self-center"
                                    />
                                    <span className="min-w-0 flex-1">
                                      <span className="block font-medium text-ash-text">
                                        {t.name}
                                      </span>
                                      <span
                                        className="block text-[11px] text-ash-muted"
                                        title={
                                          [
                                            fifaRankSnapshotTitle(t),
                                            `${t.countryCode} · ${strengthLabelHint(st)}`,
                                          ]
                                            .filter(Boolean)
                                            .join(" — ")
                                        }
                                      >
                                        {t.countryCode} · {meta}
                                      </span>
                                    </span>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )
                      ) : null}
                        </>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })
              : null}
          </ul>

          <div className="mt-4 flex flex-wrap gap-2 border-t border-ash-border pt-4">
            <button
              type="button"
              disabled={coreDisabled || step <= 0}
              onClick={goPrev}
              className="btn-ghost disabled:cursor-not-allowed disabled:opacity-40"
            >
              Back
            </button>
            {step < wizardSteps.length - 1 ? (
              <button
                type="button"
                disabled={coreDisabled || !canGoNext}
                onClick={goNext}
                className="rounded-lg bg-ash-text px-3 py-2 text-sm font-medium text-ash-body shadow-sm transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next step
              </button>
            ) : null}
          </div>
        </section>
      ) : null}
        </>
      ) : null}

      {!readOnly ? (
        <div>
          <button
            type="submit"
            disabled={coreDisabled || picksSaveButtonDisabled(saveUiState)}
            className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {picksSaveButtonLabel(saveUiState)}
          </button>
          <p
            className={`mt-2 text-xs ${
              saveUiState.kind === "error"
                ? "text-red-200"
                : saveUiState.kind === "dirty"
                  ? "text-amber-100"
                  : "text-ash-muted"
            }`}
            role="status"
          >
            {picksSaveStatusLine(saveUiState)}
          </p>
          <p className="mt-1 text-xs text-ash-muted">{effectiveSaveHelpText}</p>
        </div>
      ) : null}
    </form>
  );
}
