import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import { isFinishedMatchWithScores } from "../tournament/matchScoreDisplay";

const KNOCKOUT_PATH_KINDS = new Set<KnockoutPickSlotDraft["predictionKind"]>([
  "round_of_32",
  "round_of_16",
  "quarterfinalist",
  "semifinalist",
  "finalist",
  "champion",
]);

/** Any non-group tournament match with teams, kickoff, or a result. */
export function hasKnockoutScheduleActivity(
  matches: TournamentMatchPublicRow[] | null | undefined,
): boolean {
  if (!matches?.length) return false;
  return matches.some((m) => {
    if (m.stage_code === "group") return false;
    if (isFinishedMatchWithScores(m) || m.status === "live") return true;
    const home = (m.home_country_code ?? "").trim();
    const away = (m.away_country_code ?? "").trim();
    if (home.length >= 3 && away.length >= 3) return true;
    return Boolean(m.kickoff_at?.trim());
  });
}

export function hasParticipantKnockoutPathPicks(
  slots: KnockoutPickSlotDraft[],
): boolean {
  return slots.some(
    (s) => KNOCKOUT_PATH_KINDS.has(s.predictionKind) && s.teamId.trim() !== "",
  );
}

export type LiveBracketTrackerModeInput = {
  knockoutBracketPicksUnlocked: boolean;
  tournamentMatches?: TournamentMatchPublicRow[] | null;
  slots: KnockoutPickSlotDraft[];
};

/**
 * True when the bracket view should use the live tracker instead of the pre-R32 preview.
 * Knockout tracking is available once fixtures/results exist or the participant has knockout-path picks.
 */
export function shouldUseLiveBracketTracker(input: LiveBracketTrackerModeInput): boolean {
  if (input.knockoutBracketPicksUnlocked) return true;
  if (hasKnockoutScheduleActivity(input.tournamentMatches)) return true;
  if (hasParticipantKnockoutPathPicks(input.slots)) return true;
  return false;
}

/**
 * Treat the bracket as fully unlocked for path resolution (later-round participant teams,
 * gradual R32 fixtures). Broader than organizer `knockoutBracketPicksUnlocked` alone.
 */
export function resolveFullBracketUnlockedForTracker(
  input: LiveBracketTrackerModeInput,
): boolean {
  return shouldUseLiveBracketTracker(input);
}
