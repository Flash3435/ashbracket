import { participantPicksCompleteFromDrafts } from "../predictions/participantPicksCompletenessRules";
import type { PredictionKind, Team } from "../../src/types/domain";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";

export type CheerTeamSummary = {
  teamId: string | null;
  name: string;
  countryCode: string | null;
};

export type CheerConfidence = "strong" | "medium" | "none";

export type CheerSuggestion = {
  matchId: string;
  kickoffAt: string | null;
  stageLabel: string;
  groupCode: string | null;
  status: string;
  home: CheerTeamSummary;
  away: CheerTeamSummary;
  cheerForTeamId: string | null;
  cheerForLabel: string;
  reason: string;
  confidence: CheerConfidence;
};

export type WhoToCheerForBuildInput = {
  matches: TournamentMatchPublicRow[];
  slots: KnockoutPickSlotDraft[];
  teams: Team[];
  knockoutBracketPicksUnlocked?: boolean;
  limit?: number;
  nowMs?: number;
};

export type WhoToCheerForResult = {
  suggestions: CheerSuggestion[];
  showIncompleteCta: boolean;
  hasAnyPick: boolean;
};

const DASHBOARD_MATCH_LIMIT = 5;

/** UX-only weighting; does not affect pool scoring. */
export function importanceScoreForKind(kind: PredictionKind): number {
  switch (kind) {
    case "champion":
      return 100;
    case "finalist":
      return 80;
    case "semifinalist":
      return 60;
    case "quarterfinalist":
      return 40;
    case "round_of_16":
    case "round_of_32":
      return 20;
    case "group_winner":
    case "group_runner_up":
    case "third_place_qualifier":
      return 10;
    case "bonus_pick":
      return 5;
    default:
      return 0;
  }
}

export type TeamPickImportance = {
  score: number;
  kind: PredictionKind;
};

function normCode(c: string | null | undefined): string | null {
  if (c == null || c === "") return null;
  return c.trim().toUpperCase();
}

function displayName(team: Team | undefined, fallback: string | null): string {
  if (team?.name?.trim()) return team.name.trim();
  if (fallback?.trim()) return fallback.trim();
  return "TBD";
}

/**
 * Soonest upcoming or live fixtures from the official schedule (not filtered by picks).
 */
export function upcomingTournamentMatches(
  matches: TournamentMatchPublicRow[],
  limit = DASHBOARD_MATCH_LIMIT,
  options?: { nowMs?: number; includePastScheduled?: boolean },
): TournamentMatchPublicRow[] {
  const nowMs = options?.nowMs ?? Date.now();
  const includePastScheduled = options?.includePastScheduled ?? false;

  const kickMs = (iso: string | null | undefined) => {
    if (iso == null || iso === "") return Number.POSITIVE_INFINITY;
    const t = new Date(iso).getTime();
    return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
  };

  const relevant = matches.filter((m) => {
    if (m.status === "live" || m.status === "postponed") return true;
    if (m.status === "scheduled") {
      if (includePastScheduled) return true;
      const t = kickMs(m.kickoff_at);
      return t === Number.POSITIVE_INFINITY || t >= nowMs;
    }
    return false;
  });

  return [...relevant]
    .sort((a, b) => {
      const liveRank = (s: string) => (s === "live" ? 0 : 1);
      const lr = liveRank(a.status) - liveRank(b.status);
      if (lr !== 0) return lr;
      return kickMs(a.kickoff_at) - kickMs(b.kickoff_at);
    })
    .slice(0, limit);
}

/** Highest UX importance per team id from saved pick slots. */
export function buildTeamImportanceById(
  slots: KnockoutPickSlotDraft[],
): Map<string, TeamPickImportance> {
  const out = new Map<string, TeamPickImportance>();
  for (const slot of slots) {
    const teamId = slot.teamId.trim();
    if (!teamId) continue;
    const score = importanceScoreForKind(slot.predictionKind);
    if (score <= 0) continue;
    const prev = out.get(teamId);
    if (!prev || score > prev.score) {
      out.set(teamId, { score, kind: slot.predictionKind });
    }
  }
  return out;
}

export function participantHasAnyPick(slots: KnockoutPickSlotDraft[]): boolean {
  return slots.some((s) => s.teamId.trim() !== "");
}

function friendlyStageForKind(kind: PredictionKind): string {
  switch (kind) {
    case "champion":
      return "Champion";
    case "finalist":
      return "the final";
    case "semifinalist":
      return "the semifinals";
    case "quarterfinalist":
      return "the quarterfinals";
    case "round_of_16":
      return "the Round of 16";
    case "round_of_32":
      return "the Round of 32";
    case "group_winner":
    case "group_runner_up":
    case "third_place_qualifier":
      return "your bracket";
    case "bonus_pick":
      return "a bonus question";
    default:
      return "your bracket";
  }
}

export function reasonForTeamPick(
  teamName: string,
  importance: TeamPickImportance,
): string {
  const stage = friendlyStageForKind(importance.kind);
  switch (importance.kind) {
    case "champion":
      return `You picked ${teamName} as champion.`;
    case "finalist":
      return `You picked ${teamName} to reach the final.`;
    case "semifinalist":
      return `You picked ${teamName} to reach ${stage}.`;
    case "quarterfinalist":
      return `You picked ${teamName} to reach ${stage}.`;
    case "round_of_16":
    case "round_of_32":
      return `You picked ${teamName} to reach ${stage}.`;
    case "group_winner":
    case "group_runner_up":
      return `You have ${teamName} advancing from the group stage in your bracket.`;
    case "third_place_qualifier":
      return `You picked ${teamName} as a third-place advancer.`;
    case "bonus_pick":
      return `You picked ${teamName} in ${stage}.`;
    default:
      return `You picked ${teamName} in your bracket.`;
  }
}

const COMPLICATED_MARGIN = 15;

export type CheerDecision = {
  cheerForTeamId: string | null;
  cheerForLabel: string;
  reason: string;
  confidence: CheerConfidence;
};

export function decideCheerForMatchSides(
  home: CheerTeamSummary,
  away: CheerTeamSummary,
  importanceByTeamId: Map<string, TeamPickImportance>,
): CheerDecision {
  const homeImp = home.teamId ? importanceByTeamId.get(home.teamId) : undefined;
  const awayImp = away.teamId ? importanceByTeamId.get(away.teamId) : undefined;
  const homeScore = homeImp?.score ?? 0;
  const awayScore = awayImp?.score ?? 0;

  if (homeScore === 0 && awayScore === 0) {
    return {
      cheerForTeamId: null,
      cheerForLabel: "No strong bracket angle",
      reason: "This match does not strongly affect your current picks.",
      confidence: "none",
    };
  }

  if (
    homeScore > 0 &&
    awayScore > 0 &&
    Math.abs(homeScore - awayScore) < COMPLICATED_MARGIN
  ) {
    return {
      cheerForTeamId: null,
      cheerForLabel: "Either result helps part of your bracket",
      reason: "You have both teams advancing in your bracket.",
      confidence: "medium",
    };
  }

  const favorHome = homeScore > awayScore;
  const picked = favorHome ? homeImp! : awayImp!;
  const team = favorHome ? home : away;

  return {
    cheerForTeamId: team.teamId,
    cheerForLabel: team.name,
    reason: reasonForTeamPick(team.name, picked),
    confidence: picked.kind === "champion" || picked.kind === "finalist" ? "strong" : "medium",
  };
}

function resolveSide(
  countryCode: string | null,
  teamName: string | null,
  teamByCountry: Map<string, Team>,
): CheerTeamSummary {
  const code = normCode(countryCode);
  const team = code ? teamByCountry.get(code) : undefined;
  return {
    teamId: team?.id ?? null,
    name: displayName(team, teamName),
    countryCode: code,
  };
}

export function buildCheerSuggestionForMatch(
  m: TournamentMatchPublicRow,
  slots: KnockoutPickSlotDraft[],
  teams: Team[],
): CheerSuggestion {
  const teamByCountry = new Map<string, Team>();
  for (const t of teams) {
    const code = normCode(t.countryCode);
    if (code) teamByCountry.set(code, t);
  }
  const importanceByTeamId = buildTeamImportanceById(slots);
  const home = resolveSide(m.home_country_code, m.home_team_name, teamByCountry);
  const away = resolveSide(m.away_country_code, m.away_team_name, teamByCountry);
  const decision = decideCheerForMatchSides(home, away, importanceByTeamId);

  return {
    matchId: m.match_id,
    kickoffAt: m.kickoff_at,
    stageLabel: m.stage_label,
    groupCode: m.group_code,
    status: m.status,
    home,
    away,
    cheerForTeamId: decision.cheerForTeamId,
    cheerForLabel: decision.cheerForLabel,
    reason: decision.reason,
    confidence: decision.confidence,
  };
}

export function buildWhoToCheerFor(input: WhoToCheerForBuildInput): WhoToCheerForResult {
  const limit = input.limit ?? DASHBOARD_MATCH_LIMIT;
  const upcoming = upcomingTournamentMatches(input.matches, limit, {
    nowMs: input.nowMs,
  });
  const hasAnyPick = participantHasAnyPick(input.slots);
  const picksComplete = participantPicksCompleteFromDrafts(input.slots, {
    knockoutBracketPicksUnlocked: input.knockoutBracketPicksUnlocked,
  });

  const suggestions = upcoming.map((m) =>
    buildCheerSuggestionForMatch(m, input.slots, input.teams),
  );

  return {
    suggestions,
    showIncompleteCta: hasAnyPick && !picksComplete,
    hasAnyPick,
  };
}
