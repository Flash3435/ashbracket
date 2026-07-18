#!/usr/bin/env tsx
/**
 * Read-only audit of the semifinal / third-place / final bracket rows (M101–M104)
 * for the official WC 2026 edition. Verifies whether M103 (bronze final) has its
 * teams resolved from the semifinal losers.
 *
 *   npx tsx scripts/audit-third-place-matchup.ts
 */
import { createClient } from "@supabase/supabase-js";
import { OFFICIAL_EDITION_CODE } from "../lib/config/officialTournament";
import { loadEnvLocal } from "./loadEnvLocal";

async function main() {
  loadEnvLocal();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: edition, error: edErr } = await supabase
    .from("tournament_editions")
    .select("id, code, name")
    .eq("code", OFFICIAL_EDITION_CODE)
    .maybeSingle();
  if (edErr || !edition) {
    console.error(edErr?.message ?? `No edition ${OFFICIAL_EDITION_CODE}`);
    process.exit(1);
  }
  console.log(`Edition: ${edition.name} (${edition.code}) ${edition.id}\n`);

  const { data: matches, error: mErr } = await supabase
    .from("tournament_matches")
    .select(
      "id, match_code, stage_code, status, kickoff_at, provider_fixture_id, home_team_id, away_team_id, home_goals, away_goals, home_penalties, away_penalties, winner_team_id, home_advance_from_match_id, away_advance_from_match_id, sync_locked",
    )
    .eq("edition_id", edition.id)
    .in("match_code", ["M97", "M98", "M99", "M100", "M101", "M102", "M103", "M104"])
    .order("match_code");
  if (mErr) {
    console.error(mErr.message);
    process.exit(1);
  }

  const teamIds = new Set<string>();
  for (const m of matches ?? []) {
    for (const id of [m.home_team_id, m.away_team_id, m.winner_team_id]) {
      if (id) teamIds.add(id as string);
    }
  }
  const { data: teams, error: tErr } = await supabase
    .from("teams")
    .select("id, name, fifa_code")
    .in("id", [...teamIds]);
  if (tErr) {
    console.error(tErr.message);
    process.exit(1);
  }
  const teamName = new Map((teams ?? []).map((t) => [t.id as string, `${t.name} (${t.fifa_code ?? "?"})`]));
  const label = (id: string | null) => (id ? teamName.get(id) ?? id : "TBD");
  const idByRowId = new Map((matches ?? []).map((m) => [m.id as string, m.match_code as string]));

  const sorted = [...(matches ?? [])].sort(
    (a, b) => Number((a.match_code as string).slice(1)) - Number((b.match_code as string).slice(1)),
  );
  for (const m of sorted) {
    console.log(`${m.match_code}  stage=${m.stage_code}  status=${m.status}  sync_locked=${m.sync_locked}`);
    console.log(`  id=${m.id}`);
    console.log(`  kickoff_at=${m.kickoff_at}  provider_fixture_id=${m.provider_fixture_id ?? "null"}`);
    console.log(`  home=${label(m.home_team_id)} [${m.home_team_id ?? "null"}]`);
    console.log(`  away=${label(m.away_team_id)} [${m.away_team_id ?? "null"}]`);
    console.log(
      `  score=${m.home_goals ?? "-"}:${m.away_goals ?? "-"}  pens=${m.home_penalties ?? "-"}:${m.away_penalties ?? "-"}  winner=${label(m.winner_team_id)}`,
    );
    console.log(
      `  home_advance_from=${m.home_advance_from_match_id ? idByRowId.get(m.home_advance_from_match_id) ?? m.home_advance_from_match_id : "null"}  away_advance_from=${m.away_advance_from_match_id ? idByRowId.get(m.away_advance_from_match_id) ?? m.away_advance_from_match_id : "null"}`,
    );
    console.log();
  }

  const { data: namedTeams, error: ntErr } = await supabase
    .from("teams")
    .select("id, name, fifa_code")
    .in("name", ["France", "England", "Spain", "Argentina"])
    .order("name");
  if (ntErr) {
    console.error(ntErr.message);
    process.exit(1);
  }
  console.log("Named teams:");
  for (const t of namedTeams ?? []) {
    console.log(`  ${t.name} (${t.fifa_code ?? "?"}) ${t.id}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
