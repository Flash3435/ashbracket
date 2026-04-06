import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Builds group letter → distinct FIFA country codes for teams playing group-stage
 * matches, using `tournament_public_matches` (readable by authenticated users).
 */
export async function fetchGroupTeamCountryCodesByLetter(
  supabase: SupabaseClient,
): Promise<Record<string, string[]>> {
  const { data, error } = await supabase
    .from("tournament_public_matches")
    .select("group_code, home_country_code, away_country_code")
    .eq("stage_code", "group");

  if (error || !data?.length) {
    return {};
  }

  const byGroup = new Map<string, Set<string>>();
  for (const row of data) {
    const g = row.group_code as string | null | undefined;
    if (!g || typeof g !== "string") continue;
    const letter = g.toUpperCase();
    let set = byGroup.get(letter);
    if (!set) {
      set = new Set();
      byGroup.set(letter, set);
    }
    const h = row.home_country_code as string | null | undefined;
    const a = row.away_country_code as string | null | undefined;
    if (h && typeof h === "string") set.add(h.toUpperCase());
    if (a && typeof a === "string") set.add(a.toUpperCase());
  }

  const out: Record<string, string[]> = {};
  for (const [letter, set] of byGroup) {
    out[letter] = [...set].sort((x, y) => x.localeCompare(y));
  }
  return out;
}
