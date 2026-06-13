import { recapCalendarDateYmdEdmonton } from "../poolActivity/recapCalendarDate";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { Team } from "../../src/types/domain";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import {
  buildCheerSuggestionForMatch,
  DASHBOARD_MATCH_LIMIT,
  type CheerSuggestion,
} from "./buildWhoToCheerFor";

export const MATCHDAY_DASHBOARD_LIMIT = DASHBOARD_MATCH_LIMIT;

function kickoffSortMs(iso: string | null | undefined): number {
  if (iso == null || iso === "") return Number.POSITIVE_INFINITY;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

function sortUpcomingMatchesLiveFirst(
  matches: TournamentMatchPublicRow[],
): TournamentMatchPublicRow[] {
  return [...matches].sort((a, b) => {
    const liveRank = (s: string) => (s === "live" ? 0 : 1);
    const lr = liveRank(a.status) - liveRank(b.status);
    if (lr !== 0) return lr;
    return kickoffSortMs(a.kickoff_at) - kickoffSortMs(b.kickoff_at);
  });
}

export type MatchdayBuildInput = {
  matches: TournamentMatchPublicRow[];
  slots: KnockoutPickSlotDraft[];
  teams: Team[];
  limit?: number;
  nowMs?: number;
};

export type MatchdayResult = {
  suggestions: CheerSuggestion[];
  hasMatchesToday: boolean;
  usingUpcomingFallback: boolean;
};

function kickoffEdmontonYmd(iso: string | null | undefined): string | null {
  if (iso == null || iso === "") return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return recapCalendarDateYmdEdmonton(d);
}

function isLiveOrPostponed(m: TournamentMatchPublicRow): boolean {
  return m.status === "live" || m.status === "postponed";
}

function isTodayMatch(m: TournamentMatchPublicRow, todayYmd: string): boolean {
  const ymd = kickoffEdmontonYmd(m.kickoff_at);
  return ymd != null && ymd === todayYmd;
}

function isFutureScheduled(m: TournamentMatchPublicRow, nowMs: number): boolean {
  if (m.status !== "scheduled") return false;
  if (m.kickoff_at == null || m.kickoff_at === "") return true;
  const t = new Date(m.kickoff_at).getTime();
  return Number.isNaN(t) || t >= nowMs;
}

function dedupeByMatchId(matches: TournamentMatchPublicRow[]): TournamentMatchPublicRow[] {
  const seen = new Set<string>();
  const out: TournamentMatchPublicRow[] = [];
  for (const m of matches) {
    if (seen.has(m.match_id)) continue;
    seen.add(m.match_id);
    out.push(m);
  }
  return out;
}

/**
 * Post-lock matchday rows: live first, then today's fixtures (Edmonton calendar day),
 * then upcoming if nothing is scheduled today. Max 3 rows for the dashboard card.
 */
export function selectMatchdayMatches(
  matches: TournamentMatchPublicRow[],
  options?: { nowMs?: number; limit?: number },
): {
  selected: TournamentMatchPublicRow[];
  hasMatchesToday: boolean;
  usingUpcomingFallback: boolean;
} {
  const nowMs = options?.nowMs ?? Date.now();
  const limit = options?.limit ?? MATCHDAY_DASHBOARD_LIMIT;
  const todayYmd = recapCalendarDateYmdEdmonton(new Date(nowMs));

  const live = sortUpcomingMatchesLiveFirst(
    matches.filter(isLiveOrPostponed),
  );

  const todayNonLive = sortUpcomingMatchesLiveFirst(
    matches.filter(
      (m) => !isLiveOrPostponed(m) && isTodayMatch(m, todayYmd),
    ),
  );

  const hasMatchesToday = live.length > 0 || todayNonLive.length > 0;

  let pool: TournamentMatchPublicRow[];
  let usingUpcomingFallback = false;

  if (hasMatchesToday) {
    pool = dedupeByMatchId([...live, ...todayNonLive]);
  } else {
    usingUpcomingFallback = true;
    pool = sortUpcomingMatchesLiveFirst(
      matches.filter((m) => isFutureScheduled(m, nowMs) || isLiveOrPostponed(m)),
    );
  }

  return {
    selected: pool.slice(0, limit),
    hasMatchesToday,
    usingUpcomingFallback,
  };
}

export function buildMatchday(input: MatchdayBuildInput): MatchdayResult {
  const { selected, hasMatchesToday, usingUpcomingFallback } = selectMatchdayMatches(
    input.matches,
    { nowMs: input.nowMs, limit: input.limit ?? MATCHDAY_DASHBOARD_LIMIT },
  );

  const suggestions = selected.map((m) =>
    buildCheerSuggestionForMatch(m, input.slots, input.teams),
  );

  return {
    suggestions,
    hasMatchesToday,
    usingUpcomingFallback,
  };
}

/** User-facing bracket-wants label for the matchday card. */
export function matchdayBracketWantsLabel(s: CheerSuggestion): {
  primary: string;
  muted: boolean;
} {
  if (s.cheerForLabel === "Both teams are in your bracket") {
    return { primary: "Mixed impact", muted: false };
  }
  if (s.confidence === "none" || s.cheerForTeamId == null) {
    return { primary: "No strong angle", muted: true };
  }
  return { primary: s.cheerForLabel, muted: false };
}
