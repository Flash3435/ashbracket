import { poolLocked } from "../pools/poolLocked";
import type { EveryonesPickEntry } from "./buildEveryonesPicksList";
import type { PreBracketRevealSection } from "./resolvePoolPreBracketReveal";
import {
  PRE_BRACKET_REVEAL_INTRO,
  shouldShowPreBracketReveal,
} from "./resolvePoolPreBracketReveal";

export type ChampionPickSummary = {
  teamId: string;
  teamName: string;
  teamCode?: string;
  count: number;
  percentage: number;
  participantNames?: string[];
};

export type PoolRevealData = {
  locked: boolean;
  lockAt: string | null;
  deadlineLabel: string | null;
  relativeCountdown: string | null;
  viewerPicksComplete: boolean;
  /** Brackets passing the app completeness rules. */
  totalCompleted: number;
  /** Complete brackets with a resolved champion pick (denominator for percentages). */
  totalChampionBrackets: number;
  totalParticipants: number;
  championPicks: ChampionPickSummary[];
  uniqueChampionCount: number;
  championDiversityCount: number;
  mostPopularChampion: ChampionPickSummary | null;
  mostPopularChampionTied: boolean;
  soloChampionPicks: ChampionPickSummary[];
  ashbotLine: string | null;
  canShowParticipantNames: boolean;
  knockoutBracketPicksUnlocked: boolean;
  preBracketSections: PreBracketRevealSection[];
  showPreBracketReveal: boolean;
  preBracketIntro: string | null;
  everyonesPicks: EveryonesPickEntry[];
};

export type ChampionPickInput = {
  teamId: string;
  teamName: string;
  teamCode?: string;
  participantId: string;
  participantDisplayName: string;
};

export type BuildPoolRevealInput = {
  lockAt: string | null;
  deadlineLabel: string | null;
  relativeCountdown: string | null;
  totalParticipants: number;
  completeParticipantIds: string[];
  championPicks: ChampionPickInput[];
  viewerPicksComplete: boolean;
  /** Same-pool members may view peer picks (participant bracket snapshot). */
  canShowParticipantNames: boolean;
  knockoutBracketPicksUnlocked?: boolean;
  preBracketSections?: PreBracketRevealSection[];
  everyonesPicks?: EveryonesPickEntry[];
  nowMs?: number;
};

function sortChampionSummaries(
  summaries: ChampionPickSummary[],
): ChampionPickSummary[] {
  return [...summaries].sort(
    (a, b) =>
      b.count - a.count ||
      a.teamName.localeCompare(b.teamName) ||
      a.teamId.localeCompare(b.teamId),
  );
}

function pickAshbotLine(top: ChampionPickSummary | null, tied: boolean): string | null {
  if (!top || tied) return null;
  if (top.count >= 5) return "The bandwagon has officially left the station.";
  if (top.count >= 3) return "Safe pick or smart read? The pool has spoken.";
  return "Early favorite — we'll see if the crowd is right.";
}

/**
 * Pure reveal presentation from completed champion picks among complete brackets.
 * Before lock, returns no team or pick distribution data.
 */
export function buildPoolReveal(input: BuildPoolRevealInput): PoolRevealData {
  const nowMs = input.nowMs ?? Date.now();
  const locked = poolLocked(input.lockAt);
  const totalCompleted = input.completeParticipantIds.length;
  const totalParticipants = input.totalParticipants;

  const knockoutBracketPicksUnlocked = input.knockoutBracketPicksUnlocked !== false;
  const preBracketSections = input.preBracketSections ?? [];
  const everyonesPicks = input.everyonesPicks ?? [];

  const emptyLocked: PoolRevealData = {
    locked: false,
    lockAt: input.lockAt,
    deadlineLabel: input.deadlineLabel,
    relativeCountdown: input.relativeCountdown,
    viewerPicksComplete: input.viewerPicksComplete,
    totalCompleted,
    totalChampionBrackets: 0,
    totalParticipants,
    championPicks: [],
    uniqueChampionCount: 0,
    championDiversityCount: 0,
    mostPopularChampion: null,
    mostPopularChampionTied: false,
    soloChampionPicks: [],
    ashbotLine: null,
    canShowParticipantNames: false,
    knockoutBracketPicksUnlocked,
    preBracketSections,
    showPreBracketReveal: false,
    preBracketIntro: null,
    everyonesPicks: [],
  };

  if (!locked) return emptyLocked;

  const completeSet = new Set(input.completeParticipantIds);
  const byTeam = new Map<
    string,
    {
      teamName: string;
      teamCode?: string;
      participantIds: Set<string>;
      participantNames: string[];
    }
  >();

  for (const row of input.championPicks) {
    if (!completeSet.has(row.participantId)) continue;
    const teamId = row.teamId.trim();
    if (!teamId) continue;

    let entry = byTeam.get(teamId);
    if (!entry) {
      entry = {
        teamName: row.teamName.trim() || "Unknown team",
        teamCode: row.teamCode?.trim() || undefined,
        participantIds: new Set(),
        participantNames: [],
      };
      byTeam.set(teamId, entry);
    }

    const displayName = row.participantDisplayName.trim() || "Participant";
    if (!entry.participantIds.has(row.participantId)) {
      entry.participantIds.add(row.participantId);
      entry.participantNames.push(displayName);
    }
  }

  const showNames = input.canShowParticipantNames;
  const totalChampionBrackets = [...byTeam.values()].reduce(
    (sum, entry) => sum + entry.participantIds.size,
    0,
  );
  const championPicks = sortChampionSummaries(
    [...byTeam.entries()].map(([teamId, entry]) => {
      const count = entry.participantIds.size;
      const percentage =
        totalChampionBrackets > 0
          ? Math.round((count / totalChampionBrackets) * 1000) / 10
          : 0;
      const names = showNames
        ? [...entry.participantNames].sort((a, b) => a.localeCompare(b))
        : undefined;
      return {
        teamId,
        teamName: entry.teamName,
        teamCode: entry.teamCode,
        count,
        percentage,
        participantNames: names,
      };
    }),
  );

  const soloChampionPicks = championPicks.filter((c) => c.count === 1);
  const uniqueChampionCount = soloChampionPicks.length;
  const championDiversityCount = championPicks.length;

  const maxCount =
    championPicks.length > 0 ? Math.max(...championPicks.map((c) => c.count)) : 0;
  const leaders = championPicks.filter((c) => c.count === maxCount && maxCount > 0);
  const mostPopularChampion = leaders[0] ?? null;
  const mostPopularChampionTied = leaders.length > 1;

  const showPreBracketReveal = shouldShowPreBracketReveal({
    locked: true,
    knockoutBracketPicksUnlocked,
    totalChampionBrackets,
    preBracketSections,
  });

  return {
    locked: true,
    lockAt: input.lockAt,
    deadlineLabel: input.deadlineLabel,
    relativeCountdown: input.relativeCountdown,
    viewerPicksComplete: input.viewerPicksComplete,
    totalCompleted,
    totalChampionBrackets,
    totalParticipants,
    championPicks,
    uniqueChampionCount,
    championDiversityCount,
    mostPopularChampion,
    mostPopularChampionTied,
    soloChampionPicks,
    ashbotLine: pickAshbotLine(mostPopularChampion, mostPopularChampionTied),
    canShowParticipantNames: showNames,
    knockoutBracketPicksUnlocked,
    preBracketSections,
    showPreBracketReveal,
    preBracketIntro: showPreBracketReveal ? PRE_BRACKET_REVEAL_INTRO : null,
    everyonesPicks,
  };
}

/** True when insight metadata indicates a post-lock aggregate insight. */
export function isPostLockPoolInsightSourceKey(sourceKey: string | null | undefined): boolean {
  return typeof sourceKey === "string" && sourceKey.startsWith("postlock_");
}
