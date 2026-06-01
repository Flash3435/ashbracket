export const JOIN_DISPLAY_NAME_MIN = 1;
export const JOIN_DISPLAY_NAME_MAX = 120;

export const JOIN_DISPLAY_NAME_EMPTY_MESSAGE =
  "Enter the name you want on the leaderboard.";
export const JOIN_DISPLAY_NAME_TOO_LONG_MESSAGE = `Display name must be ${JOIN_DISPLAY_NAME_MAX} characters or fewer.`;
export const JOIN_DISPLAY_NAME_TAKEN_MESSAGE =
  "That name is already being used by another joined participant. Try adding your last initial.";
export const JOIN_DISPLAY_NAME_AMBIGUOUS_MESSAGE =
  "We found more than one open profile with that name in this pool. Ask your organizer which one is yours, or use a slightly different name to join as a new participant.";
export const JOIN_NEEDS_CONFIRMATION_HINT =
  "We found an existing profile with that name. Confirm whether it is yours.";

export function normalizeJoinDisplayName(raw: string): string {
  return raw.trim();
}

export function validateJoinDisplayName(
  raw: string,
): { ok: true; name: string } | { ok: false; message: string } {
  const name = normalizeJoinDisplayName(raw);
  if (name.length < JOIN_DISPLAY_NAME_MIN) {
    return { ok: false, message: JOIN_DISPLAY_NAME_EMPTY_MESSAGE };
  }
  if (name.length > JOIN_DISPLAY_NAME_MAX) {
    return { ok: false, message: JOIN_DISPLAY_NAME_TOO_LONG_MESSAGE };
  }
  return { ok: true, name };
}
