export type RecipientPreset =
  | "all"
  | "unpaid"
  | "incomplete_picks"
  | "selected";

export type PoolCommunicationParticipant = {
  id: string;
  displayName: string;
  email: string;
  isPaid: boolean;
  picksComplete: boolean;
};

export type ResolvedEmailTarget = {
  id: string;
  displayName: string;
  email: string;
};

export function resolvePoolEmailTargets(
  participants: PoolCommunicationParticipant[],
  preset: RecipientPreset,
  selectedParticipantIds: string[],
): {
  targets: ResolvedEmailTarget[];
  skippedNoEmail: { id: string; displayName: string }[];
} {
  const skippedNoEmail = participants
    .filter((p) => !p.email.trim())
    .map((p) => ({ id: p.id, displayName: p.displayName }));

  let pool = participants.filter((p) => p.email.trim());

  if (preset === "unpaid") {
    pool = pool.filter((p) => !p.isPaid);
  } else if (preset === "incomplete_picks") {
    pool = pool.filter((p) => !p.picksComplete);
  } else if (preset === "selected") {
    const sel = new Set(selectedParticipantIds.map((x) => x.trim()));
    pool = pool.filter((p) => sel.has(p.id));
  }

  const targets: ResolvedEmailTarget[] = pool.map((p) => ({
    id: p.id,
    displayName: p.displayName,
    email: p.email.trim(),
  }));

  return { targets, skippedNoEmail };
}
