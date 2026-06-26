import type { SupabaseClient } from "@supabase/supabase-js";
import { r32SlotKeysForMatchIndex, WC2026_R32_MATCH_DEFS } from "../bracket/wc2026RoundOf32";
import { isKnockoutMatchConfirmed, isMatchPickable } from "../picks/gradualKnockoutUnlock";
import { buildWc2026GroupOutcomesForPublish } from "./buildWc2026GroupOutcomesForPublish";
import {
  resolvePartialWc2026RoundOf32MatchTeams,
  type Wc2026PartialR32MatchTeams,
} from "./resolvePartialWc2026RoundOf32Teams";
import {
  seedOfficialWc2026KnockoutFixtures,
  wc2026R32MatchCode,
} from "./seedOfficialWc2026KnockoutFixtures";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";

export type RoundOf32FixturePublishConflict = {
  matchCode: string;
  field: "home_team_id" | "away_team_id";
  existingTeamId: string;
  proposedTeamId: string;
};

export type PublishRoundOf32FixturesSummary = {
  shellRowsCreated: number;
  shellRowsUpdated: number;
  confirmedFixturesPublished: number;
  pendingFixtures: number;
  pickableFixtures: number;
  conflicts: RoundOf32FixturePublishConflict[];
};

type DbR32Row = {
  id: string;
  match_code: string;
  home_team_id: string | null;
  away_team_id: string | null;
  kickoff_at: string | null;
  sync_locked: boolean;
};

export type RoundOf32FixtureUpdatePlan = {
  updates: Array<{
    id: string;
    matchCode: string;
    home_team_id?: string;
    away_team_id?: string;
  }>;
  conflicts: RoundOf32FixturePublishConflict[];
};

/** Pure update planner for tests and publish workflow. */
export function planRoundOf32FixtureUpdates(
  partialMatches: Wc2026PartialR32MatchTeams[],
  existingRows: DbR32Row[],
): RoundOf32FixtureUpdatePlan {
  const rowByCode = new Map(existingRows.map((row) => [row.match_code, row]));
  const updates: RoundOf32FixtureUpdatePlan["updates"] = [];
  const conflicts: RoundOf32FixturePublishConflict[] = [];

  for (const match of partialMatches) {
    const matchCode = wc2026R32MatchCode(match.fifaMatchNo);
    const row = rowByCode.get(matchCode);
    if (!row || row.sync_locked) continue;

    const patch: RoundOf32FixtureUpdatePlan["updates"][number] = {
      id: row.id,
      matchCode,
    };
    const sides: Array<{
      field: "home_team_id" | "away_team_id";
      key: "topTeamId" | "bottomTeamId";
      existing: string | null;
    }> = [
      { field: "home_team_id", key: "topTeamId", existing: row.home_team_id },
      { field: "away_team_id", key: "bottomTeamId", existing: row.away_team_id },
    ];

    for (const side of sides) {
      const proposed = match[side.key];
      if (!proposed) continue;
      if (side.existing && side.existing !== proposed) {
        conflicts.push({
          matchCode,
          field: side.field,
          existingTeamId: side.existing,
          proposedTeamId: proposed,
        });
        continue;
      }
      if (!side.existing) {
        patch[side.field] = proposed;
      }
    }

    if (patch.home_team_id || patch.away_team_id) {
      updates.push(patch);
    }
  }

  return { updates, conflicts };
}

/**
 * Ensures M73–M88 shell rows exist and publishes known teams to official match rows.
 */
export async function publishConfirmedRoundOf32Fixtures(
  supabase: SupabaseClient,
  editionId: string,
  options?: {
    /** When admin applies the full official R32 field, publish from this slot map. */
    slotTeamIdByKey?: Readonly<Record<string, string>>;
  },
): Promise<
  | { ok: true; summary: PublishRoundOf32FixturesSummary }
  | { ok: false; error: string }
> {
  const seedOut = await seedOfficialWc2026KnockoutFixtures(supabase, { editionId });
  if (!seedOut.ok) return seedOut;

  let partialMatches: Wc2026PartialR32MatchTeams[];
  if (options?.slotTeamIdByKey) {
    const slotMap = options.slotTeamIdByKey;
    partialMatches = WC2026_R32_MATCH_DEFS.map((def, matchIndex) => {
      const { top: topSlotKey, bottom: bottomSlotKey } =
        r32SlotKeysForMatchIndex(matchIndex);
      return {
        matchIndex,
        fifaMatchNo: def.fifaMatchNo,
        topSlotKey,
        bottomSlotKey,
        topTeamId: slotMap[topSlotKey]?.trim() || null,
        bottomTeamId: slotMap[bottomSlotKey]?.trim() || null,
      };
    });
  } else {
    const outcomesOut = await buildWc2026GroupOutcomesForPublish(supabase, editionId);
    if (!outcomesOut.ok) return outcomesOut;
    partialMatches = resolvePartialWc2026RoundOf32MatchTeams(outcomesOut.outcomes);
  }
  const matchCodes = partialMatches.map((m) => wc2026R32MatchCode(m.fifaMatchNo));

  const { data: existingRows, error: loadErr } = await supabase
    .from("tournament_matches")
    .select("id, match_code, home_team_id, away_team_id, kickoff_at, sync_locked")
    .eq("edition_id", editionId)
    .in("match_code", matchCodes);
  if (loadErr) return { ok: false, error: loadErr.message };

  const rowByCode = new Map(
    (existingRows ?? []).map((row) => [row.match_code as string, row as DbR32Row]),
  );

  const plan = planRoundOf32FixtureUpdates(
    partialMatches,
    [...rowByCode.values()],
  );
  const conflicts = plan.conflicts;
  const now = new Date().toISOString();

  for (const patch of plan.updates) {
    const updates: Record<string, string> = {};
    if (patch.home_team_id) updates.home_team_id = patch.home_team_id;
    if (patch.away_team_id) updates.away_team_id = patch.away_team_id;

    const { error: upErr } = await supabase
      .from("tournament_matches")
      .update({ ...updates, last_sync_at: now })
      .eq("id", patch.id);
    if (upErr) return { ok: false, error: upErr.message };

    const row = rowByCode.get(patch.matchCode);
    if (row) {
      if (updates.home_team_id) row.home_team_id = updates.home_team_id;
      if (updates.away_team_id) row.away_team_id = updates.away_team_id;
    }
  }

  const { data: finalRows, error: finalErr } = await supabase
    .from("tournament_public_matches")
    .select(
      "match_code, stage_code, kickoff_at, status, home_country_code, away_country_code, home_team_name, away_team_name",
    )
    .eq("edition_id", editionId)
    .eq("stage_code", "round_of_32");
  if (finalErr) return { ok: false, error: finalErr.message };

  const publicRows = (finalRows ?? []) as unknown as TournamentMatchPublicRow[];
  const confirmedCount = publicRows.filter((m) => isKnockoutMatchConfirmed(m)).length;
  const pickableCount = publicRows.filter((m) => isMatchPickable(m)).length;

  return {
    ok: true,
    summary: {
      shellRowsCreated: seedOut.summary.shellRowsCreated,
      shellRowsUpdated: seedOut.summary.shellRowsUpdated,
      confirmedFixturesPublished: confirmedCount,
      pendingFixtures: Math.max(0, 16 - confirmedCount),
      pickableFixtures: pickableCount,
      conflicts,
    },
  };
}
