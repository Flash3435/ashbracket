import type { Participant } from "../../types/participant";

export type ParticipantRow = {
  id: string;
  pool_id: string;
  display_name: string;
  email: string | null;
  is_paid: boolean;
  paid_at: string | null;
};

export function mapParticipantRow(row: ParticipantRow): Participant {
  return {
    id: row.id,
    displayName: row.display_name,
    email: row.email ?? "",
    paid: row.is_paid,
  };
}

export function paidAtForInsert(paid: boolean): string | null {
  return paid ? new Date().toISOString() : null;
}
