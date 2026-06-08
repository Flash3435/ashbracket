import type { ManagedPoolRow } from "./fetchManagedPoolsForViewer";

/** Participant count descending, then pool name (case-insensitive). */
export function sortManagedPoolsForAdminHome(
  pools: ManagedPoolRow[],
  countsByPoolId: Map<string, number>,
): ManagedPoolRow[] {
  return [...pools].sort((a, b) => {
    const countDiff =
      (countsByPoolId.get(b.id) ?? 0) - (countsByPoolId.get(a.id) ?? 0);
    if (countDiff !== 0) return countDiff;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}
