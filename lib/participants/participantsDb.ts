import type {
  Participant,
  ParticipantInviteStatus,
} from "../../types/participant";

export type ParticipantRow = {
  id: string;
  pool_id: string;
  display_name: string;
  email: string | null;
  is_paid: boolean;
  paid_at: string | null;
  user_id: string | null;
  invite_pending: boolean;
  invite_last_sent_at: string | null;
};

function inviteStatusFromRow(row: ParticipantRow): ParticipantInviteStatus {
  if (row.user_id) return "joined";
  if (row.invite_pending) return "invited";
  return "manual";
}

export function mapParticipantRow(row: ParticipantRow): Participant {
  return {
    id: row.id,
    displayName: row.display_name,
    email: row.email ?? "",
    paid: row.is_paid,
    inviteStatus: inviteStatusFromRow(row),
    inviteLastSentAt: row.invite_last_sent_at,
  };
}

export type ParticipantPaymentView = {
  id: string;
  displayName: string;
  email: string;
  paid: boolean;
  paidAt: string | null;
};

/** Columns needed for the admin payments table (subset of participants). */
export type ParticipantPaymentRow = {
  id: string;
  display_name: string;
  email: string | null;
  is_paid: boolean;
  paid_at: string | null;
};

export function mapParticipantPaymentRow(
  row: ParticipantPaymentRow,
): ParticipantPaymentView {
  return {
    id: row.id,
    displayName: row.display_name,
    email: row.email ?? "",
    paid: row.is_paid,
    paidAt: row.paid_at,
  };
}

export function paidAtForInsert(paid: boolean): string | null {
  return paid ? new Date().toISOString() : null;
}
