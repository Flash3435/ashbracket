/**
 * Normalize player names for goal-total aggregation (case/spacing/diacritics-insensitive).
 */
export function normalizePlayerNameForGoals(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}
