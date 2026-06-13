import { comparePilotStandings, type PilotStandingsRow } from "@/lib/admin/pilotStandingsSnapshot";
import type {
  BonusLeaderSnapshot,
  ScoreImpactAnalysis,
  ScoreImpactMatchResult,
  ScoreImpactMover,
  ScoreImpactPointGainer,
  ScoreImpactReason,
} from "./types";

const GROUP_PENDING_NOTES = [
  (group: string) =>
    `No pool points yet — Group ${group} points settle after the group finishes.`,
  (group: string) =>
    `No scoring change yet. Group ${group} points land once all group matches are complete.`,
  (group: string) =>
    `Standings hold for now — Group ${group} advancement points come after the final group match.`,
] as const;

function pickTemplateIndex(seed: string, count: number): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return count > 0 ? hash % count : 0;
}

function formatNameList(names: readonly string[], max = 3): string {
  const trimmed = names.map((n) => n.trim()).filter(Boolean);
  if (trimmed.length === 0) return "";
  if (trimmed.length === 1) return trimmed[0]!;
  if (trimmed.length === 2) return `${trimmed[0]} and ${trimmed[1]}`;
  if (trimmed.length <= max) {
    return `${trimmed.slice(0, -1).join(", ")}, and ${trimmed[trimmed.length - 1]}`;
  }
  const head = trimmed.slice(0, max - 1).join(", ");
  return `${head}, and ${trimmed[max - 1]}`;
}

function buildMovers(
  before: PilotStandingsRow[],
  after: PilotStandingsRow[],
): ScoreImpactMover[] {
  const beforeRank = new Map(before.map((r) => [r.participantId, r.rank]));
  const movers: ScoreImpactMover[] = [];

  for (const row of after) {
    const prevRank = beforeRank.get(row.participantId);
    if (prevRank == null || prevRank === row.rank) continue;
    movers.push({
      participantId: row.participantId,
      displayName: row.displayName,
      previousRank: prevRank,
      newRank: row.rank,
      rankDelta: prevRank - row.rank,
    });
  }

  movers.sort((a, b) => {
    if (b.rankDelta !== a.rankDelta) return b.rankDelta - a.rankDelta;
    return a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" });
  });

  return movers;
}

function buildPointGainers(
  compare: ReturnType<typeof comparePilotStandings>,
  after: PilotStandingsRow[],
): ScoreImpactPointGainer[] {
  const afterById = new Map(after.map((r) => [r.participantId, r]));
  const gainers: ScoreImpactPointGainer[] = [];

  for (const diff of compare.diffs) {
    const gained = diff.currentPoints - diff.baselinePoints;
    if (gained <= 0) continue;
    const afterRow = afterById.get(diff.participantId);
    gainers.push({
      participantId: diff.participantId,
      displayName: diff.displayName,
      pointsGained: gained,
      newTotalPoints: diff.currentPoints,
      newRank: afterRow?.rank ?? Number.MAX_SAFE_INTEGER,
    });
  }

  gainers.sort((a, b) => {
    if (b.pointsGained !== a.pointsGained) return b.pointsGained - a.pointsGained;
    if (a.newRank !== b.newRank) return a.newRank - b.newRank;
    return a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" });
  });

  for (const gainer of gainers) {
    if (gainer.newTotalPoints === 0) {
      gainer.newTotalPoints = afterById.get(gainer.participantId)?.totalPoints ?? 0;
    }
    if (gainer.newRank === Number.MAX_SAFE_INTEGER) {
      gainer.newRank = afterById.get(gainer.participantId)?.rank ?? gainer.newRank;
    }
  }

  return gainers;
}

function bonusLeaderNotes(
  before: BonusLeaderSnapshot | null | undefined,
  after: BonusLeaderSnapshot | null | undefined,
  teamNameById: ReadonlyMap<string, string>,
): string[] {
  if (!before || !after) return [];
  const notes: string[] = [];

  const pairs: Array<{
    label: string;
    beforeId: string | null;
    afterId: string | null;
  }> = [
    {
      label: "most goals",
      beforeId: before.mostGoalsTeamId,
      afterId: after.mostGoalsTeamId,
    },
    {
      label: "most yellow cards",
      beforeId: before.mostYellowCardsTeamId,
      afterId: after.mostYellowCardsTeamId,
    },
    {
      label: "most red cards",
      beforeId: before.mostRedCardsTeamId,
      afterId: after.mostRedCardsTeamId,
    },
  ];

  for (const pair of pairs) {
    if (!pair.afterId || pair.beforeId === pair.afterId) continue;
    const name = teamNameById.get(pair.afterId)?.trim();
    if (!name) continue;
    notes.push(`${name} now leads for ${pair.label}`);
  }

  return notes;
}

function pendingGroupPointsNote(
  match: ScoreImpactMatchResult | null,
  pointsChanged: boolean,
): string | null {
  if (!match?.groupCode || match.stageCode !== "group") return null;
  if (pointsChanged) return null;
  const idx = pickTemplateIndex(match.matchCode || match.label, GROUP_PENDING_NOTES.length);
  return GROUP_PENDING_NOTES[idx]!(match.groupCode);
}

function inferReason(input: {
  primaryMatch: ScoreImpactMatchResult | null;
  pointsChanged: boolean;
  bonusLeaderNotes: string[];
}): ScoreImpactReason {
  const { primaryMatch, pointsChanged, bonusLeaderNotes } = input;
  if (!primaryMatch && bonusLeaderNotes.length > 0) return "bonus_update";
  if (!primaryMatch) return "other";

  if (primaryMatch.stageCode === "group" || primaryMatch.groupCode) {
    if (pointsChanged) return "group_complete";
    return "group_incomplete";
  }

  return "knockout_result";
}

/**
 * Pure impact analysis from before/after standings and optional tournament context.
 */
export function detectScoreImpact(input: {
  beforeRows: PilotStandingsRow[];
  afterRows: PilotStandingsRow[];
  matchResults?: ScoreImpactMatchResult[];
  beforeBonusLeaders?: BonusLeaderSnapshot | null;
  afterBonusLeaders?: BonusLeaderSnapshot | null;
  teamNameById?: ReadonlyMap<string, string>;
  /** Count of participants who gained any points this run. */
  bracketsScoredCount?: number;
}): ScoreImpactAnalysis {
  const compare = comparePilotStandings(input.beforeRows, input.afterRows);
  const pointGainers = buildPointGainers(compare, input.afterRows);
  const movers = buildMovers(input.beforeRows, input.afterRows);
  const primaryMatch = input.matchResults?.[0] ?? null;
  const teamNames = input.teamNameById ?? new Map<string, string>();
  const pointsChanged = pointGainers.length > 0;
  const bonusNotes = bonusLeaderNotes(
    input.beforeBonusLeaders,
    input.afterBonusLeaders,
    teamNames,
  );

  return {
    standingsChanged: !compare.matches,
    pointsChanged,
    pointGainers,
    movers,
    bracketsScoredCount: input.bracketsScoredCount ?? pointGainers.length,
    perfectGroupPickers: [],
    pendingPointsNote: pendingGroupPointsNote(primaryMatch, pointsChanged),
    bonusLeaderNotes: bonusNotes,
    primaryMatchLabel: primaryMatch?.label ?? null,
    primaryMatchCode: primaryMatch?.matchCode ?? null,
    groupCode: primaryMatch?.groupCode ?? null,
    stageCode: primaryMatch?.stageCode ?? null,
    scoreline: primaryMatch?.label ?? null,
    reason: inferReason({
      primaryMatch,
      pointsChanged,
      bonusLeaderNotes: bonusNotes,
    }),
  };
}

export function scoreImpactHasMeaningfulChange(analysis: ScoreImpactAnalysis): boolean {
  if (analysis.pointsChanged) return true;
  if (analysis.primaryMatchLabel) return true;
  if (analysis.bonusLeaderNotes.length > 0) return true;
  return false;
}

export function formatTopPointGainers(
  gainers: ScoreImpactPointGainer[],
  max = 3,
): string {
  return formatNameList(
    gainers.slice(0, max).map((g) => {
      const pts =
        Number.isInteger(g.pointsGained) ? String(g.pointsGained) : g.pointsGained.toFixed(1);
      return `${g.displayName} +${pts}`;
    }),
    max,
  );
}

export function formatBiggestMover(movers: ScoreImpactMover[]): string | null {
  const mover = movers[0];
  if (!mover || mover.rankDelta <= 0) return null;
  const ordinal =
    mover.newRank === 1
      ? "1st"
      : mover.newRank === 2
        ? "2nd"
        : mover.newRank === 3
          ? "3rd"
          : `${mover.newRank}th`;
  const prevOrdinal =
    mover.previousRank === 1
      ? "1st"
      : mover.previousRank === 2
        ? "2nd"
        : mover.previousRank === 3
          ? "3rd"
          : `${mover.previousRank}th`;
  return `${mover.displayName} jumped from ${prevOrdinal} to ${ordinal}`;
}
