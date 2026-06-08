import type { BracketCompletionDiagnosticRow } from "@/lib/communications/picksCompleteness";
import type { Participant, ParticipantInviteStatus } from "../../types/participant";

export type ParticipantPicksStatusKind =
  | "invite_pending"
  | "not_joined"
  | "not_started"
  | "in_progress"
  | "complete";

export type ParticipantPicksStatus = {
  kind: ParticipantPicksStatusKind;
  label: string;
  picksComplete: boolean;
  isIncomplete: boolean;
  savedPickCount: number;
  lastSavedAt: string | null;
};

export type ParticipantWithPicksStatus = Participant & {
  picksStatus: ParticipantPicksStatus | null;
};

function countSavedPicks(
  savedPredictionsByKind: BracketCompletionDiagnosticRow["saved_predictions_by_kind"],
): number {
  return Object.values(savedPredictionsByKind).reduce((sum, value) => {
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
}

export function deriveParticipantPicksStatus(args: {
  inviteStatus: ParticipantInviteStatus;
  diagnostic: Pick<
    BracketCompletionDiagnosticRow,
    "saved_predictions_by_kind" | "picks_complete"
  >;
  lastSavedAt?: string | null;
}): ParticipantPicksStatus {
  const savedPickCount = countSavedPicks(args.diagnostic.saved_predictions_by_kind);
  const lastSavedAt = args.lastSavedAt ?? null;

  if (args.inviteStatus === "invited") {
    return {
      kind: "invite_pending",
      label: "Invite pending",
      picksComplete: false,
      isIncomplete: true,
      savedPickCount,
      lastSavedAt,
    };
  }

  if (args.inviteStatus === "manual") {
    return {
      kind: "not_joined",
      label: "Not joined",
      picksComplete: false,
      isIncomplete: true,
      savedPickCount,
      lastSavedAt,
    };
  }

  if (args.diagnostic.picks_complete) {
    return {
      kind: "complete",
      label: "Complete",
      picksComplete: true,
      isIncomplete: false,
      savedPickCount,
      lastSavedAt,
    };
  }

  if (savedPickCount === 0) {
    return {
      kind: "not_started",
      label: "Not started",
      picksComplete: false,
      isIncomplete: true,
      savedPickCount,
      lastSavedAt,
    };
  }

  return {
    kind: "in_progress",
    label: "In progress",
    picksComplete: false,
    isIncomplete: true,
    savedPickCount,
    lastSavedAt,
  };
}
