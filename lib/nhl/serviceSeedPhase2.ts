import type { SupabaseClient } from "@supabase/supabase-js";
import { buildDefaultBracketSkeleton } from "./bracketSkeleton";
import {
  DEFAULT_NHL_EDITION_NAME,
  DEFAULT_NHL_EDITION_SLUG,
  DEFAULT_NHL_SEASON_LABEL,
} from "./constants";
import { NHL_STARTER_TEAMS } from "./starterTeams";

export type ServiceSeedPhase2Result = {
  ok: boolean;
  messages: string[];
  error?: string;
};

/**
 * Idempotent-ish bootstrap using the service role (bypasses RLS).
 * Safe for local/dev: fills edition, teams, and series skeleton when missing.
 */
export async function runNhlPhase2ServiceSeed(
  supabase: SupabaseClient,
): Promise<ServiceSeedPhase2Result> {
  const messages: string[] = [];

  const { data: existingEdition, error: findErr } = await supabase
    .from("nhl_editions")
    .select("id, slug")
    .eq("slug", DEFAULT_NHL_EDITION_SLUG)
    .maybeSingle();

  if (findErr) {
    return { ok: false, messages, error: findErr.message };
  }

  let editionId: string;

  if (existingEdition?.id) {
    editionId = existingEdition.id as string;
    messages.push(`Edition already exists (${DEFAULT_NHL_EDITION_SLUG}).`);
    const { error: actErr } = await supabase
      .from("nhl_editions")
      .update({ is_active: false })
      .eq("is_active", true)
      .neq("id", editionId);
    if (actErr) {
      return { ok: false, messages, error: actErr.message };
    }
    const { error: oneErr } = await supabase
      .from("nhl_editions")
      .update({ is_active: true })
      .eq("id", editionId);
    if (oneErr) {
      return { ok: false, messages, error: oneErr.message };
    }
    messages.push("Marked this edition active (others deactivated).");
  } else {
    const { error: deactErr } = await supabase
      .from("nhl_editions")
      .update({ is_active: false })
      .eq("is_active", true);
    if (deactErr) {
      return { ok: false, messages, error: deactErr.message };
    }
    const { data: inserted, error: insErr } = await supabase
      .from("nhl_editions")
      .insert({
        slug: DEFAULT_NHL_EDITION_SLUG,
        name: DEFAULT_NHL_EDITION_NAME,
        season_label: DEFAULT_NHL_SEASON_LABEL,
        is_active: true,
      })
      .select("id")
      .single();
    if (insErr || !inserted?.id) {
      return { ok: false, messages, error: insErr?.message ?? "insert failed" };
    }
    editionId = inserted.id as string;
    messages.push("Created NHL edition row.");
  }

  const { count: teamCount, error: tcErr } = await supabase
    .from("nhl_teams")
    .select("id", { count: "exact", head: true })
    .eq("edition_id", editionId);
  if (tcErr) {
    return { ok: false, messages, error: tcErr.message };
  }

  if ((teamCount ?? 0) === 0) {
    const rows = NHL_STARTER_TEAMS.map((t) => ({
      edition_id: editionId,
      team_name: t.team_name,
      team_slug: t.team_slug,
      abbreviation: t.abbreviation,
      conference: t.conference,
      division: t.division,
      seed: t.seed,
    }));
    const { error: tIns } = await supabase.from("nhl_teams").insert(rows);
    if (tIns) {
      return { ok: false, messages, error: tIns.message };
    }
    messages.push(`Inserted ${rows.length} starter teams.`);
  } else {
    messages.push(`Teams already present (${teamCount}); skipped team insert.`);
  }

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
    messages.push(`Inserted ${insertRows.length} empty series rows.`);
  } else {
    messages.push(`Series already present (${seriesCount}); skipped skeleton.`);
  }

  return { ok: true, messages };
}
