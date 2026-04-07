const LABELS: Record<string, string> = {
  group_winner: "Group winner",
  group_runner_up: "Group runner-up",
  round_of_32: "Round of 32",
  round_of_16: "Round of 16",
  quarterfinalist: "Quarter-finalist",
  semifinalist: "Semi-finalist",
  finalist: "Finalist",
  champion: "Champion",
  third_place_qualifier: "Third-place advancer (qualifies — not a bracket slot)",
  bonus_pick: "Bonus pick",
};

export function labelPredictionKind(kind: string | null | undefined): string {
  if (kind == null || kind === "") return "—";
  return LABELS[kind] ?? kind.replace(/_/g, " ");
}
