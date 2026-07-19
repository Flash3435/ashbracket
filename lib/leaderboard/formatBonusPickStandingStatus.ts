import type { RemainingTournamentPick } from "@/lib/pool/buildParticipantRaceOutlook";
import type {
  BonusCategoryStanding,
  TournamentBonusCategoryKey,
  TournamentBonusStandings,
} from "@/lib/tournament/matchTeamStats/buildTournamentBonusStandings";
import { formatPoolPoints } from "@/lib/format/poolPoints";

const BONUS_STATUS_KEYS = [
  "most_goals",
  "most_yellow_cards",
  "most_red_cards",
] as const satisfies readonly TournamentBonusCategoryKey[];

function isBonusCategoryKey(key: string): key is TournamentBonusCategoryKey {
  return (BONUS_STATUS_KEYS as readonly string[]).includes(key);
}

function formatTotal(total: number): string {
  return formatPoolPoints(total);
}

function formatBehindLeadersLine(
  gap: number,
  leaders: BonusCategoryStanding["leaders"],
  leaderTotal: number,
): string {
  const gapLabel = formatTotal(gap);
  const totalLabel = formatTotal(leaderTotal);

  if (leaders.length === 1) {
    return `${gapLabel} behind current leader ${leaders[0]!.teamName} (${totalLabel})`;
  }
  if (leaders.length === 2) {
    return `${gapLabel} behind current leaders ${leaders[0]!.teamName} and ${leaders[1]!.teamName} (${totalLabel})`;
  }
  return `${gapLabel} behind ${leaders.length} tied leaders (${totalLabel})`;
}

function formatLeaderNames(
  leaders: BonusCategoryStanding["leaders"],
): string {
  const names = leaders.map((l) => l.teamName);
  if (names.length === 0) return "";
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function categoryPhrase(key: TournamentBonusCategoryKey | null | undefined): string {
  if (key === "most_goals") return "most goals";
  if (key === "most_yellow_cards") return "most yellow cards";
  if (key === "most_red_cards") return "most red cards";
  return "this category";
}

/**
 * Concise live comparison of a participant bonus pick vs current tournament leaders.
 * Returns null when no status line should render (missing pick).
 *
 * Tied first-place teams are all treated as correct outcomes. When the category is
 * settled and the pick matches a published winner, show awarded language.
 */
export function formatBonusPickStandingStatus(input: {
  participantTeamId: string | null | undefined;
  standing: BonusCategoryStanding | null | undefined;
  /** Published winning team ids for this category (empty / omitted = not settled). */
  publishedWinningTeamIds?: readonly string[] | null;
  /** Pool points for this bonus category when awarded. */
  awardedPoints?: number | null;
  categoryKey?: TournamentBonusCategoryKey | null;
}): string | null {
  const teamId = input.participantTeamId?.trim() || null;
  if (!teamId) return null;

  if (!input.standing || !input.standing.isAvailable) {
    return "Current standings unavailable";
  }

  const { leaders, totalsByTeamId } = input.standing;
  if (leaders.length === 0) {
    return "Current standings unavailable";
  }

  const leaderTotal = leaders[0]!.total;
  const participantTotal = totalsByTeamId[teamId] ?? 0;
  const isAmongLeaders = leaders.some((leader) => leader.teamId === teamId);
  const publishedIds = input.publishedWinningTeamIds ?? [];
  const isSettled = publishedIds.length > 0;
  const isPublishedWinner = publishedIds.includes(teamId);
  const points =
    input.awardedPoints != null && Number.isFinite(input.awardedPoints)
      ? input.awardedPoints
      : null;

  if (isAmongLeaders) {
    if (isSettled && isPublishedWinner) {
      if (leaders.length > 1) {
        const tieLine = `${formatLeaderNames(leaders)} tied for ${categoryPhrase(input.categoryKey)}`;
        if (points != null && points > 0) {
          return `${tieLine} — correct pick. Awarded +${formatTotal(points)}`;
        }
        return `${tieLine} — correct pick`;
      }
      if (points != null && points > 0) {
        return `Correct pick — awarded +${formatTotal(points)}`;
      }
      return "Correct pick";
    }
    if (leaders.length === 1) {
      return `Currently leading with ${formatTotal(leaderTotal)}`;
    }
    return `Tied for the tournament lead — correct pick`;
  }

  if (isSettled && !isPublishedWinner) {
    if (leaders.length > 1) {
      return `${formatLeaderNames(leaders)} tied for ${categoryPhrase(input.categoryKey)}`;
    }
  }

  const gap = leaderTotal - participantTotal;
  return formatBehindLeadersLine(gap, leaders, leaderTotal);
}

export type TournamentPickStandingLine = {
  pickKey: RemainingTournamentPick["key"];
  statusLine: string | null;
};

/**
 * Status lines for Tournament Picks rows. Champion never gets a comparison.
 * Pure in-memory — callers pass page-level standings once.
 */
export function buildTournamentPickStandingLines(input: {
  picks: RemainingTournamentPick[] | null | undefined;
  standings: TournamentBonusStandings | null | undefined;
}): TournamentPickStandingLine[] {
  const picks = input.picks ?? [];
  return picks.map((pick) => {
    if (pick.key === "champion" || !isBonusCategoryKey(pick.key)) {
      return { pickKey: pick.key, statusLine: null };
    }
    const standing = input.standings?.[pick.key] ?? null;
    return {
      pickKey: pick.key,
      statusLine: formatBonusPickStandingStatus({
        participantTeamId: pick.teamId,
        standing,
        publishedWinningTeamIds: standing?.publishedWinningTeamIds ?? [],
        awardedPoints: standing?.awardedPoints ?? null,
        categoryKey: pick.key,
      }),
    };
  });
}
