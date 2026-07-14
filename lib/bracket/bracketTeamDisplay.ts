import { eliminatedTeamIdsFromMatches } from "../participant/bracketMatchImpact";
import { isFinishedMatchWithScores } from "../tournament/matchScoreDisplay";
import type { Team } from "../../src/types/domain";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";

export type BracketTeamDisplayStatus = "empty" | "alive" | "eliminated";

const KNOCKOUT_ELIMINATION_STAGE_ORDER = [
  "round_of_32",
  "round_of_16",
  "quarterfinal",
  "semifinal",
  "final",
] as const;

const KNOCKOUT_ELIMINATION_STAGE_LABEL: Record<
  (typeof KNOCKOUT_ELIMINATION_STAGE_ORDER)[number],
  string
> = {
  round_of_32: "Round of 32",
  round_of_16: "Round of 16",
  quarterfinal: "Quarter-finals",
  semifinal: "Semi-finals",
  final: "Final",
};

function normalizeCountryCode(code: string | null | undefined): string | null {
  const c = (code ?? "").trim().toUpperCase();
  return c || null;
}

/**
 * Round label where a team was officially eliminated (earliest finished knockout loss).
 */
export function findTeamKnockoutEliminationRoundLabel(
  teamId: string | null | undefined,
  matches: TournamentMatchPublicRow[] | null | undefined,
  teams: Team[],
): string | null {
  const tid = teamId?.trim();
  if (!tid || !matches?.length) return null;
  const team = teams.find((t) => t.id === tid);
  const teamCode = normalizeCountryCode(team?.countryCode);
  if (!teamCode) return null;

  let best: { order: number; label: string } | null = null;
  for (const m of matches) {
    if (m.stage_code === "group" || !isFinishedMatchWithScores(m)) continue;
    const winner = normalizeCountryCode(m.winner_country_code);
    const home = normalizeCountryCode(m.home_country_code);
    const away = normalizeCountryCode(m.away_country_code);
    if (!winner || winner === teamCode) continue;
    if (home !== teamCode && away !== teamCode) continue;

    const stage = m.stage_code as (typeof KNOCKOUT_ELIMINATION_STAGE_ORDER)[number];
    const order = KNOCKOUT_ELIMINATION_STAGE_ORDER.indexOf(stage);
    if (order < 0) continue;
    const label =
      KNOCKOUT_ELIMINATION_STAGE_LABEL[stage] ??
      m.stage_label?.trim() ??
      stage;
    if (!best || order < best.order) {
      best = { order, label };
    }
  }
  return best?.label ?? null;
}

export function buildEliminatedTeamIdSet(
  matches: TournamentMatchPublicRow[] | null | undefined,
  teams: Team[],
): Set<string> {
  if (!matches?.length) return new Set();
  return eliminatedTeamIdsFromMatches(matches, teams);
}

export function bracketTeamDisplayStatus(
  teamId: string | null | undefined,
  eliminatedTeamIds: Set<string>,
): BracketTeamDisplayStatus {
  const tid = teamId?.trim();
  if (!tid) return "empty";
  return eliminatedTeamIds.has(tid) ? "eliminated" : "alive";
}

export type BracketSideVisualState = {
  status: BracketTeamDisplayStatus;
  /** Participant bracket path winner — suppressed when eliminated. */
  emphasizePathWinner: boolean;
};

export function resolveBracketSideVisualState(args: {
  teamId: string | null | undefined;
  eliminatedTeamIds: Set<string>;
  participantPathWinnerTeamId: string | null;
}): BracketSideVisualState {
  const status = bracketTeamDisplayStatus(args.teamId, args.eliminatedTeamIds);
  const tid = args.teamId?.trim() || null;
  const emphasizePathWinner =
    status === "alive" &&
    Boolean(tid && args.participantPathWinnerTeamId && tid === args.participantPathWinnerTeamId);
  return { status, emphasizePathWinner };
}
