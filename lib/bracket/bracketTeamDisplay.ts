import { eliminatedTeamIdsFromMatches } from "../participant/bracketMatchImpact";
import type { Team } from "../../src/types/domain";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";

export type BracketTeamDisplayStatus = "empty" | "alive" | "eliminated";

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
