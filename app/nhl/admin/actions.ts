"use server";

import { createClient } from "@/lib/supabase/server";
import { isGlobalAdmin } from "@/lib/auth/permissions";
import { buildDefaultBracketSkeleton } from "@/lib/nhl/bracketSkeleton";
import {
  DEFAULT_NHL_EDITION_NAME,
  DEFAULT_NHL_EDITION_SLUG,
  DEFAULT_NHL_SEASON_LABEL,
} from "@/lib/nhl/constants";
import { fetchActiveNhlEdition } from "@/lib/nhl/queries";
import { NHL_STARTER_TEAMS } from "@/lib/nhl/starterTeams";
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
 * Inserts the Phase 2 starter team set for the active edition (skips if any team rows exist).
 */
export async function seedNhlStarterTeamsAction() {
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

  const rows = NHL_STARTER_TEAMS.map((t) => ({
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

  revalidateNhlAdmin();
  redirect("/nhl/admin?ok=teams_seeded");
}

/**
 * Creates empty R1/R2/CF/SCF series rows for the active edition if none exist yet.
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

  revalidateNhlAdmin();
  redirect("/nhl/admin?ok=skeleton_created");
}
