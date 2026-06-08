import type { ParticipantPicksStatus } from "@/lib/admin/participantPickStatus";

export type RemoveParticipantWarningInput = {
  paid: boolean;
  picksStatus: ParticipantPicksStatus | null;
};

/** Extra warnings shown in the admin confirmation modal before removal. */
export function buildRemoveParticipantWarnings(
  input: RemoveParticipantWarningInput,
): string[] {
  const warnings: string[] = [];
  if (input.paid) {
    warnings.push("This participant is marked as paid for this pool.");
  }
  const savedPickCount = input.picksStatus?.savedPickCount ?? 0;
  if (savedPickCount > 0) {
    warnings.push(
      `They have ${savedPickCount} saved pick${savedPickCount === 1 ? "" : "s"} in this pool.`,
    );
  }
  return warnings;
}

export function formatRemoveParticipantSuccessMessage(displayName: string): string {
  const name = displayName.trim() || "Participant";
  return `${name} was removed from this pool.`;
}

export const REMOVE_PARTICIPANT_ALREADY_GONE_MESSAGE =
  "This participant is no longer in the pool.";

/** Display label for modal headline (name preferred, email fallback). */
export function removeParticipantModalSubject(args: {
  displayName: string;
  email: string;
}): string {
  const name = args.displayName.trim();
  const email = args.email.trim();
  if (name && email) return `${name} (${email})`;
  return name || email || "this participant";
}

/** Row matches the pool-scoped participant delete filter (participants.id + pool_id). */
export function isParticipantRemovalTarget(args: {
  targetParticipantId: string;
  targetPoolId: string;
  rowParticipantId: string;
  rowPoolId: string;
}): boolean {
  return (
    args.rowParticipantId === args.targetParticipantId &&
    args.rowPoolId === args.targetPoolId
  );
}

/** Other pools' participant rows must not match a removal scoped to one pool. */
export function otherPoolParticipantUntouched(args: {
  removalPoolId: string;
  rowPoolId: string;
}): boolean {
  return args.rowPoolId !== args.removalPoolId;
}
