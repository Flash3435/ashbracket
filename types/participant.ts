export type ParticipantInviteStatus = "joined" | "invited" | "manual";

export type Participant = {
  id: string;
  displayName: string;
  email: string;
  paid: boolean;
  /** Signed in and linked to this row. */
  inviteStatus: ParticipantInviteStatus;
  /** When an invite email was last sent (if ever). */
  inviteLastSentAt: string | null;
};
