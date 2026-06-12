import type { MatchGoalInput } from "./types";

export type ValidatedMatchGoalPayload = {
  playerName: string;
  teamId: string | null;
  minute: number | null;
  stoppageMinute: number | null;
  isOwnGoal: boolean;
};

export function validateMatchGoalPayload(
  input: MatchGoalInput,
): { ok: true; value: ValidatedMatchGoalPayload } | { ok: false; error: string } {
  const playerName = input.playerName.trim();
  if (!playerName) {
    return { ok: false, error: "Player name is required." };
  }

  const minute = input.minute;
  if (minute != null) {
    if (!Number.isInteger(minute) || minute < 0 || minute > 130) {
      return { ok: false, error: "Minute must be an integer from 0 to 130." };
    }
  }

  const stoppageMinute = input.stoppageMinute;
  if (stoppageMinute != null) {
    if (!Number.isInteger(stoppageMinute) || stoppageMinute < 0) {
      return { ok: false, error: "Stoppage minute must be a non-negative integer." };
    }
  }

  const teamId = input.teamId?.trim() ? input.teamId.trim() : null;

  return {
    ok: true,
    value: {
      playerName,
      teamId,
      minute,
      stoppageMinute,
      isOwnGoal: Boolean(input.isOwnGoal),
    },
  };
}
