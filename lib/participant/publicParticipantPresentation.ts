import { formatPoolPoints } from "@/lib/format/poolPoints";
import { labelParticipantBonusPick } from "@/lib/predictions/participantBonusLabels";
import type {
  PublicParticipantDetail,
  PublicParticipantLedgerRow,
  PublicParticipantPick,
} from "../../types/publicParticipant";

/**
 * What we can infer from public picks + ledger only (no per-slot result resolution):
 * - empty: no team saved on the pick
 * - scored: at least one ledger line for this prediction (points awarded)
 * - awaiting: team saved but no ledger yet (may be pending results OR settled with 0 pts)
 */
export type PickDisplayState = "empty" | "scored" | "awaiting";

export type PickStatusPresentation = {
  state: PickDisplayState;
  /** Short badge label */
  label: string;
  /** One-line explanation for tooltips / helper copy */
  meaning: string;
};

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
  /** Saved picks (team chosen) with no ledger lines yet */
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
    title: "Finalists",
    description: "Teams picked to reach the final.",
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
): PickDisplayState {
  if (pickLedger.length > 0) return "scored";
  if (hasSavedTeam(pick)) return "awaiting";
  return "empty";
}

export function pickStatusPresentation(state: PickDisplayState): PickStatusPresentation {
  switch (state) {
    case "scored":
      return {
        state,
        label: "Scored",
        meaning: "This pick earned points on the official results board.",
      };
    case "awaiting":
      return {
        state,
        label: "Awaiting score",
        meaning:
          "You saved a team here, but no points are on the board yet. That can mean results are still pending, or this pick did not score once results were in.",
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
        detailLabel: "Reached the final",
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
    const state = resolvePickDisplayState(pick, pickLedger);
    const displayPick: PublicParticipantDisplayPick = {
      ...pick,
      displayLabel: described.displayLabel,
      detailLabel: described.detailLabel,
      state,
      status: pickStatusPresentation(state),
      pointsEarned: pickPoints(pickLedger),
      ledgerCount: pickLedger.length,
    };

    const existing = sectionMap.get(sectionMeta.key);
    if (existing) {
      existing.picks.push(displayPick);
      existing.totalPoints += displayPick.pointsEarned;
      if (displayPick.state === "scored") existing.scoredPicksCount += 1;
      else if (displayPick.state === "awaiting") existing.awaitingScoreCount += 1;
      else existing.emptyPicksCount += 1;
    } else {
      sectionMap.set(sectionMeta.key, {
        key: sectionMeta.key,
        title: sectionMeta.title,
        description: sectionMeta.description,
        sortOrder: sectionMeta.sortOrder,
        picks: [displayPick],
        scoredPicksCount: displayPick.state === "scored" ? 1 : 0,
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
  let awaitingScoreCount = 0;
  let emptyPicksCount = 0;
  for (const pick of detail.picks) {
    const state = resolvePickDisplayState(
      pick,
      ledgerByPredictionId.get(pick.predictionId) ?? [],
    );
    if (state === "scored") scoredPicksCount += 1;
    else if (state === "awaiting") awaitingScoreCount += 1;
    else emptyPicksCount += 1;
  }

  const totalPointsFromLedger = detail.ledger.reduce(
    (sum, row) => sum + row.pointsDelta,
    0,
  );

  const summary: PublicParticipantDisplaySummary = {
    totalPicks: detail.picks.length,
    scoredPicksCount,
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
