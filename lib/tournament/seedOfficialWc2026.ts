import type { SupabaseClient } from "@supabase/supabase-js";
import { applyFifaRankSnapshot } from "./applyFifaRankSnapshot";
import wc from "./wc2026Data.json";
import { groupRoundRobinPairings } from "./groupRoundRobin";

type WcData = typeof wc;

/**
 * Idempotent: upserts teams, edition, and all group-stage matches for WC 2026.
 * Safe to run multiple times (match rows refresh pairings from canonical JSON).
 */
export async function seedOfficialWc2026(
  supabase: SupabaseClient,
): Promise<{ ok: true; editionId: string; matchCount: number } | { ok: false; error: string }> {
  const data = wc as WcData;
  const { edition, teams: teamMap, groups } = data;

  const teamRows = Object.entries(teamMap).map(([code, name]) => ({
    country_code: code,
    name,
    fifa_code: code,
  }));

  const { error: teamErr } = await supabase.from("teams").upsert(teamRows, {
    onConflict: "country_code",
  });
  if (teamErr) return { ok: false, error: teamErr.message };

  const rankOut = await applyFifaRankSnapshot(supabase);
  if (!rankOut.ok) {
    return {
      ok: false,
      error: `Teams saved but FIFA rank snapshot failed: ${rankOut.error}`,
    };
  }

  const codes = Object.keys(teamMap);
  const { data: teamSel, error: selErr } = await supabase
    .from("teams")
    .select("id, country_code")
    .in("country_code", codes);
  if (selErr) return { ok: false, error: selErr.message };

  const codeToId = new Map(
    (teamSel ?? []).map((t) => [t.country_code as string, t.id as string]),
  );

  const { data: edRow, error: edErr } = await supabase
    .from("tournament_editions")
    .upsert(
      {
        code: edition.code,
        name: edition.name,
        starts_on: "2026-06-11",
        ends_on: "2026-07-19",
      },
      { onConflict: "code" },
    )
    .select("id")
    .single();

  if (edErr || !edRow) {
    return { ok: false, error: edErr?.message ?? "Edition upsert failed." };
  }

  const editionId = edRow.id as string;
  const matchRows: Record<string, unknown>[] = [];

  for (const [groupLetter, fifaCodes] of Object.entries(groups)) {
    const g = groupLetter.toUpperCase();
    const ids = fifaCodes.map((c) => codeToId.get(c));
    if (ids.some((x) => !x)) {
      return {
        ok: false,
        error: `Missing team id for group ${g} (check wc2026Data.json).`,
      };
    }
    const pairs = groupRoundRobinPairings(ids as [string, string, string, string]);
    pairs.forEach(([home, away], i) => {
      matchRows.push({
        edition_id: editionId,
        match_code: `WC2026-G-${g}-${String(i + 1).padStart(2, "0")}`,
        stage_code: "group",
        group_code: g,
        round_index: i,
        home_team_id: home,
        away_team_id: away,
        status: "scheduled",
      });
    });
  }

  const { error: mErr } = await supabase.from("tournament_matches").upsert(
    matchRows,
    { onConflict: "edition_id,match_code" },
  );
  if (mErr) return { ok: false, error: mErr.message };

  return { ok: true, editionId, matchCount: matchRows.length };
}
