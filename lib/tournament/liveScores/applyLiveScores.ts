import type { SupabaseClient } from "@supabase/supabase-js";
import type { OfficialMatchScorePatch } from "../syncOfficialTournament";
import { syncOfficialTournament, type SyncOfficialTournamentSummary } from "../syncOfficialTournament";
import type { OfficialMatchScorePatchInput } from "./types";

export type SyncOfficialTournamentFn = typeof syncOfficialTournament;

export function toOfficialMatchScorePatches(
  patches: OfficialMatchScorePatchInput[],
): OfficialMatchScorePatch[] {
  return patches.map((p) => ({
    matchCode: p.matchCode,
    homeGoals: p.homeGoals,
    awayGoals: p.awayGoals,
    homePenalties: p.homePenalties,
    awayPenalties: p.awayPenalties,
    status: p.status,
  }));
}

export async function persistProviderFixtureIds(
  supabase: SupabaseClient,
  updates: Array<{ matchId: string; providerFixtureId: string }>,
): Promise<{ error?: string }> {
  for (const u of updates) {
    const { error } = await supabase
      .from("tournament_matches")
      .update({ provider_fixture_id: u.providerFixtureId })
      .eq("id", u.matchId)
      .is("provider_fixture_id", null);
    if (error) return { error: error.message };
  }
  return {};
}

export type ApplyLiveScoresResult =
  | {
      ok: true;
      matchesUpdated: number;
      summary: SyncOfficialTournamentSummary;
      providerFixtureIdsSaved: number;
      warnings: string[];
    }
  | { ok: false; error: string; warnings?: string[] };

/**
 * Apply score patches via the existing official tournament sync path.
 * Does not change scoring rules — delegates to syncOfficialTournament.
 */
export async function applyLiveScoresAndSync(
  supabase: SupabaseClient,
  options: {
    editionCode: string;
    poolIds: string[];
    patches: OfficialMatchScorePatchInput[];
    providerFixtureIdUpdates?: Array<{ matchId: string; providerFixtureId: string }>;
    syncFn?: SyncOfficialTournamentFn;
  },
): Promise<ApplyLiveScoresResult> {
  const warnings: string[] = [];
  const syncFn = options.syncFn ?? syncOfficialTournament;

  if (options.patches.length === 0) {
    return { ok: false, error: "No score changes to apply.", warnings };
  }

  if (options.providerFixtureIdUpdates?.length) {
    const saved = await persistProviderFixtureIds(supabase, options.providerFixtureIdUpdates);
    if (saved.error) {
      warnings.push(`Could not save provider fixture ids: ${saved.error}`);
    }
  }

  const out = await syncFn(supabase, {
    editionCode: options.editionCode,
    poolIds: options.poolIds,
    patches: toOfficialMatchScorePatches(options.patches),
  });

  if (!out.ok) {
    return { ok: false, error: out.error, warnings };
  }

  return {
    ok: true,
    matchesUpdated: options.patches.length,
    summary: out.summary,
    providerFixtureIdsSaved: options.providerFixtureIdUpdates?.length ?? 0,
    warnings,
  };
}
