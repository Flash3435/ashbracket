import type { NhlDraft26Prospect } from "@/lib/nhldraft26/prospectsSeed";
import { NHL_DRAFT26_PICK_COUNT } from "@/lib/nhldraft26/config";

export type NhlDraft26PublicPickRow = {
  entryId: string;
  pickNumber: number;
  prospectId: string;
};

export type NhlDraft26ConsensusProspectRow = {
  prospectId: string;
  rank: number;
  seedConsensusRank: number;
  totalPoints: number;
  boardsSelected: number;
  averagePick: number;
  numberOneVotes: number;
};

export type NhlDraft26SlotFavorite = {
  pickNumber: number;
  prospectId: string;
  count: number;
  boardCount: number;
  percentage: number;
};

export type NhlDraft26ConsensusBoard = {
  boardCount: number;
  uniqueProspectCount: number;
  mostCommonNumberOne: { prospectId: string; count: number } | null;
  consensusRows: NhlDraft26ConsensusProspectRow[];
  slotFavorites: NhlDraft26SlotFavorite[];
};

function consensusPointsForPick(pickNumber: number): number {
  return NHL_DRAFT26_PICK_COUNT + 1 - pickNumber;
}

export function buildNhlDraft26ConsensusBoard(
  picks: NhlDraft26PublicPickRow[],
  prospectById: Map<string, NhlDraft26Prospect>,
): NhlDraft26ConsensusBoard {
  const entryIds = new Set(picks.map((p) => p.entryId));
  const boardCount = entryIds.size;

  if (boardCount === 0) {
    return {
      boardCount: 0,
      uniqueProspectCount: 0,
      mostCommonNumberOne: null,
      consensusRows: [],
      slotFavorites: [],
    };
  }

  type Agg = {
    totalPoints: number;
    boardsSelected: number;
    pickSum: number;
    numberOneVotes: number;
  };

  const byProspect = new Map<string, Agg>();
  const bySlot = new Map<number, Map<string, number>>();
  const numberOneCounts = new Map<string, number>();

  for (const row of picks) {
    const agg = byProspect.get(row.prospectId) ?? {
      totalPoints: 0,
      boardsSelected: 0,
      pickSum: 0,
      numberOneVotes: 0,
    };
    agg.totalPoints += consensusPointsForPick(row.pickNumber);
    agg.boardsSelected += 1;
    agg.pickSum += row.pickNumber;
    if (row.pickNumber === 1) {
      agg.numberOneVotes += 1;
      numberOneCounts.set(
        row.prospectId,
        (numberOneCounts.get(row.prospectId) ?? 0) + 1,
      );
    }
    byProspect.set(row.prospectId, agg);

    const slotMap = bySlot.get(row.pickNumber) ?? new Map<string, number>();
    slotMap.set(row.prospectId, (slotMap.get(row.prospectId) ?? 0) + 1);
    bySlot.set(row.pickNumber, slotMap);
  }

  let mostCommonNumberOne: { prospectId: string; count: number } | null = null;
  for (const [prospectId, count] of numberOneCounts) {
    if (
      !mostCommonNumberOne ||
      count > mostCommonNumberOne.count ||
      (count === mostCommonNumberOne.count &&
        (prospectById.get(prospectId)?.consensusRank ?? 999) <
          (prospectById.get(mostCommonNumberOne.prospectId)?.consensusRank ?? 999))
    ) {
      mostCommonNumberOne = { prospectId, count };
    }
  }

  const consensusRows: NhlDraft26ConsensusProspectRow[] = [...byProspect.entries()]
    .map(([prospectId, agg]) => ({
      prospectId,
      rank: 0,
      seedConsensusRank: prospectById.get(prospectId)?.consensusRank ?? 999,
      totalPoints: agg.totalPoints,
      boardsSelected: agg.boardsSelected,
      averagePick: agg.pickSum / agg.boardsSelected,
      numberOneVotes: agg.numberOneVotes,
    }))
    .sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      if (a.averagePick !== b.averagePick) return a.averagePick - b.averagePick;
      if (b.numberOneVotes !== a.numberOneVotes) {
        return b.numberOneVotes - a.numberOneVotes;
      }
      return a.seedConsensusRank - b.seedConsensusRank;
    })
    .map((row, index) => ({ ...row, rank: index + 1 }));

  const slotFavorites: NhlDraft26SlotFavorite[] = [];
  for (let pickNumber = 1; pickNumber <= NHL_DRAFT26_PICK_COUNT; pickNumber++) {
    const slotMap = bySlot.get(pickNumber);
    if (!slotMap || slotMap.size === 0) continue;

    let bestId = "";
    let bestCount = 0;
    for (const [prospectId, count] of slotMap) {
      if (
        count > bestCount ||
        (count === bestCount &&
          (prospectById.get(prospectId)?.consensusRank ?? 999) <
            (prospectById.get(bestId)?.consensusRank ?? 999))
      ) {
        bestId = prospectId;
        bestCount = count;
      }
    }

    slotFavorites.push({
      pickNumber,
      prospectId: bestId,
      count: bestCount,
      boardCount,
      percentage: Math.round((bestCount / boardCount) * 100),
    });
  }

  return {
    boardCount,
    uniqueProspectCount: byProspect.size,
    mostCommonNumberOne,
    consensusRows,
    slotFavorites,
  };
}
