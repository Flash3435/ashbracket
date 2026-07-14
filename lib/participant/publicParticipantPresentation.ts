import { formatPoolPoints } from "@/lib/format/poolPoints";
import { labelParticipantBonusPick } from "@/lib/predictions/participantBonusLabels";
import { isKnockoutProgressionKind } from "@/lib/predictions/knockoutProgressionKinds";
import {
  awardedKnockoutMeaning,
  awaitingKnockoutMeaning,
  missedKnockoutMeaning,
  resolveKnockoutPickOutcome,
  satisfiedKnockoutMeaning,
  type KnockoutProfileSettlementContext,
  type KnockoutTeamAward,
  type KnockoutTeamProgress,
} from "./knockoutProfileSettlement";
import type {
  PublicParticipantDetail,
  PublicParticipantLedgerRow,
  PublicParticipantPick,
} from "../../types/publicParticipant";

/**
 * Profile pick status:
 * - empty: no team saved
 * - out: path-invalid locked knockout pick (higher priority than outcome states)
 * - scored: non-knockout pick with ledger points (group / third / bonus)
 * - awarded: knockout representative card that owns the once-per-team ledger row
 * - satisfied: knockout pick correct at depth; points counted on another card
 * - missed: settled incorrect / eliminated before required depth
 * - awaiting: outcome still unresolved
 *
 * Pick Out supersedes normal missed/awaiting/satisfied/awarded so historical
 * bracket-path invalidation stays visible.
 */
export type PickDisplayState =
  | "empty"
  | "out"
  | "scored"
  | "awarded"
  | "satisfied"
  | "missed"
  | "awaiting";

export type PickStatusPresentation = {
  state: PickDisplayState;
  /** Short badge label */
  label: string;
  /** One-line explanation for tooltips / helper copy */
  meaning: string;
};

export type PickDisplaySettlementContext = {
  /** Uppercase group codes with both official winner and runner-up results. */
  settledGroupCodes?: ReadonlySet<string> | readonly string[];
  thirdPlaceQualifiersSettled?: boolean;
  knockout?: KnockoutProfileSettlementContext | null;
  knockoutResultCounts?: ReadonlyMap<string, number> | Record<string, number>;
};

/** Build sorted uppercase group codes that have both winner and runner-up results. */
export function settledGroupCodesFromOfficialRows(
  rows: ReadonlyArray<{ kind: string; group_code?: string | null; groupCode?: string | null }>,
): string[] {
  const winners = new Set<string>();
  const runners = new Set<string>();
  for (const row of rows) {
    const raw = row.group_code ?? row.groupCode ?? "";
    const group = String(raw).trim().toUpperCase();
    if (!group) continue;
    if (row.kind === "group_winner") winners.add(group);
    else if (row.kind === "group_runner_up") runners.add(group);
  }
  return [...winners].filter((group) => runners.has(group)).sort();
}

function settledGroupCodeSet(
  codes: PickDisplaySettlementContext["settledGroupCodes"],
): ReadonlySet<string> {
  if (!codes) return new Set();
  if (codes instanceof Set) return codes;
  return new Set(
    [...codes].map((code) => String(code).trim().toUpperCase()).filter(Boolean),
  );
}

function isGroupOutcomeSettled(
  groupCode: string | null | undefined,
  settledGroups: ReadonlySet<string>,
): boolean {
  const group = (groupCode ?? "").trim().toUpperCase();
  return Boolean(group) && settledGroups.has(group);
}

function knockoutResultCountMap(
  counts: PickDisplaySettlementContext["knockoutResultCounts"],
): ReadonlyMap<string, number> {
  if (!counts) return new Map();
  if (counts instanceof Map) return counts;
  return new Map(
    Object.entries(counts).map(([k, v]) => [k, Number(v)]),
  );
}

function knockoutContextFromDetail(
  detail: PublicParticipantDetail,
): KnockoutProfileSettlementContext | null {
  const progressEntries = detail.knockoutProgressByTeamId
    ? Object.entries(detail.knockoutProgressByTeamId)
    : [];
  const awardEntries = detail.knockoutAwardByTeamId
    ? Object.entries(detail.knockoutAwardByTeamId)
    : [];
  if (
    progressEntries.length === 0 &&
    awardEntries.length === 0 &&
    detail.knockoutRoundOf32FieldComplete == null
  ) {
    return null;
  }
  return {
    progressByTeamId: new Map(progressEntries) as Map<string, KnockoutTeamProgress>,
    awardByTeamId: new Map(awardEntries) as Map<string, KnockoutTeamAward>,
    kindsWithPositivePoints: new Set(detail.knockoutKindsWithPositivePoints ?? []),
    roundOf32FieldComplete: detail.knockoutRoundOf32FieldComplete === true,
  };
}

export type PublicParticipantDisplayPick = PublicParticipantPick & {
  displayLabel: string;
  detailLabel: string | null;
  state: PickDisplayState;
  status: PickStatusPresentation;
  pointsEarned: number;
  ledgerCount: number;
  /** Footer helper distinct from tooltip meaning when helpful. */
  footerLabel: string;
};

export type PublicParticipantDisplaySection = {
  key: string;
  title: string;
  description: string;
  sortOrder: number;
  picks: PublicParticipantDisplayPick[];
  /** Non-knockout ledger hits (group / third / bonus). */
  scoredPicksCount: number;
  /** Knockout cards that own the once-per-team ledger row. */
  awardedPicksCount: number;
  /** Knockout cards correct at depth with points on another card. */
  satisfiedPicksCount: number;
  missedPicksCount: number;
  awaitingScoreCount: number;
  emptyPicksCount: number;
  outPicksCount: number;
  totalPoints: number;
};

export type PublicParticipantDisplayLedgerItem = PublicParticipantLedgerRow & {
  title: string;
  detail: string | null;
  stageLabel: string | null;
  dateLabel: string;
  pointsLabel: string;
};

export type PublicParticipantDisplaySummary = {
  totalPicks: number;
  scoredPicksCount: number;
  awardedPicksCount: number;
  satisfiedPicksCount: number;
  missedPicksCount: number;
  awaitingScoreCount: number;
  emptyPicksCount: number;
  outPicksCount: number;
  stagesWithPointsCount: number;
  totalStagesCount: number;
  pointAwardsCount: number;
  totalPointsFromLedger: number;
};

export type PublicParticipantPresentationDiagnostics = {
  consistencyErrors: string[];
};

type SectionMeta = {
  key: string;
  title: string;
  description: string;
  sortOrder: number;
};

const SECTION_BY_KIND: Record<string, SectionMeta> = {
  group_winner: {
    key: "group_stage",
    title: "Group stage",
    description: "Group winners and runners-up.",
    sortOrder: 10,
  },
  group_runner_up: {
    key: "group_stage",
    title: "Group stage",
    description: "Group winners and runners-up.",
    sortOrder: 10,
  },
  third_place_qualifier: {
    key: "third_place_advancers",
    title: "Best third-place advancers",
    description:
      "One third-place team from each group. These are qualifying selections, not Round of 32 bracket slots.",
    sortOrder: 20,
  },
  round_of_32: {
    key: "round_of_32",
    title: "Round of 32",
    description: "Official Round of 32 bracket slots.",
    sortOrder: 30,
  },
  round_of_16: {
    key: "round_of_16",
    title: "Round of 16",
    description: "Teams picked to reach the Round of 16.",
    sortOrder: 40,
  },
  quarterfinalist: {
    key: "quarterfinalists",
    title: "Quarter-finalists",
    description: "Teams picked to reach the last eight.",
    sortOrder: 50,
  },
  semifinalist: {
    key: "semifinalists",
    title: "Semi-finalists",
    description: "Teams picked to reach the semi-finals.",
    sortOrder: 60,
  },
  finalist: {
    key: "finalists",
    title: "Semi-final winners",
    description: "Teams picked to reach the Final.",
    sortOrder: 70,
  },
  champion: {
    key: "champion",
    title: "Champion",
    description: "Tournament winner pick.",
    sortOrder: 80,
  },
  bonus_pick: {
    key: "bonus_picks",
    title: "Bonus picks",
    description: "Extra tournament-wide questions.",
    sortOrder: 90,
  },
};

const PICK_KIND_SORT_ORDER: Record<string, number> = {
  group_winner: 10,
  group_runner_up: 20,
  third_place_qualifier: 30,
  round_of_32: 40,
  round_of_16: 50,
  quarterfinalist: 60,
  semifinalist: 70,
  finalist: 80,
  champion: 90,
  bonus_pick: 100,
};

function fallbackSectionMeta(pick: PublicParticipantPick): SectionMeta {
  return {
    key: pick.stageCode ?? pick.predictionKind,
    title: pick.stageLabel,
    description: "Participant picks for this stage.",
    sortOrder: pick.stageSortOrder,
  };
}

function pickPoints(rows: PublicParticipantLedgerRow[]): number {
  return rows.reduce((sum, row) => sum + row.pointsDelta, 0);
}

function hasSavedTeam(pick: PublicParticipantPick): boolean {
  return Boolean(pick.teamName?.trim());
}

function resolvePickDisplayState(
  pick: PublicParticipantPick,
  pickLedger: PublicParticipantLedgerRow[],
  context?: PickDisplaySettlementContext,
  diagnostics?: string[],
): PickDisplayState {
  if (pick.pickIsOut && hasSavedTeam(pick)) return "out";

  if (isKnockoutProgressionKind(pick.predictionKind) && context?.knockout) {
    const outcome = resolveKnockoutPickOutcome({
      predictionId: pick.predictionId,
      predictionKind: pick.predictionKind,
      teamId: pick.teamId,
      hasLedgerOnThisPrediction: pickLedger.length > 0,
      context: context.knockout,
      resultCounts: knockoutResultCountMap(context.knockoutResultCounts),
    });
    if (outcome === "consistency_error") {
      diagnostics?.push(
        `Knockout consistency: team satisfied ${pick.predictionKind} (${pick.teamName ?? pick.teamId ?? "unknown"}) but no once-per-team award was found.`,
      );
      // Do not claim Satisfied when the award is missing.
      return "awaiting";
    }
    return outcome;
  }

  if (pickLedger.length > 0) return "scored";
  if (hasSavedTeam(pick)) {
    if (
      (pick.predictionKind === "group_winner" ||
        pick.predictionKind === "group_runner_up") &&
      isGroupOutcomeSettled(pick.groupCode, settledGroupCodeSet(context?.settledGroupCodes))
    ) {
      return "missed";
    }
    if (
      pick.predictionKind === "third_place_qualifier" &&
      context?.thirdPlaceQualifiersSettled
    ) {
      return "missed";
    }
    return "awaiting";
  }
  return "empty";
}

function missedStatusMeaning(
  pick:
    | Partial<
        Pick<PublicParticipantPick, "predictionKind" | "teamId" | "teamName">
      >
    | null
    | undefined,
  context?: PickDisplaySettlementContext,
): string {
  if (pick?.predictionKind && isKnockoutProgressionKind(pick.predictionKind)) {
    const teamId = pick.teamId?.trim();
    const furthest = teamId
      ? context?.knockout?.progressByTeamId.get(teamId)?.furthestOfficialKind
      : null;
    return missedKnockoutMeaning(pick.predictionKind, furthest);
  }
  if (pick?.predictionKind === "third_place_qualifier") {
    return "Official third-place advancers are known and this pick did not score.";
  }
  if (
    pick?.predictionKind === "group_winner" ||
    pick?.predictionKind === "group_runner_up"
  ) {
    return "Official group results are in and this pick did not score.";
  }
  return "Official results are in and this pick did not score.";
}

export function pickStatusPresentation(
  state: PickDisplayState,
  pick?: Partial<
    Pick<PublicParticipantPick, "predictionKind" | "teamId" | "teamName">
  > | null,
  context?: PickDisplaySettlementContext,
): PickStatusPresentation {
  switch (state) {
    case "out":
      return {
        state,
        label: "Pick out",
        meaning:
          "This locked knockout pick no longer fits the official bracket path and cannot be changed.",
      };
    case "scored":
      return {
        state,
        label: "Scored",
        meaning: "This pick earned points on the official results board.",
      };
    case "awarded":
      return {
        state,
        label: "Awarded",
        meaning:
          "This card holds the team’s highest once-per-team knockout award.",
      };
    case "satisfied":
      return {
        state,
        label: "Satisfied",
        meaning:
          "This prediction was correct. The team’s knockout points were counted on another card.",
      };
    case "missed":
      return {
        state,
        label: "Missed",
        meaning: missedStatusMeaning(pick, context),
      };
    case "awaiting":
      return {
        state,
        label: isKnockoutProgressionKind(pick?.predictionKind ?? "")
          ? "Awaiting"
          : "Awaiting score",
        meaning: isKnockoutProgressionKind(pick?.predictionKind ?? "")
          ? "The team can still reach this stage."
          : "You saved a team here, but the official result for this pick is not final yet.",
      };
    case "empty":
      return {
        state,
        label: "No pick",
        meaning: "This slot was not filled in.",
      };
  }
}

function footerLabelForPick(
  state: PickDisplayState,
  pick: PublicParticipantPick,
  _pointsEarned: number,
  ledgerCount: number,
): string {
  switch (state) {
    case "awarded":
      return awardedKnockoutMeaning(pick.teamName);
    case "satisfied":
      return "Already counted";
    case "scored":
      return ledgerCount === 1 ? "1 point award" : `${ledgerCount} point awards`;
    case "missed":
      return "0 points";
    case "awaiting":
      if (isKnockoutProgressionKind(pick.predictionKind)) {
        return awaitingKnockoutMeaning(pick.predictionKind);
      }
      return "Not on the scoreboard yet";
    case "out":
      return "Bracket path locked out";
    case "empty":
      return "—";
  }
}

function ledgerStageLabel(
  predictionKind: string | null | undefined,
  pick: PublicParticipantPick | undefined,
): string | null {
  const kind = pick?.predictionKind ?? predictionKind;
  if (!kind) return null;
  const meta = SECTION_BY_KIND[kind];
  return meta?.title ?? pick?.stageLabel ?? null;
}

function formatNumberSlot(slotKey: string | null, label: string): string {
  const trimmed = (slotKey ?? "").trim();
  if (!trimmed) return label;
  return `${label} ${trimmed}`;
}

function describePick(pick: PublicParticipantPick): {
  displayLabel: string;
  detailLabel: string | null;
} {
  const groupCode = (pick.groupCode ?? "").trim().toUpperCase();
  switch (pick.predictionKind) {
    case "group_winner":
      return {
        displayLabel: groupCode ? `Group ${groupCode}` : "Group pick",
        detailLabel: "Winner",
      };
    case "group_runner_up":
      return {
        displayLabel: groupCode ? `Group ${groupCode}` : "Group pick",
        detailLabel: "Runner-up",
      };
    case "third_place_qualifier":
      return {
        displayLabel: groupCode ? `Group ${groupCode}` : "Third-place pick",
        detailLabel: "3rd-place team",
      };
    case "round_of_32":
      return {
        displayLabel: formatNumberSlot(pick.slotKey, "Slot"),
        detailLabel: "Official bracket spot",
      };
    case "round_of_16":
      return {
        displayLabel: formatNumberSlot(pick.slotKey, "Pick"),
        detailLabel: "Reached Round of 16",
      };
    case "quarterfinalist":
      return {
        displayLabel: formatNumberSlot(pick.slotKey, "Pick"),
        detailLabel: "Reached quarter-finals",
      };
    case "semifinalist":
      return {
        displayLabel: formatNumberSlot(pick.slotKey, "Pick"),
        detailLabel: "Reached semi-finals",
      };
    case "finalist":
      return {
        displayLabel: formatNumberSlot(pick.slotKey, "Pick"),
        detailLabel: "Semi-final winner",
      };
    case "champion":
      return {
        displayLabel: "Champion",
        detailLabel: "Tournament winner",
      };
    case "bonus_pick":
      return {
        displayLabel: labelParticipantBonusPick(pick.bonusKey ?? ""),
        detailLabel: "Bonus question",
      };
    default:
      return {
        displayLabel: pick.stageLabel,
        detailLabel: null,
      };
  }
}

function formatLedgerDate(timestamp: string): string {
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(d);
}

function describeLedgerItem(
  row: PublicParticipantLedgerRow,
  pickById: Map<string, PublicParticipantPick>,
): { title: string; detail: string | null } {
  const pick = row.predictionId ? pickById.get(row.predictionId) : undefined;
  const teamLabel = pick?.teamName ?? null;
  const groupCode = (pick?.groupCode ?? "").trim().toUpperCase();

  switch (pick?.predictionKind ?? row.predictionKind) {
    case "group_winner":
      return {
        title: groupCode ? `Correct Group ${groupCode} winner` : "Correct group winner",
        detail: teamLabel,
      };
    case "group_runner_up":
      return {
        title: groupCode
          ? `Correct Group ${groupCode} runner-up`
          : "Correct group runner-up",
        detail: teamLabel,
      };
    case "third_place_qualifier":
      return {
        title: groupCode
          ? `Correct Group ${groupCode} third-place advancer`
          : "Correct best third-place advancer",
        detail: teamLabel,
      };
    case "round_of_32":
      return {
        title: "Correct Round of 32 bracket slot",
        detail: teamLabel,
      };
    case "round_of_16":
      return {
        title: "Team reached the Round of 16",
        detail: teamLabel,
      };
    case "quarterfinalist":
      return {
        title: "Team reached the quarter-finals",
        detail: teamLabel,
      };
    case "semifinalist":
      return {
        title: "Team reached the semi-finals",
        detail: teamLabel,
      };
    case "finalist":
      return {
        title: "Team reached the final",
        detail: teamLabel,
      };
    case "champion":
      return {
        title: "Champion pick hit",
        detail: teamLabel,
      };
    case "bonus_pick":
      return {
        title: pick?.bonusKey
          ? `Correct bonus pick: ${labelParticipantBonusPick(pick.bonusKey)}`
          : "Correct bonus pick",
        detail: teamLabel,
      };
    default:
      return {
        title: "Points awarded",
        detail: teamLabel,
      };
  }
}

function emptySectionCounts(): Pick<
  PublicParticipantDisplaySection,
  | "scoredPicksCount"
  | "awardedPicksCount"
  | "satisfiedPicksCount"
  | "missedPicksCount"
  | "awaitingScoreCount"
  | "emptyPicksCount"
  | "outPicksCount"
> {
  return {
    scoredPicksCount: 0,
    awardedPicksCount: 0,
    satisfiedPicksCount: 0,
    missedPicksCount: 0,
    awaitingScoreCount: 0,
    emptyPicksCount: 0,
    outPicksCount: 0,
  };
}

function bumpSectionCount(
  section: PublicParticipantDisplaySection,
  state: PickDisplayState,
): void {
  if (state === "scored") section.scoredPicksCount += 1;
  else if (state === "awarded") section.awardedPicksCount += 1;
  else if (state === "satisfied") section.satisfiedPicksCount += 1;
  else if (state === "missed") section.missedPicksCount += 1;
  else if (state === "awaiting") section.awaitingScoreCount += 1;
  else if (state === "empty") section.emptyPicksCount += 1;
  else if (state === "out") section.outPicksCount += 1;
}

export function buildPublicParticipantPresentation(detail: PublicParticipantDetail): {
  summary: PublicParticipantDisplaySummary;
  sections: PublicParticipantDisplaySection[];
  ledgerItems: PublicParticipantDisplayLedgerItem[];
  diagnostics: PublicParticipantPresentationDiagnostics;
} {
  const consistencyErrors: string[] = [];
  const presentationContext: PickDisplaySettlementContext = {
    settledGroupCodes: detail.settledGroupCodes,
    thirdPlaceQualifiersSettled: detail.thirdPlaceQualifiersSettled === true,
    knockout: knockoutContextFromDetail(detail),
    knockoutResultCounts: detail.knockoutOfficialResultCounts,
  };

  const ledgerByPredictionId = new Map<string, PublicParticipantLedgerRow[]>();
  for (const row of detail.ledger) {
    if (!row.predictionId) continue;
    const list = ledgerByPredictionId.get(row.predictionId) ?? [];
    list.push(row);
    ledgerByPredictionId.set(row.predictionId, list);
  }

  const sectionMap = new Map<string, PublicParticipantDisplaySection>();
  for (const pick of detail.picks) {
    const sectionMeta = SECTION_BY_KIND[pick.predictionKind] ?? fallbackSectionMeta(pick);
    const pickLedger = ledgerByPredictionId.get(pick.predictionId) ?? [];
    const described = describePick(pick);
    const state = resolvePickDisplayState(
      pick,
      pickLedger,
      presentationContext,
      consistencyErrors,
    );
    // Only count ledger points on awarded/scored cards — satisfied shows 0.
    const pointsEarned =
      state === "awarded" || state === "scored" ? pickPoints(pickLedger) : 0;
    const status = pickStatusPresentation(state, pick, presentationContext);
    if (state === "awarded") {
      status.meaning = awardedKnockoutMeaning(pick.teamName);
    } else if (state === "satisfied") {
      const teamId = pick.teamId?.trim();
      const furthest = teamId
        ? presentationContext.knockout?.progressByTeamId.get(teamId)
            ?.furthestOfficialKind
        : null;
      status.meaning = satisfiedKnockoutMeaning(pick.teamName, furthest);
    } else if (state === "awaiting" && isKnockoutProgressionKind(pick.predictionKind)) {
      status.meaning = "The team can still reach this stage.";
    } else if (state === "missed" && isKnockoutProgressionKind(pick.predictionKind)) {
      status.meaning = missedStatusMeaning(pick, presentationContext);
    }

    const displayPick: PublicParticipantDisplayPick = {
      ...pick,
      displayLabel: described.displayLabel,
      detailLabel: described.detailLabel,
      state,
      status,
      pointsEarned,
      ledgerCount: pickLedger.length,
      footerLabel: footerLabelForPick(
        state,
        pick,
        pointsEarned,
        pickLedger.length,
      ),
    };

    const existing = sectionMap.get(sectionMeta.key);
    if (existing) {
      existing.picks.push(displayPick);
      existing.totalPoints += displayPick.pointsEarned;
      bumpSectionCount(existing, displayPick.state);
    } else {
      const section: PublicParticipantDisplaySection = {
        key: sectionMeta.key,
        title: sectionMeta.title,
        description: sectionMeta.description,
        sortOrder: sectionMeta.sortOrder,
        picks: [displayPick],
        ...emptySectionCounts(),
        totalPoints: displayPick.pointsEarned,
      };
      bumpSectionCount(section, displayPick.state);
      sectionMap.set(sectionMeta.key, section);
    }
  }

  const sectionPickSortValue = (pick: PublicParticipantDisplayPick): string => {
    const groupCode = (pick.groupCode ?? "").trim();
    const slotKey = (pick.slotKey ?? "").trim().padStart(3, "0");
    const bonusKey = (pick.bonusKey ?? "").trim();
    const kindOrder = String(PICK_KIND_SORT_ORDER[pick.predictionKind] ?? 999).padStart(3, "0");
    return [groupCode, kindOrder, slotKey, bonusKey, pick.teamName ?? ""].join(":");
  };

  const sections = [...sectionMap.values()]
    .map((section) => ({
      ...section,
      picks: [...section.picks].sort((a, b) =>
        sectionPickSortValue(a).localeCompare(sectionPickSortValue(b)),
      ),
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const pickById = new Map(detail.picks.map((pick) => [pick.predictionId, pick]));
  const ledgerItems = [...detail.ledger]
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .map((row) => {
      const pick = row.predictionId ? pickById.get(row.predictionId) : undefined;
      const described = describeLedgerItem(row, pickById);
      return {
        ...row,
        title: described.title,
        detail: described.detail,
        stageLabel: ledgerStageLabel(row.predictionKind, pick),
        dateLabel: formatLedgerDate(row.createdAt),
        pointsLabel: `${row.pointsDelta > 0 ? "+" : ""}${formatPoolPoints(row.pointsDelta)}`,
      };
    });

  let scoredPicksCount = 0;
  let awardedPicksCount = 0;
  let satisfiedPicksCount = 0;
  let missedPicksCount = 0;
  let awaitingScoreCount = 0;
  let emptyPicksCount = 0;
  let outPicksCount = 0;
  for (const pick of detail.picks) {
    const state = resolvePickDisplayState(
      pick,
      ledgerByPredictionId.get(pick.predictionId) ?? [],
      presentationContext,
    );
    if (state === "scored") scoredPicksCount += 1;
    else if (state === "awarded") awardedPicksCount += 1;
    else if (state === "satisfied") satisfiedPicksCount += 1;
    else if (state === "missed") missedPicksCount += 1;
    else if (state === "awaiting") awaitingScoreCount += 1;
    else if (state === "empty") emptyPicksCount += 1;
    else if (state === "out") outPicksCount += 1;
  }

  const totalPointsFromLedger = detail.ledger.reduce(
    (sum, row) => sum + row.pointsDelta,
    0,
  );

  const summary: PublicParticipantDisplaySummary = {
    totalPicks: detail.picks.length,
    scoredPicksCount,
    awardedPicksCount,
    satisfiedPicksCount,
    missedPicksCount,
    awaitingScoreCount,
    emptyPicksCount,
    outPicksCount,
    stagesWithPointsCount: sections.filter((section) => section.totalPoints > 0)
      .length,
    totalStagesCount: sections.length,
    pointAwardsCount: detail.ledger.length,
    totalPointsFromLedger,
  };

  if (consistencyErrors.length > 0 && process.env.NODE_ENV !== "production") {
    console.warn("[ashbracket:knockout-profile] consistency errors", {
      participantId: detail.participantId,
      consistencyErrors,
    });
  }

  return {
    summary,
    sections,
    ledgerItems,
    diagnostics: { consistencyErrors },
  };
}

/** @deprecated Prefer formatPoolPoints from @/lib/format/poolPoints */
export { formatPoolPoints };
