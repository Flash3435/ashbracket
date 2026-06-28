import type { Team } from "../../src/types/domain";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import {
  buildAllParticipantPickDrafts,
} from "../predictions/buildParticipantPickDrafts";
import { thirdPlaceSlotInvalidReason } from "../predictions/knockoutPickConsistency";
import { labelParticipantBonusPick } from "../predictions/participantBonusLabels";
import { isKnockoutProgressionKind } from "../predictions/knockoutProgressionKinds";
import type { Prediction, TournamentStage } from "../../src/types/domain";
import {
  buildKnockoutMatchProgress,
  type KnockoutProgressContext,
} from "./knockoutMatchProgress";

/** Eight distinct third-place advancers — not all twelve group rows must be filled. */
export const THIRD_PLACE_ADVANCERS_REQUIRED = 8;

export type PickCompletionSectionId =
  | "group"
  | "third_place"
  | "bonus"
  | "knockout";

export type PickCompletionSectionStatus = {
  id: PickCompletionSectionId;
  label: string;
  /** False when knockout picks are not required yet (Round of 32 unpublished). */
  required: boolean;
  filled: number;
  total: number;
  complete: boolean;
  /** Human labels for empty required slots in this section. */
  missingLabels: string[];
};

export type PoolMembershipCompletionStatus = {
  isComplete: boolean;
  requiredSections: PickCompletionSectionId[];
  completedSections: PickCompletionSectionId[];
  missingSections: PickCompletionSectionId[];
  missingPickKeys: string[];
  displaySummary: string;
  sections: PickCompletionSectionStatus[];
  knockoutBracketPicksUnlocked: boolean;
};

function isGroupKind(kind: string): boolean {
  return kind === "group_winner" || kind === "group_runner_up";
}

function sectionForSlot(slot: KnockoutPickSlotDraft): PickCompletionSectionId {
  if (isGroupKind(slot.predictionKind)) return "group";
  if (slot.predictionKind === "third_place_qualifier") return "third_place";
  if (slot.predictionKind === "bonus_pick") return "bonus";
  return "knockout";
}

function sectionLabel(id: PickCompletionSectionId): string {
  switch (id) {
    case "group":
      return "Group picks";
    case "third_place":
      return "Third-place picks";
    case "bonus":
      return "Bonus picks";
    case "knockout":
      return "Knockout picks";
  }
}

function missingLabelForSlot(slot: KnockoutPickSlotDraft): string {
  if (slot.predictionKind === "bonus_pick" && slot.bonusKey) {
    return labelParticipantBonusPick(slot.bonusKey);
  }
  if (isGroupKind(slot.predictionKind)) {
    return `${slot.sectionLabel} ${slot.slotLabel}`;
  }
  return slot.slotLabel;
}

function filledOfTotal(rows: KnockoutPickSlotDraft[]): {
  filled: number;
  total: number;
} {
  const total = rows.length;
  const filled = rows.filter((s) => s.teamId.trim() !== "").length;
  return { filled, total };
}

function isThirdPlaceSectionComplete(
  thirdRows: KnockoutPickSlotDraft[],
  allSlots: KnockoutPickSlotDraft[],
): boolean {
  const filled = thirdRows.filter((s) => s.teamId.trim()).length;
  if (filled !== THIRD_PLACE_ADVANCERS_REQUIRED) return false;
  return thirdRows.every((row) => {
    if (!row.teamId.trim()) return true;
    return thirdPlaceSlotInvalidReason(row, allSlots) == null;
  });
}

function sectionComplete(
  id: PickCompletionSectionId,
  rows: KnockoutPickSlotDraft[],
  allSlots: KnockoutPickSlotDraft[],
  knockoutBracketPicksUnlocked: boolean,
  knockoutProgress?: ReturnType<typeof buildKnockoutMatchProgress> | null,
): boolean {
  const { filled, total } = filledOfTotal(rows);
  if (id === "knockout") {
    if (!knockoutBracketPicksUnlocked || total === 0) {
      if (knockoutProgress?.useMatchBased) {
        return knockoutProgress.complete;
      }
      return true;
    }
    if (knockoutProgress?.useMatchBased) {
      return knockoutProgress.complete;
    }
    return filled === total;
  }
  if (id === "third_place") {
    if (total === 0) return false;
    return isThirdPlaceSectionComplete(rows, allSlots);
  }
  if (total === 0) return false;
  return filled === total;
}

/**
 * Canonical pre-lock / full-bracket completion for one participant membership.
 * Knockout progression rows are ignored until the official Round of 32 is published.
 */
export function buildPoolMembershipCompletionStatus(
  slots: KnockoutPickSlotDraft[],
  options?: {
    knockoutBracketPicksUnlocked?: boolean;
    teams?: Team[];
    tournamentMatches?: TournamentMatchPublicRow[] | null;
    officialRoundOf32Complete?: boolean;
  },
): PoolMembershipCompletionStatus {
  const knockoutBracketPicksUnlocked =
    options?.knockoutBracketPicksUnlocked !== false;
  const officialRoundOf32Complete =
    options?.officialRoundOf32Complete ?? knockoutBracketPicksUnlocked;
  const knockoutContext: KnockoutProgressContext | null =
    options?.teams && options.teams.length > 0
      ? {
          slots,
          teams: options.teams,
          tournamentMatches: options.tournamentMatches,
          officialRoundOf32Complete,
        }
      : null;
  const knockoutProgress = knockoutContext
    ? buildKnockoutMatchProgress(knockoutContext)
    : null;

  const bySection = new Map<PickCompletionSectionId, KnockoutPickSlotDraft[]>([
    ["group", []],
    ["third_place", []],
    ["bonus", []],
    ["knockout", []],
  ]);

  for (const slot of slots) {
    bySection.get(sectionForSlot(slot))!.push(slot);
  }

  const sections: PickCompletionSectionStatus[] = (
    ["group", "third_place", "bonus", "knockout"] as const
  ).map((id) => {
    const rows = bySection.get(id) ?? [];
    const { filled, total } = filledOfTotal(rows);
    const empty = rows.filter((s) => !s.teamId.trim());
    const required =
      id === "knockout"
        ? knockoutBracketPicksUnlocked &&
          (knockoutProgress?.useMatchBased
            ? knockoutProgress.total > 0
            : total > 0)
        : total > 0;
    const complete = sectionComplete(
      id,
      rows,
      slots,
      knockoutBracketPicksUnlocked,
      knockoutProgress,
    );
    const displayTotal =
      id === "third_place"
        ? THIRD_PLACE_ADVANCERS_REQUIRED
        : id === "knockout" && knockoutProgress?.useMatchBased
          ? knockoutProgress.total
          : total;
    const displayFilled =
      id === "third_place"
        ? Math.min(filled, THIRD_PLACE_ADVANCERS_REQUIRED)
        : id === "knockout" && knockoutProgress?.useMatchBased
          ? knockoutProgress.filled
          : filled;
    let missingLabels: string[] = [];
    if (required && !complete) {
      if (id === "third_place") {
        const need = Math.max(0, THIRD_PLACE_ADVANCERS_REQUIRED - filled);
        if (need > 0) {
          missingLabels = [`${need} more third-place advancer${need === 1 ? "" : "s"}`];
        } else {
          missingLabels = rows
            .filter(
              (row) =>
                row.teamId.trim() &&
                thirdPlaceSlotInvalidReason(row, slots) != null,
            )
            .map((s) => missingLabelForSlot(s));
        }
      } else {
        missingLabels = empty.map((s) => missingLabelForSlot(s));
      }
    }
    return {
      id,
      label: sectionLabel(id),
      required,
      filled: displayFilled,
      total: displayTotal,
      complete,
      missingLabels,
    };
  });

  const requiredSections = sections
    .filter((s) => s.required)
    .map((s) => s.id);
  const completedSections = sections
    .filter((s) => s.required && s.complete)
    .map((s) => s.id);
  const missingSections = sections
    .filter((s) => s.required && !s.complete)
    .map((s) => s.id);

  const missingPickKeys = slots
    .filter((s) => {
      const sec = sectionForSlot(s);
      if (sec === "knockout") {
        if (!knockoutBracketPicksUnlocked) return false;
        if (knockoutProgress?.useMatchBased) {
          if (s.predictionKind === "round_of_32") return false;
          return !s.teamId.trim();
        }
      }
      if (sec === "third_place") {
        const thirdRows = bySection.get("third_place") ?? [];
        const filled = thirdRows.filter((r) => r.teamId.trim()).length;
        if (filled >= THIRD_PLACE_ADVANCERS_REQUIRED) {
          return (
            s.teamId.trim() !== "" &&
            thirdPlaceSlotInvalidReason(s, slots) != null
          );
        }
        return !s.teamId.trim();
      }
      return !s.teamId.trim();
    })
    .map((s) => s.rowKey);

  const isComplete = missingSections.length === 0 && slots.length > 0;

  const displaySummary = buildCompletionDisplaySummary(
    sections,
    knockoutBracketPicksUnlocked,
    isComplete,
  );

  return {
    isComplete,
    requiredSections,
    completedSections,
    missingSections,
    missingPickKeys,
    displaySummary,
    sections,
    knockoutBracketPicksUnlocked,
  };
}

export function buildCompletionDisplaySummary(
  sections: PickCompletionSectionStatus[],
  knockoutBracketPicksUnlocked: boolean,
  isComplete: boolean,
): string {
  if (isComplete) {
    return knockoutBracketPicksUnlocked
      ? "All required picks complete (group, third-place, bonus, and knockout)."
      : "Pre-lock picks complete (group, third-place, and bonus). Knockout picks are not required until Round of 32 is published.";
  }

  const missingParts: string[] = [];
  for (const s of sections) {
    if (!s.required || s.complete) continue;
    if (s.missingLabels.length > 0) {
      const preview =
        s.missingLabels.length <= 3
          ? s.missingLabels.join(", ")
          : `${s.missingLabels.slice(0, 2).join(", ")} (+${s.missingLabels.length - 2} more)`;
      missingParts.push(`${s.label.toLowerCase()} (${preview})`);
    } else {
      missingParts.push(
        `${s.label.toLowerCase()} (${s.filled}/${s.total})`,
      );
    }
  }

  const prefix = missingParts.length
    ? `Missing: ${missingParts.join("; ")}.`
    : "Some required picks are still empty.";

  if (!knockoutBracketPicksUnlocked) {
    return `${prefix} Knockout picks are not required until Round of 32 is published.`;
  }
  return prefix;
}

/** Admin Overview: per-section counts for one incomplete participant. */
export type AdminIncompleteParticipantBreakdown = {
  missingSummary: string;
  groupPicks: string;
  thirdPlacePicks: string;
  bonusPicks: string;
  knockoutStatus: string;
};

export function buildAdminIncompleteParticipantBreakdown(
  status: PoolMembershipCompletionStatus,
): AdminIncompleteParticipantBreakdown {
  const find = (id: PickCompletionSectionId) =>
    status.sections.find((s) => s.id === id);

  const group = find("group");
  const third = find("third_place");
  const bonus = find("bonus");
  const knockout = find("knockout");

  return {
    missingSummary: status.displaySummary,
    groupPicks: group ? `${group.filled}/${group.total}` : "—",
    thirdPlacePicks: third ? `${third.filled}/${third.total}` : "—",
    bonusPicks: bonus ? `${bonus.filled}/${bonus.total}` : "—",
    knockoutStatus: !status.knockoutBracketPicksUnlocked
      ? "Not required yet (Round of 32 not published)"
      : knockout
        ? `${knockout.filled}/${knockout.total}`
        : "—",
  };
}

/** Participant-facing copy after save when required picks remain empty. */
export function formatIncompleteSavedBanner(
  status: PoolMembershipCompletionStatus,
): string {
  const labels = status.missingSections.map((id) => {
    switch (id) {
      case "group":
        return "group picks";
      case "third_place":
        return "third-place picks";
      case "bonus":
        return "bonus picks";
      case "knockout":
        return "knockout picks";
    }
  });
  if (labels.length === 0) {
    return "Picks saved. Some required picks are still empty.";
  }
  if (labels.length === 1) {
    return `Picks saved. Still missing: ${labels[0]}.`;
  }
  const last = labels[labels.length - 1];
  const rest = labels.slice(0, -1).join(", ");
  return `Picks saved. Still missing: ${rest} and ${last}.`;
}

/** Compact one-line progress for participant summary headers. */
export function formatCompletionProgressLine(
  status: PoolMembershipCompletionStatus,
): string {
  return status.sections
    .map((s) => {
      if (s.id === "knockout" && !status.knockoutBracketPicksUnlocked) {
        return "Knockout picks: not required yet";
      }
      return `${s.label}: ${s.filled}/${s.total}`;
    })
    .join(" · ");
}

export type BuildCompletionFromPredictionsInput = {
  stageByCode: Partial<Record<TournamentStage["code"], TournamentStage>>;
  predictions: Prediction[];
  participantId: string;
  bonusKeys: readonly string[];
  knockoutBracketPicksUnlocked?: boolean;
  teams?: import("../../src/types/domain").Team[];
  groupTeamCountryCodesByLetter?: Record<string, string[]>;
};

export function buildPoolMembershipCompletionStatusFromPredictions(
  input: BuildCompletionFromPredictionsInput,
): PoolMembershipCompletionStatus {
  const slots = buildAllParticipantPickDrafts({
    stageByCode: input.stageByCode,
    predictions: input.predictions,
    participantId: input.participantId,
    bonusKeys: input.bonusKeys,
    teams: input.teams,
    groupTeamCountryCodesByLetter: input.groupTeamCountryCodesByLetter,
  });
  return buildPoolMembershipCompletionStatus(slots, {
    knockoutBracketPicksUnlocked: input.knockoutBracketPicksUnlocked,
  });
}

/** @deprecated Alias kept for callers migrating to the canonical name. */
export const getPreLockPickCompletionStatus = buildPoolMembershipCompletionStatus;
