/**
 * Normalized participant bracket for display (derived from saved picks).
 * Knockout progression picks are stored as independent round sets; winners
 * between paired slots are inferred when exactly one side appears in the next round.
 */

export type BracketSideResolved = {
  /** Official pick slot key when this side maps to a stored `round_of_*` row. */
  slotKey: string | null;
  pickRowKey: string | null;
  teamId: string | null;
  /** Short label for placeholders (e.g. "1A", "Best 3rd (undetermined)", "TBD"). */
  displayLabel: string;
  /** True when the side depends on Annex C routing and we could not resolve it. */
  undeterminedThird?: boolean;
};

export type BracketMatchResolved = {
  matchKey: string;
  fifaMatchNo: number;
  home: BracketSideResolved;
  away: BracketSideResolved;
  winnerTeamId: string | null;
};

export type ParticipantBracketModel = {
  roundOf32: BracketMatchResolved[];
  roundOf16: BracketMatchResolved[];
  quarterfinals: BracketMatchResolved[];
  semifinals: BracketMatchResolved[];
  final: BracketMatchResolved[];
  champion: {
    teamId: string | null;
    pickRowKey: string | null;
  };
  meta: {
    hasAnyPicks: boolean;
    /** Annex C row found for the eight advancing third-place groups. */
    thirdComboResolved: boolean;
    /** Short hints for UI (e.g. third-place routing). */
    notes: readonly string[];
  };
};
