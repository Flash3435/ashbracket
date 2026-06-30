import { classifyParticipantKnockoutMatchExposure } from "../participant/bracketMatchImpact";
import { isFinishedMatchWithScores } from "../tournament/matchScoreDisplay";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { Team } from "../../src/types/domain";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";

export type MatchExposureSwing = "big" | "medium" | "small";

export type KnockoutMatchExposureFixture = {
  matchId: string;
  matchCode: string;
  kickoffAt: string | null;
  stageLabel: string;
  status: string;
  homeTeamName: string;
  homeCountryCode: string;
  awayTeamName: string;
  awayCountryCode: string;
  homeHelpsCount: number;
  awayHelpsCount: number;
  neutralCount: number;
  swing: MatchExposureSwing | null;
  hasExposure: boolean;
};

export type KnockoutMatchExposure = {
  fixtures: KnockoutMatchExposureFixture[];
  totalCompletedBrackets: number;
  incompleteCount: number;
};

export type ParticipantBracketForExposure = {
  participantId: string;
  slots: KnockoutPickSlotDraft[];
};

function normCode(c: string | null | undefined): string | null {
  if (c == null || c === "") return null;
  return c.trim().toUpperCase();
}

function kickoffSortMs(iso: string | null | undefined): number {
  if (iso == null || iso === "") return Number.POSITIVE_INFINITY;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

function isKnockoutStageMatch(m: TournamentMatchPublicRow): boolean {
  return m.stage_code !== "group";
}

function isUpcomingOrLiveMatch(m: TournamentMatchPublicRow): boolean {
  return m.status === "live" || m.status === "scheduled" || m.status === "postponed";
}

function matchHasKnownTeams(m: TournamentMatchPublicRow, teams: Team[]): boolean {
  const homeCode = normCode(m.home_country_code);
  const awayCode = normCode(m.away_country_code);
  if (!homeCode || !awayCode) return false;

  const teamByCountry = new Map<string, Team>();
  for (const team of teams) {
    const code = normCode(team.countryCode);
    if (code) teamByCountry.set(code, team);
  }

  if (!teamByCountry.has(homeCode) || !teamByCountry.has(awayCode)) return false;

  const homeName = m.home_team_name?.trim();
  const awayName = m.away_team_name?.trim();
  if (!homeName || homeName === "TBD" || !awayName || awayName === "TBD") return false;

  return true;
}

export function isEligibleKnockoutExposureMatch(
  m: TournamentMatchPublicRow,
  teams: Team[],
): boolean {
  if (!isKnockoutStageMatch(m)) return false;
  if (!isUpcomingOrLiveMatch(m)) return false;
  if (isFinishedMatchWithScores(m)) return false;
  return matchHasKnownTeams(m, teams);
}

export function sortKnockoutExposureMatches(
  matches: TournamentMatchPublicRow[],
): TournamentMatchPublicRow[] {
  return [...matches].sort((a, b) => {
    const liveRank = (status: string) => {
      if (status === "live") return 0;
      if (status === "postponed") return 1;
      return 2;
    };
    const lr = liveRank(a.status) - liveRank(b.status);
    if (lr !== 0) return lr;
    const kickDiff = kickoffSortMs(a.kickoff_at) - kickoffSortMs(b.kickoff_at);
    if (kickDiff !== 0) return kickDiff;
    return a.match_code.localeCompare(b.match_code);
  });
}

export function classifyMatchExposureSwing(input: {
  homeHelpsCount: number;
  awayHelpsCount: number;
  totalCompletedBrackets: number;
}): MatchExposureSwing | null {
  const { homeHelpsCount, awayHelpsCount, totalCompletedBrackets } = input;
  if (totalCompletedBrackets <= 0) return null;

  const affectedOverall = homeHelpsCount + awayHelpsCount;
  if (affectedOverall <= 0) return null;

  const maxSide = Math.max(homeHelpsCount, awayHelpsCount);
  const overallPct = affectedOverall / totalCompletedBrackets;
  const maxSidePct = maxSide / totalCompletedBrackets;

  if (maxSidePct >= 0.4 || overallPct >= 0.6) return "big";
  if (overallPct >= 0.2) return "medium";
  return "small";
}

function fixtureFromMatch(
  m: TournamentMatchPublicRow,
  counts: {
    homeHelpsCount: number;
    awayHelpsCount: number;
    neutralCount: number;
    totalCompletedBrackets: number;
  },
): KnockoutMatchExposureFixture {
  const homeHelpsCount = counts.homeHelpsCount;
  const awayHelpsCount = counts.awayHelpsCount;
  const neutralCount = counts.neutralCount;
  const hasExposure = homeHelpsCount > 0 || awayHelpsCount > 0;

  return {
    matchId: m.match_id,
    matchCode: m.match_code,
    kickoffAt: m.kickoff_at,
    stageLabel: m.stage_label,
    status: m.status,
    homeTeamName: m.home_team_name?.trim() || "TBD",
    homeCountryCode: normCode(m.home_country_code) ?? "",
    awayTeamName: m.away_team_name?.trim() || "TBD",
    awayCountryCode: normCode(m.away_country_code) ?? "",
    homeHelpsCount,
    awayHelpsCount,
    neutralCount,
    swing: classifyMatchExposureSwing({
      homeHelpsCount,
      awayHelpsCount,
      totalCompletedBrackets: counts.totalCompletedBrackets,
    }),
    hasExposure,
  };
}

/**
 * Aggregates pool-level knockout match exposure across complete participant brackets.
 */
export function buildKnockoutMatchExposure(input: {
  matches: TournamentMatchPublicRow[];
  completeParticipantBrackets: ParticipantBracketForExposure[];
  teams: Team[];
  incompleteCount?: number;
}): KnockoutMatchExposure {
  const totalCompletedBrackets = input.completeParticipantBrackets.length;
  const incompleteCount = input.incompleteCount ?? 0;
  const eligible = sortKnockoutExposureMatches(
    input.matches.filter((m) => isEligibleKnockoutExposureMatch(m, input.teams)),
  );

  const fixtures: KnockoutMatchExposureFixture[] = [];

  for (const m of eligible) {
    let homeHelpsCount = 0;
    let awayHelpsCount = 0;
    let neutralCount = 0;

    for (const bracket of input.completeParticipantBrackets) {
      const side = classifyParticipantKnockoutMatchExposure(
        m,
        bracket.slots,
        input.teams,
        input.matches,
      );
      if (side === "home") homeHelpsCount += 1;
      else if (side === "away") awayHelpsCount += 1;
      else neutralCount += 1;
    }

    fixtures.push(
      fixtureFromMatch(m, {
        homeHelpsCount,
        awayHelpsCount,
        neutralCount,
        totalCompletedBrackets,
      }),
    );
  }

  return {
    fixtures,
    totalCompletedBrackets,
    incompleteCount,
  };
}
