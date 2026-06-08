import type { PublicParticipantPick } from "../../types/publicParticipant";

export function formatPickSlot(pick: PublicParticipantPick): string {
  const parts: string[] = [];
  if (pick.groupCode) parts.push(`Group ${pick.groupCode}`);
  if (pick.slotKey) parts.push(pick.slotKey);
  if (pick.bonusKey) parts.push(pick.bonusKey);
  return parts.length > 0 ? parts.join(" · ") : "—";
}
