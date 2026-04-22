import type { SupabaseClient } from "@supabase/supabase-js";
import { buildDefaultBracketSkeleton } from "./bracketSkeleton";
import {
  NHL_2026_OFFICIAL_TEAM_SLUGS,
  NHL_2026_PLAYOFF_TEAMS,
  NHL_2026_ROUND1_SLOTS,
} from "./nhl2026PlayoffField";
import type { NhlTeam } from "./types";

export type Official2026EditionStatus = "empty" | "official_2026" | "non_official";

/**
 * Whether the active edition’s team list matches the official 2026 playoff field
 * (16 rows, exact slug set).
 */
export function getOfficial2026EditionTeamStatus(
  teams: Pick<NhlTeam, "team_slug">[],
): Official2026EditionStatus {
  if (teams.length === 0) return "empty";
  const slugs = new Set(teams.map((t) => t.team_slug));
  if (slugs.size !== NHL_2026_OFFICIAL_TEAM_SLUGS.size) return "non_official";
  for (const s of NHL_2026_OFFICIAL_TEAM_SLUGS) {
    if (!slugs.has(s)) return "non_official";
  }
  return "official_2026";
}

/**
 * Assigns Round 1 `nhl_series` team FKs from the official 2026 bracket map.
 * Idempotent when team slugs are stable. Clears R1 assignments first, then sets
 * known pairings (R2+ untouched).
 */
export async function syncOfficial2026Round1ForEdition(
  supabase: SupabaseClient,
  editionId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: teamRows, error: teamErr } = await supabase
    .from("nhl_teams")
    .select("id, team_slug")
    .eq("edition_id", editionId);

  if (teamErr) {
    return { ok: false, error: teamErr.message };
  }

  const slugToId = new Map(
    (teamRows ?? []).map((r: { id: string; team_slug: string }) => [
      r.team_slug,
      r.id,
    ]),
  );

  const { error: clearErr } = await supabase
    .from("nhl_series")
    .update({
      higher_seed_team_id: null,
      lower_seed_team_id: null,
      winner_team_id: null,
    })
    .eq("edition_id", editionId)
    .eq("round_code", "R1");

  if (clearErr) {
    return { ok: false, error: clearErr.message };
  }

  for (const slot of NHL_2026_ROUND1_SLOTS) {
    const hi = slugToId.get(slot.higher_team_slug);
    const lo = slugToId.get(slot.lower_team_slug);
    if (!hi || !lo) {
      return {
        ok: false,
        error: `Missing team slug(s) for R1 slot ${slot.side} #${slot.slot_index}: need ${slot.higher_team_slug}, ${slot.lower_team_slug}`,
      };
    }

    const { error: upErr } = await supabase
      .from("nhl_series")
      .update({
        higher_seed_team_id: hi,
        lower_seed_team_id: lo,
      })
      .eq("edition_id", editionId)
      .eq("round_code", "R1")
      .eq("side_or_conference", slot.side)
      .eq("slot_index", slot.slot_index);

    if (upErr) {
      return { ok: false, error: upErr.message };
    }
  }

  return { ok: true };
}

export type RepairOfficial2026Result = {
  ok: boolean;
  messages: string[];
  error?: string;
};

/**
 * Replaces all teams for the edition with the official 2026 field, ensures the
 * 8+4+2+1 series skeleton exists, and wires Round 1 to the official pairings.
 *
 * Safe pattern: team rows are removed (series team FKs become NULL via ON DELETE
 * SET NULL), then teams are re-inserted and R1 is repointed — no orphan FKs to
 * deleted team ids.
 */
export async function repairEditionToOfficial2026Field(
  supabase: SupabaseClient,
  editionId: string,
): Promise<RepairOfficial2026Result> {
  const messages: string[] = [];

  const { error: delErr } = await supabase
    .from("nhl_teams")
    .delete()
    .eq("edition_id", editionId);

  if (delErr) {
    return { ok: false, messages, error: delErr.message };
  }
  messages.push("Removed previous team rows for this edition (series team FKs cleared).");

  const rows = NHL_2026_PLAYOFF_TEAMS.map((t) => ({
    edition_id: editionId,
    team_name: t.team_name,
    team_slug: t.team_slug,
    abbreviation: t.abbreviation,
    conference: t.conference,
    division: t.division,
    seed: t.seed,
  }));

  const { error: insErr } = await supabase.from("nhl_teams").insert(rows);
  if (insErr) {
    return { ok: false, messages, error: insErr.message };
  }
  messages.push(`Inserted ${rows.length} official 2026 playoff teams.`);

  const { count: seriesCount, error: scErr } = await supabase
    .from("nhl_series")
    .select("id", { count: "exact", head: true })
    .eq("edition_id", editionId);

  if (scErr) {
    return { ok: false, messages, error: scErr.message };
  }

  if ((seriesCount ?? 0) === 0) {
    const skeleton = buildDefaultBracketSkeleton();
    const insertRows = skeleton.map((s) => ({
      edition_id: editionId,
      round_code: s.round_code,
      round_order: s.round_order,
      side_or_conference: s.side_or_conference,
      slot_index: s.slot_index,
    }));
    const { error: sIns } = await supabase.from("nhl_series").insert(insertRows);
    if (sIns) {
      return { ok: false, messages, error: sIns.message };
    }
    messages.push(`Created bracket skeleton (${insertRows.length} series rows).`);
  } else {
    messages.push(`Bracket skeleton already present (${seriesCount} series rows).`);
  }

  const sync = await syncOfficial2026Round1ForEdition(supabase, editionId);
  if (!sync.ok) {
    return { ok: false, messages, error: sync.error };
  }
  messages.push("Round 1 series point at the official 2026 matchups.");

  return { ok: true, messages };
}
