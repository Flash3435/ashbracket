import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import {
  participantPicksCompleteFromDrafts,
} from "../predictions/participantPicksCompletenessRules";
import { isKnockoutProgressionKind } from "../predictions/knockoutProgressionKinds";
import { thirdPlaceSlotInvalidReason } from "../predictions/knockoutPickConsistency";

export type PickSectionStatus = "complete" | "partial" | "not_started" | "locked";

export type PickSectionId = "group" | "third_place" | "bonus" | "knockout";

export type PickSectionProgress = {
  id: PickSectionId;
  label: string;
  shortLabel: string;
  status: PickSectionStatus;
  filled: number;
  total: number;
  missing: number;
  detailLine: string;
};

export type NextPickSection = {
  sectionId: PickSectionId;
  label: string;
  ctaLabel: string;
  /** Matches KnockoutPicksWizard bracket step kinds when applicable. */
  wizardBracketKind?: string;
  wizardMode?: "group" | "bonus" | "bracket";
};

export type PicksProgressSummary = {
  sections: PickSectionProgress[];
  picksComplete: boolean;
  actionableMissingCount: number;
  overallHeadline: string;
  overallDetail: string | null;
  nextSection: NextPickSection | null;
  waitingForR32: boolean;
};

const KNOCKOUT_ROUND_ORDER = [
  "round_of_32",
  "round_of_16",
  "quarterfinalist",
  "semifinalist",
  "finalist",
  "champion",
] as const;

function groupRows(slots: KnockoutPickSlotDraft[]): KnockoutPickSlotDraft[] {
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

function knockoutProgressionRows(
  slots: KnockoutPickSlotDraft[],
): KnockoutPickSlotDraft[] {
  return slots.filter((s) => isKnockoutProgressionKind(s.predictionKind));
}

function isThirdPlaceSectionComplete(slots: KnockoutPickSlotDraft[]): boolean {
  const third = slots.filter((s) => s.predictionKind === "third_place_qualifier");
  const filled = third.filter((s) => s.teamId.trim()).length;
  return (
    filled === 8 &&
    third.every((row) => thirdPlaceSlotInvalidReason(row, slots) == null)
  );
}

function sectionStatusFromCounts(
  filled: number,
  total: number,
  complete: boolean,
): PickSectionStatus {
  if (total === 0 && complete) return "complete";
  if (complete) return "complete";
  if (filled === 0) return "not_started";
  return "partial";
}

function actionableMissingCount(
  slots: KnockoutPickSlotDraft[],
  knockoutBracketPicksUnlocked: boolean,
): number {
  const group = groupRows(slots);
  const third = slots.filter((s) => s.predictionKind === "third_place_qualifier");
  const bonus = slots.filter((s) => s.predictionKind === "bonus_pick");
  const knockout = knockoutProgressionRows(slots);

  let missing = 0;
  missing += group.filter((s) => !s.teamId.trim()).length;
  missing += Math.max(
    0,
    8 - third.filter((s) => s.teamId.trim()).length,
  );
  missing += bonus.filter((s) => !s.teamId.trim()).length;
  if (knockoutBracketPicksUnlocked) {
    missing += knockout.filter((s) => !s.teamId.trim()).length;
  }
  return missing;
}

function firstIncompleteKnockoutRound(
  slots: KnockoutPickSlotDraft[],
): (typeof KNOCKOUT_ROUND_ORDER)[number] | null {
  for (const kind of KNOCKOUT_ROUND_ORDER) {
    const rows = slots.filter((s) => s.predictionKind === kind);
    if (rows.length === 0) continue;
    if (rows.some((s) => !s.teamId.trim())) return kind;
  }
  return null;
}

const KNOCKOUT_ROUND_LABELS: Record<
  (typeof KNOCKOUT_ROUND_ORDER)[number],
  string
> = {
  round_of_32: "Round of 32",
  round_of_16: "Round of 16",
  quarterfinalist: "Quarter-finals",
  semifinalist: "Semi-finals",
  finalist: "The final",
  champion: "Champion",
};

function findNextSection(
  slots: KnockoutPickSlotDraft[],
  sections: PickSectionProgress[],
  knockoutBracketPicksUnlocked: boolean,
): NextPickSection | null {
  const group = sections.find((s) => s.id === "group");
  if (group && group.status !== "complete" && group.status !== "locked") {
    return {
      sectionId: "group",
      label: group.label,
      ctaLabel: "Continue with group stage",
      wizardMode: "group",
    };
  }

  const third = sections.find((s) => s.id === "third_place");
  if (third && third.status !== "complete" && third.status !== "locked") {
    return {
      sectionId: "third_place",
      label: third.label,
      ctaLabel: "Continue with third-place picks",
      wizardMode: "bracket",
      wizardBracketKind: "third_place_qualifier",
    };
  }

  if (knockoutBracketPicksUnlocked) {
    const round = firstIncompleteKnockoutRound(slots);
    if (round) {
      const label = KNOCKOUT_ROUND_LABELS[round];
      return {
        sectionId: "knockout",
        label,
        ctaLabel: `Continue with ${label.toLowerCase()}`,
        wizardMode: "bracket",
        wizardBracketKind: round,
      };
    }
  }

  const bonus = sections.find((s) => s.id === "bonus");
  if (bonus && bonus.status !== "complete" && bonus.status !== "locked") {
    return {
      sectionId: "bonus",
      label: bonus.label,
      ctaLabel: "Continue with bonus picks",
      wizardMode: "bonus",
    };
  }

  return null;
}

function buildOverallCopy(args: {
  picksComplete: boolean;
  actionableMissingCount: number;
  waitingForR32: boolean;
  knockoutBracketPicksUnlocked: boolean;
  sections: PickSectionProgress[];
}): { headline: string; detail: string | null } {
  const {
    picksComplete,
    actionableMissingCount: missing,
    waitingForR32,
    knockoutBracketPicksUnlocked,
    sections,
  } = args;

  if (waitingForR32) {
    return {
      headline: "Waiting for official Round of 32",
      detail:
        "Your group, third-place, and bonus picks are complete. Knockout picks unlock after the official bracket is published — nothing else to do right now.",
    };
  }

  if (picksComplete) {
    return {
      headline: "All required picks complete",
      detail: knockoutBracketPicksUnlocked
        ? "You can still edit until the pool locks."
        : "Knockout bracket picks open when organizers publish the official Round of 32.",
    };
  }

  const anyStarted = sections.some(
    (s) => s.status === "partial" || s.status === "complete",
  );

  if (!anyStarted) {
    return {
      headline: "Get started with group stage",
      detail: `${missing} pick${missing === 1 ? "" : "s"} to go before you're complete.`,
    };
  }

  if (missing <= 3) {
    return {
      headline: `Almost there — ${missing} pick${missing === 1 ? "" : "s"} left`,
      detail: null,
    };
  }

  return {
    headline: `${missing} picks left`,
    detail: null,
  };
}

/**
 * Participant-facing progress summary for World Cup picks. Reuses completeness rules
 * from picksCompleteness without changing them.
 */
export function buildPicksProgressSummary(
  slots: KnockoutPickSlotDraft[],
  options?: { knockoutBracketPicksUnlocked?: boolean },
): PicksProgressSummary {
  const knockoutBracketPicksUnlocked =
    options?.knockoutBracketPicksUnlocked !== false;

  const group = groupRows(slots);
  const third = slots.filter((s) => s.predictionKind === "third_place_qualifier");
  const bonus = slots.filter((s) => s.predictionKind === "bonus_pick");
  const knockout = knockoutProgressionRows(slots);

  const groupFilled = group.filter((s) => s.teamId.trim()).length;
  const thirdFilled = third.filter((s) => s.teamId.trim()).length;
  const bonusFilled = bonus.filter((s) => s.teamId.trim()).length;
  const knockoutFilled = knockout.filter((s) => s.teamId.trim()).length;

  const groupComplete =
    group.length > 0 && group.every((s) => s.teamId.trim() !== "");
  const thirdComplete = isThirdPlaceSectionComplete(slots);
  const bonusComplete =
    bonus.length === 0 || bonus.every((s) => s.teamId.trim() !== "");
  const knockoutComplete =
    !knockoutBracketPicksUnlocked ||
    (knockout.length > 0 &&
      knockout.every((s) => s.teamId.trim() !== ""));

  const sections: PickSectionProgress[] = [
    {
      id: "group",
      label: "Group stage",
      shortLabel: "Groups",
      status: sectionStatusFromCounts(groupFilled, group.length, groupComplete),
      filled: groupFilled,
      total: group.length,
      missing: group.length - groupFilled,
      detailLine: groupComplete
        ? "Complete"
        : groupFilled === 0
          ? "Not started"
          : `${groupFilled} of ${group.length} filled`,
    },
    {
      id: "third_place",
      label: "Third-place qualification",
      shortLabel: "Third place",
      status: thirdComplete
        ? "complete"
        : thirdFilled === 0
          ? "not_started"
          : "partial",
      filled: thirdFilled,
      total: 8,
      missing: thirdComplete ? 0 : Math.max(0, 8 - thirdFilled),
      detailLine: thirdComplete
        ? "8 groups selected"
        : `${thirdFilled} of 8 selected`,
    },
    {
      id: "bonus",
      label: "Bonus picks",
      shortLabel: "Bonus",
      status:
        bonus.length === 0
          ? "complete"
          : sectionStatusFromCounts(
              bonusFilled,
              bonus.length,
              bonusComplete,
            ),
      filled: bonusFilled,
      total: bonus.length,
      missing: bonus.length - bonusFilled,
      detailLine:
        bonus.length === 0
          ? "None in this pool"
          : bonusComplete
            ? "Complete"
            : `${bonusFilled} of ${bonus.length} filled`,
    },
    {
      id: "knockout",
      label: "Knockout bracket",
      shortLabel: "Knockout",
      status: !knockoutBracketPicksUnlocked
        ? "locked"
        : sectionStatusFromCounts(
            knockoutFilled,
            knockout.length,
            knockoutComplete,
          ),
      filled: knockoutFilled,
      total: knockout.length,
      missing: knockout.length - knockoutFilled,
      detailLine: !knockoutBracketPicksUnlocked
        ? "Opens when Round of 32 is set"
        : knockoutComplete
          ? "Complete"
          : knockoutFilled === 0
            ? "Not started"
            : `${knockoutFilled} of ${knockout.length} filled`,
    },
  ];

  const picksComplete = participantPicksCompleteFromDrafts(slots, {
    knockoutBracketPicksUnlocked,
  });
  const missing = actionableMissingCount(slots, knockoutBracketPicksUnlocked);
  const preKnockoutPhaseComplete =
    !knockoutBracketPicksUnlocked &&
    groupComplete &&
    thirdComplete &&
    bonusComplete;
  const waitingForR32 = preKnockoutPhaseComplete;

  const { headline, detail } = buildOverallCopy({
    picksComplete,
    actionableMissingCount: missing,
    waitingForR32,
    knockoutBracketPicksUnlocked,
    sections,
  });

  const nextSection =
    picksComplete && !waitingForR32
      ? null
      : findNextSection(slots, sections, knockoutBracketPicksUnlocked);

  return {
    sections,
    picksComplete,
    actionableMissingCount: missing,
    overallHeadline: headline,
    overallDetail: detail,
    nextSection,
    waitingForR32,
  };
}

/** Map next-section metadata to a wizard step index (KnockoutPicksWizard step list). */
export function wizardStepIndexForNextSection(
  next: NextPickSection,
  wizardSteps: Array<{
    mode: "group" | "bonus" | "bracket";
    bracketKind?: string;
  }>,
): number | null {
  const idx = wizardSteps.findIndex((step) => {
    if (next.wizardMode === "group") return step.mode === "group";
    if (next.wizardMode === "bonus") return step.mode === "bonus";
    if (next.wizardMode === "bracket" && next.wizardBracketKind) {
      return (
        step.mode === "bracket" && step.bracketKind === next.wizardBracketKind
      );
    }
    return false;
  });
  return idx >= 0 ? idx : null;
}
