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
  /** Short label for placeholders (e.g. "1A", "Third-place qualifier", "TBD"). */
  displayLabel: string;
  /** Optional second line for placeholder slots (UX copy only). */
  placeholderSubtext?: string;
  /** True when the side is a third-place / official R32 slot not yet filled in Stage 3. */
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
    /** Mirrors `knockoutBracketPicksUnlocked` (Stage 3 / official R32 gate). */
    knockoutBracketUnlocked: boolean;
    /** Pool rules and stage guidance for the bracket view. */
    notes: readonly string[];
  };
};
