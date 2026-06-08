/** Short labels for bonus questions in the participant picks flow. */
export const PARTICIPANT_BONUS_LABELS: Record<string, string> = {
  most_goals: "Most goals in the tournament",
  most_yellow_cards: "Most yellow cards",
  most_red_cards: "Most red cards",
  golden_boot: "Golden Boot (top scorer)",
};

export function labelParticipantBonusPick(bonusKey: string): string {
  const key = (bonusKey ?? "").trim();
  if (!key) return "Bonus pick";
  return (
    PARTICIPANT_BONUS_LABELS[key] ?? key.replace(/_/g, " ")
  );
}
