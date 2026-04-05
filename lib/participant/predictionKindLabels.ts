const LABELS: Record<string, string> = {
  group_winner: "Group winner",
  group_runner_up: "Group runner-up",
  quarterfinalist: "Quarter-finalist",
  semifinalist: "Semi-finalist",
  finalist: "Finalist",
  champion: "Champion",
  bonus_pick: "Bonus pick",
};

export function labelPredictionKind(kind: string | null | undefined): string {
  if (kind == null || kind === "") return "—";
  return LABELS[kind] ?? kind.replace(/_/g, " ");
}
