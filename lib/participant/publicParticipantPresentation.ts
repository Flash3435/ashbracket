import { formatPoolPoints } from "@/lib/format/poolPoints";
import { labelParticipantBonusPick } from "@/lib/predictions/participantBonusLabels";
import type {
  PublicParticipantDetail,
  PublicParticipantLedgerRow,
  PublicParticipantPick,
} from "../../types/publicParticipant";

type PickDisplayState = "scored" | "unscored";

export type PublicParticipantDisplayPick = PublicParticipantPick & {
  displayLabel: string;
  detailLabel: string | null;
  state: PickDisplayState;
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
  totalPoints: number;
};

export type PublicParticipantDisplayLedgerItem = PublicParticipantLedgerRow & {
  title: string;
  detail: string | null;
  timestampLabel: string;
  pointsLabel: string;
};

export type PublicParticipantDisplaySummary = {
  totalPicks: number;
  scoredPicksCount: number;
  sectionsWithPointsCount: number;
  totalSectionsCount: number;
  categoriesWithPointsCount: number;
  scoringEventsCount: number;
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

function formatTimestamp(timestamp: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
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
    const displayPick: PublicParticipantDisplayPick = {
      ...pick,
      displayLabel: described.displayLabel,
      detailLabel: described.detailLabel,
      state: pickLedger.length > 0 ? "scored" : "unscored",
      pointsEarned: pickPoints(pickLedger),
      ledgerCount: pickLedger.length,
    };

    const existing = sectionMap.get(sectionMeta.key);
    if (existing) {
      existing.picks.push(displayPick);
      existing.totalPoints += displayPick.pointsEarned;
      if (displayPick.state === "scored") {
        existing.scoredPicksCount += 1;
      }
    } else {
      sectionMap.set(sectionMeta.key, {
        key: sectionMeta.key,
        title: sectionMeta.title,
        description: sectionMeta.description,
        sortOrder: sectionMeta.sortOrder,
        picks: [displayPick],
        scoredPicksCount: displayPick.state === "scored" ? 1 : 0,
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
      const described = describeLedgerItem(row, pickById);
      return {
        ...row,
        title: described.title,
        detail: described.detail,
        timestampLabel: formatTimestamp(row.createdAt),
        pointsLabel: `${row.pointsDelta > 0 ? "+" : ""}${formatPoolPoints(row.pointsDelta)}`,
      };
    });

  const scoredPicksCount = detail.picks.filter((pick) =>
    ledgerByPredictionId.has(pick.predictionId),
  ).length;

  const summary: PublicParticipantDisplaySummary = {
    totalPicks: detail.picks.length,
    scoredPicksCount,
    sectionsWithPointsCount: sections.filter((section) => section.totalPoints > 0)
      .length,
    totalSectionsCount: sections.length,
    categoriesWithPointsCount: new Set(
      detail.ledger.map((row) => row.predictionKind ?? "unknown"),
    ).size,
    scoringEventsCount: detail.ledger.length,
  };

  return {
    summary,
    sections,
    ledgerItems,
  };
}
