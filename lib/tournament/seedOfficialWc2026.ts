import type { SupabaseClient } from "@supabase/supabase-js";
import { applyFifaRankSnapshot } from "./applyFifaRankSnapshot";
import wc from "./wc2026Data.json";
import groupFixtures from "./wc2026GroupFixtures.json";

type WcData = typeof wc;

type OfficialGroupFixture = { home: string; away: string; kickoff_at: string };

const WC2026_GROUP_FIXTURES = groupFixtures as Record<string, OfficialGroupFixture[]>;

function sortedPairKey(a: string, b: string): string {
  return [a, b].sort().join("\0");
}

function expectedPairsForRoster(roster: string[]): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < roster.length; i += 1) {
    for (let j = i + 1; j < roster.length; j += 1) {
      out.add(sortedPairKey(roster[i]!, roster[j]!));
    }
  }
  return out;
}

/**
 * Confirms six fixtures form a full round robin for the four FIFA codes.
 */
function validateGroupFixtures(
  groupLetter: string,
  rosterFifaCodes: string[],
  fixtures: { home: string; away: string }[],
): string | null {
  if (fixtures.length !== 6) {
    return `Group ${groupLetter}: expected 6 fixtures, got ${fixtures.length}.`;
  }
  const roster = new Set(rosterFifaCodes.map((c) => c.toUpperCase()));
  if (roster.size !== 4) {
    return `Group ${groupLetter}: roster must have 4 distinct FIFA codes.`;
  }
  const expected = expectedPairsForRoster([...roster]);
  const seen = new Set<string>();
  for (const f of fixtures) {
    const h = f.home.toUpperCase();
    const a = f.away.toUpperCase();
    if (!roster.has(h) || !roster.has(a)) {
      return `Group ${groupLetter}: fixture ${h}–${a} uses a team outside the group roster.`;
    }
    if (h === a) {
      return `Group ${groupLetter}: home and away must differ.`;
    }
    const k = sortedPairKey(h, a);
    if (seen.has(k)) {
      return `Group ${groupLetter}: duplicate pairing ${h} vs ${a}.`;
    }
    seen.add(k);
  }
  if (seen.size !== expected.size) {
    return `Group ${groupLetter}: fixture pairings do not match a full round robin.`;
  }
  for (const k of expected) {
    if (!seen.has(k)) {
      return `Group ${groupLetter}: missing pairing in fixtures.`;
    }
  }
  return null;
}

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
    const rankErr = rankOut.error;
    const missingRankColumn =
      /fifa_rank/i.test(rankErr) &&
      (/schema cache|column/i.test(rankErr) || /does not exist/i.test(rankErr));
    if (missingRankColumn) {
      console.warn(
        "[seedOfficialWc2026] Skipping FIFA rank snapshot: `teams.fifa_rank` is not in the database.\n" +
          "  Apply supabase/migrations/20260408140000_teams_fifa_rank.sql (SQL Editor or `supabase db push`), then re-run seed:fifa-ranks if you want ranks.",
      );
    } else {
      return {
        ok: false,
        error: `Teams saved but FIFA rank snapshot failed: ${rankErr}`,
      };
    }
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
    const fixtures = WC2026_GROUP_FIXTURES[g];
    if (!fixtures) {
      return { ok: false, error: `Missing official fixtures for group ${g} in wc2026GroupFixtures.json.` };
    }

    const rosterErr = validateGroupFixtures(g, fifaCodes as string[], fixtures);
    if (rosterErr) {
      return { ok: false, error: rosterErr };
    }

    for (let i = 0; i < fixtures.length; i += 1) {
      const fx = fixtures[i]!;
      const homeId = codeToId.get(fx.home);
      const awayId = codeToId.get(fx.away);
      if (!homeId || !awayId) {
        return {
          ok: false,
          error: `Group ${g}: missing team id for ${fx.home} vs ${fx.away} (seed teams first).`,
        };
      }
      matchRows.push({
        edition_id: editionId,
        match_code: `WC2026-G-${g}-${String(i + 1).padStart(2, "0")}`,
        stage_code: "group",
        group_code: g,
        round_index: i,
        kickoff_at: fx.kickoff_at,
        home_team_id: homeId,
        away_team_id: awayId,
        status: "scheduled",
      });
    }
  }

  const { error: mErr } = await supabase.from("tournament_matches").upsert(
    matchRows,
    { onConflict: "edition_id,match_code" },
  );
  if (mErr) return { ok: false, error: mErr.message };

  return { ok: true, editionId, matchCount: matchRows.length };
}
