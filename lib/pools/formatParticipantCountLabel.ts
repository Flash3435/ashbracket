/** e.g. "1 participant" / "12 participants" */
export function formatParticipantCountLabel(count: number): string {
  const n = Math.max(0, Math.floor(count));
  return n === 1 ? "1 participant" : `${n} participants`;
}
