import { comparePilotStandings, type PilotStandingsRow } from "@/lib/admin/pilotStandingsSnapshot";
import type {
  BonusLeaderSnapshot,
  ScoreImpactAnalysis,
  ScoreImpactMatchResult,
  ScoreImpactMover,
  ScoreImpactPointGainer,
} from "./types";

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
    gainers.push({
      participantId: diff.participantId,
      displayName: diff.displayName,
      pointsGained: gained,
      newTotalPoints: diff.currentPoints,
    });
  }

  gainers.sort((a, b) => {
    if (b.pointsGained !== a.pointsGained) return b.pointsGained - a.pointsGained;
    return a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" });
  });

  for (const gainer of gainers) {
    if (gainer.newTotalPoints === 0) {
      gainer.newTotalPoints = afterById.get(gainer.participantId)?.totalPoints ?? 0;
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

function incompleteGroupNote(match: ScoreImpactMatchResult | null): string | null {
  if (!match?.groupCode || match.stageCode !== "group") return null;
  return `Group ${match.groupCode} is not complete yet — winner and runner-up points land after all six group matches finish.`;
}

function pickSentimentNote(input: {
  match: ScoreImpactMatchResult | null;
  winnerTeamName: string | null;
  winnerPickCount: number;
}): string | null {
  const { match, winnerTeamName, winnerPickCount } = input;
  if (!match || !winnerTeamName || winnerPickCount <= 0) return null;
  if (match.groupCode) {
    return `${winnerTeamName} picks are looking stronger in Group ${match.groupCode}.`;
  }
  return `${winnerTeamName} picks are looking stronger after that result.`;
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
  /** Participant display names who gained group-advance points this run. */
  perfectGroupPickers?: readonly string[];
  /** Count of participants who gained any points this run. */
  bracketsScoredCount?: number;
  /** Participants who picked the primary match winner for group advance. */
  winnerPickCount?: number;
  primaryWinnerTeamName?: string | null;
}): ScoreImpactAnalysis {
  const compare = comparePilotStandings(input.beforeRows, input.afterRows);
  const pointGainers = buildPointGainers(compare, input.afterRows);
  const movers = buildMovers(input.beforeRows, input.afterRows);
  const primaryMatch = input.matchResults?.[0] ?? null;
  const teamNames = input.teamNameById ?? new Map<string, string>();

  return {
    standingsChanged: !compare.matches,
    pointsChanged: pointGainers.length > 0,
    pointGainers,
    movers,
    bracketsScoredCount: input.bracketsScoredCount ?? pointGainers.length,
    perfectGroupPickers: [...(input.perfectGroupPickers ?? [])],
    incompleteGroupNote: incompleteGroupNote(primaryMatch),
    pickSentimentNote: pickSentimentNote({
      match: primaryMatch,
      winnerTeamName: input.primaryWinnerTeamName ?? null,
      winnerPickCount: input.winnerPickCount ?? 0,
    }),
    bonusLeaderNotes: bonusLeaderNotes(
      input.beforeBonusLeaders,
      input.afterBonusLeaders,
      teamNames,
    ),
    primaryMatchLabel: primaryMatch?.label ?? null,
  };
}

export function scoreImpactHasMeaningfulChange(analysis: ScoreImpactAnalysis): boolean {
  if (analysis.pointsChanged) return true;
  if (analysis.primaryMatchLabel) return true;
  if (analysis.bonusLeaderNotes.length > 0) return true;
  return false;
}

export function formatTopPointGainers(gainers: ScoreImpactPointGainer[], max = 2): string {
  return formatNameList(
    gainers.slice(0, max).map((g) => {
      const pts =
        Number.isInteger(g.pointsGained) ? String(g.pointsGained) : g.pointsGained.toFixed(1);
      return `${g.displayName} (+${pts})`;
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
  return `${mover.displayName} jumped into ${ordinal}`;
}
