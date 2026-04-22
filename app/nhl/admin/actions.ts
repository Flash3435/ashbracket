"use server";

import { createClient } from "@/lib/supabase/server";
import { isGlobalAdmin } from "@/lib/auth/permissions";
import { buildDefaultBracketSkeleton } from "@/lib/nhl/bracketSkeleton";
import {
  DEFAULT_NHL_EDITION_NAME,
  DEFAULT_NHL_EDITION_SLUG,
  DEFAULT_NHL_SEASON_LABEL,
} from "@/lib/nhl/constants";
import { NHL_2026_PLAYOFF_TEAMS } from "@/lib/nhl/nhl2026PlayoffField";
import {
  getOfficial2026EditionTeamStatus,
  repairEditionToOfficial2026Field,
  syncOfficial2026Round1ForEdition,
} from "@/lib/nhl/official2026Edition";
import {
  fetchActiveNhlEdition,
  fetchNhlTeamSlugsForEdition,
} from "@/lib/nhl/queries";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

async function guardGlobalAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await isGlobalAdmin(supabase))) {
    redirect("/admin");
  }
  return supabase;
}

function revalidateNhlAdmin() {
  revalidatePath("/nhl/admin");
  revalidatePath("/nhl/admin/editions");
  revalidatePath("/nhl/admin/teams");
  revalidatePath("/nhl/admin/series");
}

/**
 * Creates the default Stanley Cup playoff edition and marks it active (deactivates others).
 * Idempotent only by slug: if slug already exists, no-op with error query param.
 */
export async function createNhlInitialEditionAction() {
  const supabase = await guardGlobalAdmin();

  const { data: existing } = await supabase
    .from("nhl_editions")
    .select("id")
    .eq("slug", DEFAULT_NHL_EDITION_SLUG)
    .maybeSingle();

  if (existing) {
    redirect(`/nhl/admin?err=${encodeURIComponent("edition_slug_exists")}`);
  }

  const { error: deactErr } = await supabase
    .from("nhl_editions")
    .update({ is_active: false })
    .eq("is_active", true);

  if (deactErr) {
    redirect(
      `/nhl/admin?err=${encodeURIComponent(`deactivate:${deactErr.message}`)}`,
    );
  }

  const { error: insErr } = await supabase.from("nhl_editions").insert({
    slug: DEFAULT_NHL_EDITION_SLUG,
    name: DEFAULT_NHL_EDITION_NAME,
    season_label: DEFAULT_NHL_SEASON_LABEL,
    is_active: true,
  });

  if (insErr) {
    redirect(
      `/nhl/admin?err=${encodeURIComponent(`insert:${insErr.message}`)}`,
    );
  }

  revalidateNhlAdmin();
  redirect("/nhl/admin?ok=edition_created");
}

/**
 * Inserts the official 2026 Stanley Cup Playoffs 16-team field for the active edition
 * when no team rows exist yet. Use {@link repairOfficial2026NhlEditionAction} to replace
 * an older demo or incorrect team set in place.
 */
export async function loadOfficial2026PlayoffTeamsAction() {
  const supabase = await guardGlobalAdmin();

  const { edition, error: edErr } = await fetchActiveNhlEdition(supabase);
  if (edErr || !edition) {
    redirect(`/nhl/admin?err=${encodeURIComponent("no_active_edition")}`);
  }

  const { count, error: cErr } = await supabase
    .from("nhl_teams")
    .select("id", { count: "exact", head: true })
    .eq("edition_id", edition.id);

  if (cErr) {
    redirect(`/nhl/admin?err=${encodeURIComponent(cErr.message)}`);
  }
  if ((count ?? 0) > 0) {
    redirect("/nhl/admin?err=teams_already_seeded");
  }

  const rows = NHL_2026_PLAYOFF_TEAMS.map((t) => ({
    edition_id: edition.id,
    team_name: t.team_name,
    team_slug: t.team_slug,
    abbreviation: t.abbreviation,
    conference: t.conference,
    division: t.division,
    seed: t.seed,
  }));

  const { error: insErr } = await supabase.from("nhl_teams").insert(rows);
  if (insErr) {
    redirect(`/nhl/admin?err=${encodeURIComponent(insErr.message)}`);
  }

  const { count: seriesCount } = await supabase
    .from("nhl_series")
    .select("id", { count: "exact", head: true })
    .eq("edition_id", edition.id);

  if ((seriesCount ?? 0) > 0) {
    const wired = await syncOfficial2026Round1ForEdition(supabase, edition.id);
    if (!wired.ok) {
      redirect(`/nhl/admin?err=${encodeURIComponent(wired.error)}`);
    }
  }

  revalidateNhlAdmin();
  redirect("/nhl/admin?ok=teams_seeded");
}

/**
 * Deletes all teams for the active edition, inserts the official 2026 field, ensures
 * the bracket skeleton exists, and assigns Round 1 matchups. Safe when replacing
 * Phase 2 demo data: series team FKs are cleared automatically on team delete.
 */
export async function repairOfficial2026NhlEditionAction() {
  const supabase = await guardGlobalAdmin();

  const { edition, error: edErr } = await fetchActiveNhlEdition(supabase);
  if (edErr || !edition) {
    redirect(`/nhl/admin?err=${encodeURIComponent("no_active_edition")}`);
  }

  const out = await repairEditionToOfficial2026Field(supabase, edition.id);
  if (!out.ok) {
    redirect(
      `/nhl/admin?err=${encodeURIComponent(out.error ?? "repair_failed")}`,
    );
  }

  revalidateNhlAdmin();
  redirect("/nhl/admin?ok=edition_repaired_official_2026");
}

/**
 * Creates empty R1/R2/CF/SCF series rows for the active edition if none exist yet,
 * then wires Round 1 when the edition already has the official 2026 team slugs.
 */
export async function createNhlBracketSkeletonAction() {
  const supabase = await guardGlobalAdmin();

  const { edition, error: edErr } = await fetchActiveNhlEdition(supabase);
  if (edErr || !edition) {
    redirect(`/nhl/admin?err=${encodeURIComponent("no_active_edition")}`);
  }

  const { count, error: cErr } = await supabase
    .from("nhl_series")
    .select("id", { count: "exact", head: true })
    .eq("edition_id", edition.id);

  if (cErr) {
    redirect(`/nhl/admin?err=${encodeURIComponent(cErr.message)}`);
  }
  if ((count ?? 0) > 0) {
    redirect("/nhl/admin?err=skeleton_already_exists");
  }

  const skeleton = buildDefaultBracketSkeleton();
  const insertRows = skeleton.map((s) => ({
    edition_id: edition.id,
    round_code: s.round_code,
    round_order: s.round_order,
    side_or_conference: s.side_or_conference,
    slot_index: s.slot_index,
  }));

  const { error: insErr } = await supabase.from("nhl_series").insert(insertRows);
  if (insErr) {
    redirect(`/nhl/admin?err=${encodeURIComponent(insErr.message)}`);
  }

  const { slugs, error: slugErr } = await fetchNhlTeamSlugsForEdition(
    supabase,
    edition.id,
  );
  if (slugErr) {
    redirect(`/nhl/admin?err=${encodeURIComponent(slugErr)}`);
  }
  const teamStatus = getOfficial2026EditionTeamStatus(
    slugs.map((team_slug) => ({ team_slug })),
  );
  if (teamStatus === "official_2026") {
    const wired = await syncOfficial2026Round1ForEdition(supabase, edition.id);
    if (!wired.ok) {
      redirect(`/nhl/admin?err=${encodeURIComponent(wired.error)}`);
    }
  }

  revalidateNhlAdmin();
  redirect(
    teamStatus === "official_2026"
      ? "/nhl/admin?ok=skeleton_created"
      : "/nhl/admin?ok=skeleton_created_needs_teams",
  );
}

/** @deprecated Use {@link loadOfficial2026PlayoffTeamsAction} — name kept for any stale imports. */
export const seedNhlStarterTeamsAction = loadOfficial2026PlayoffTeamsAction;
