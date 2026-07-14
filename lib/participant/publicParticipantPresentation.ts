import { formatPoolPoints } from "@/lib/format/poolPoints";
import { labelParticipantBonusPick } from "@/lib/predictions/participantBonusLabels";
import type {
  PublicParticipantDetail,
  PublicParticipantLedgerRow,
  PublicParticipantPick,
} from "../../types/publicParticipant";

/**
 * What we can infer from public picks + ledger (+ optional settlement context):
 * - empty: no team saved on the pick
 * - out: team saved but marked out (historical locked invalid pick)
 * - scored: at least one ledger line for this prediction (points awarded)
 * - missed: team saved, official outcome settled, no points earned
 * - awaiting: team saved but official outcome not yet settled for this slot
 */
export type PickDisplayState = "empty" | "out" | "scored" | "missed" | "awaiting";

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

export type PublicParticipantDisplayPick = PublicParticipantPick & {
  displayLabel: string;
  detailLabel: string | null;
  state: PickDisplayState;
  status: PickStatusPresentation;
  pointsEarned: number;
  ledgerCount: number;
};

export type PublicParticipantDisplaySection = {
  key: string;
  title: string;
  description: string;
  sortOrder: number;
  picks: PublicParticipantDisplayPick[];
  scoredPicksCount: number;
  missedPicksCount: number;
  awaitingScoreCount: number;
  emptyPicksCount: number;
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
  /** Saved picks whose official outcome is settled but ranking earned no points */
  missedPicksCount: number;
  /** Saved picks (team chosen) with no ledger lines and unsettled official outcome */
  awaitingScoreCount: number;
  emptyPicksCount: number;
  stagesWithPointsCount: number;
  totalStagesCount: number;
  pointAwardsCount: number;
  totalPointsFromLedger: number;
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
): PickDisplayState {
  if (pick.pickIsOut && hasSavedTeam(pick)) return "out";
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

function missedStatusMeaning(predictionKind: string | undefined): string {
  if (predictionKind === "third_place_qualifier") {
    return "Official third-place advancers are known and this pick did not score.";
  }
  if (
    predictionKind === "group_winner" ||
    predictionKind === "group_runner_up"
  ) {
    return "Official group results are in and this pick did not score.";
  }
  return "Official results are in and this pick did not score.";
}

export function pickStatusPresentation(
  state: PickDisplayState,
  pick?: Pick<PublicParticipantPick, "predictionKind"> | null,
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
    case "missed":
      return {
        state,
        label: "Missed",
        meaning: missedStatusMeaning(pick?.predictionKind),
      };
    case "awaiting":
      return {
        state,
        label: "Awaiting score",
        meaning:
          "You saved a team here, but the official result for this pick is not final yet.",
      };
    case "empty":
      return {
        state,
        label: "No pick",
        meaning: "This slot was not filled in.",
      };
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

export function buildPublicParticipantPresentation(detail: PublicParticipantDetail): {
  summary: PublicParticipantDisplaySummary;
  sections: PublicParticipantDisplaySection[];
  ledgerItems: PublicParticipantDisplayLedgerItem[];
} {
  const presentationContext: PickDisplaySettlementContext = {
    settledGroupCodes: detail.settledGroupCodes,
    thirdPlaceQualifiersSettled: detail.thirdPlaceQualifiersSettled === true,
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
    const state = resolvePickDisplayState(pick, pickLedger, presentationContext);
    const displayPick: PublicParticipantDisplayPick = {
      ...pick,
      displayLabel: described.displayLabel,
      detailLabel: described.detailLabel,
      state,
      status: pickStatusPresentation(state, pick),
      pointsEarned: pickPoints(pickLedger),
      ledgerCount: pickLedger.length,
    };

    const existing = sectionMap.get(sectionMeta.key);
    if (existing) {
      existing.picks.push(displayPick);
      existing.totalPoints += displayPick.pointsEarned;
      if (displayPick.state === "scored") existing.scoredPicksCount += 1;
      else if (displayPick.state === "missed") existing.missedPicksCount += 1;
      else if (displayPick.state === "awaiting") existing.awaitingScoreCount += 1;
      else if (displayPick.state === "empty") existing.emptyPicksCount += 1;
    } else {
      sectionMap.set(sectionMeta.key, {
        key: sectionMeta.key,
        title: sectionMeta.title,
        description: sectionMeta.description,
        sortOrder: sectionMeta.sortOrder,
        picks: [displayPick],
        scoredPicksCount: displayPick.state === "scored" ? 1 : 0,
        missedPicksCount: displayPick.state === "missed" ? 1 : 0,
        awaitingScoreCount: displayPick.state === "awaiting" ? 1 : 0,
        emptyPicksCount: displayPick.state === "empty" ? 1 : 0,
        totalPoints: displayPick.pointsEarned,
      });
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
  let missedPicksCount = 0;
  let awaitingScoreCount = 0;
  let emptyPicksCount = 0;
  for (const pick of detail.picks) {
    const state = resolvePickDisplayState(
      pick,
      ledgerByPredictionId.get(pick.predictionId) ?? [],
      presentationContext,
    );
    if (state === "scored") scoredPicksCount += 1;
    else if (state === "missed") missedPicksCount += 1;
    else if (state === "awaiting") awaitingScoreCount += 1;
    else if (state === "empty") emptyPicksCount += 1;
  }

  const totalPointsFromLedger = detail.ledger.reduce(
    (sum, row) => sum + row.pointsDelta,
    0,
  );

  const summary: PublicParticipantDisplaySummary = {
    totalPicks: detail.picks.length,
    scoredPicksCount,
    missedPicksCount,
    awaitingScoreCount,
    emptyPicksCount,
    stagesWithPointsCount: sections.filter((section) => section.totalPoints > 0)
      .length,
    totalStagesCount: sections.length,
    pointAwardsCount: detail.ledger.length,
    totalPointsFromLedger,
  };

  return {
    summary,
    sections,
    ledgerItems,
  };
}
