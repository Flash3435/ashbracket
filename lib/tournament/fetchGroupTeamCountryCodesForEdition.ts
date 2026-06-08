import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Group letter → FIFA country codes for teams in group-stage matches of one edition.
 * Uses base `tournament_matches` (admin/service) so simulation editions work.
 */
export async function fetchGroupTeamCountryCodesForEdition(
  supabase: SupabaseClient,
  editionId: string,
): Promise<Record<string, string[]>> {
  const { data: matchRows, error: mErr } = await supabase
    .from("tournament_matches")
    .select("group_code, home_team_id, away_team_id")
    .eq("edition_id", editionId)
    .eq("stage_code", "group");

  if (mErr || !matchRows?.length) {
    return {};
  }

  const teamIds = [
    ...new Set(
      matchRows.flatMap((r) => [
        r.home_team_id as string | null,
        r.away_team_id as string | null,
      ]).filter((id): id is string => Boolean(id)),
    ),
  ];

  const { data: teamRows, error: tErr } = await supabase
    .from("teams")
    .select("id, country_code")
    .in("id", teamIds);

  if (tErr || !teamRows?.length) {
    return {};
  }

  const codeById = new Map(
    teamRows.map((t) => [t.id as string, (t.country_code as string).toUpperCase()]),
  );

  const byGroup = new Map<string, Set<string>>();
  for (const row of matchRows) {
    const g = row.group_code as string | null | undefined;
    if (!g) continue;
    const letter = g.toUpperCase();
    let set = byGroup.get(letter);
    if (!set) {
      set = new Set();
      byGroup.set(letter, set);
    }
    const h = row.home_team_id ? codeById.get(row.home_team_id as string) : undefined;
    const a = row.away_team_id ? codeById.get(row.away_team_id as string) : undefined;
    if (h) set.add(h);
    if (a) set.add(a);
  }

  const out: Record<string, string[]> = {};
  for (const [letter, set] of byGroup) {
    out[letter] = [...set].sort((a, b) => a.localeCompare(b));
  }
  return out;
}
