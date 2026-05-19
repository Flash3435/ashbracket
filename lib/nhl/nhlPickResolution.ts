import type { SupabaseClient } from "@supabase/supabase-js";
import { nhlBracketSlotKey } from "./nhlBracketSlotKey";
import type { NhlSeriesRow } from "./types";

export type NhlPickResolutionMeta = {
  /** Picks already keyed to a current bracket series id on the active edition. */
  directOnActiveCount: number;
  /** Picks remapped from another edition onto the active edition. */
  remappedFromOtherEditionCount: number;
  /** Picks on the active edition remapped by bracket slot (stale series_id). */
  remappedBySlotCount: number;
  /** `picked_team_id` adjusted to the active edition team row (same franchise slug). */
  remappedTeamIdCount: number;
  /** Pick rows we could not attach to a current series slot. */
  unresolvableCount: number;
  /** Raw rows stored only on a non-active edition (before remapping). */
  legacyEditionOnlyCount: number;
};

type PickRowJoined = {
  edition_id: string;
  series_id: string;
  picked_team_id: string;
  series: {
    round_code: string;
    side_or_conference: string | null;
    slot_index: number;
  } | null;
  team: { team_slug: string } | null;
};

function normalizePickRowJoined(row: unknown): PickRowJoined | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const seriesRaw = r.series;
  const seriesOne = Array.isArray(seriesRaw) ? seriesRaw[0] : seriesRaw;
  const teamRaw = r.team;
  const teamOne = Array.isArray(teamRaw) ? teamRaw[0] : teamRaw;

  if (
    typeof r.edition_id !== "string" ||
    typeof r.series_id !== "string" ||
    typeof r.picked_team_id !== "string" ||
    !seriesOne ||
    typeof seriesOne !== "object"
  ) {
    return null;
  }

  const s = seriesOne as Record<string, unknown>;
  if (typeof s.round_code !== "string" || typeof s.slot_index !== "number") {
    return null;
  }

  const teamSlug =
    teamOne && typeof teamOne === "object" && typeof (teamOne as { team_slug?: unknown }).team_slug === "string"
      ? (teamOne as { team_slug: string }).team_slug
      : null;

  return {
    edition_id: r.edition_id,
    series_id: r.series_id,
    picked_team_id: r.picked_team_id,
    series: {
      round_code: s.round_code,
      side_or_conference:
        typeof s.side_or_conference === "string" ? s.side_or_conference : null,
      slot_index: s.slot_index,
    },
    team: teamSlug ? { team_slug: teamSlug } : null,
  };
}

function buildSlotToSeriesIdMap(
  seriesRows: NhlSeriesRow[],
  roundCode: "R1" | "R2",
): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of seriesRows) {
    if (row.round_code !== roundCode) continue;
    map.set(
      nhlBracketSlotKey({
        round_code: row.round_code,
        side_or_conference: row.side_or_conference,
        slot_index: row.slot_index,
      }),
      row.id,
    );
  }
  return map;
}

function buildSlugToTeamIdMap(
  teams: { id: string; team_slug: string }[],
): Map<string, string> {
  return new Map(teams.map((t) => [t.team_slug, t.id]));
}

function resolvePickedTeamIdForActiveEdition(
  pickedTeamId: string,
  teamSlug: string | null,
  slugToActiveTeamId: Map<string, string>,
): { teamId: string | null; remappedTeam: boolean } {
  const bySlug = teamSlug ? slugToActiveTeamId.get(teamSlug) : undefined;
  if (bySlug) {
    return { teamId: bySlug, remappedTeam: bySlug !== pickedTeamId };
  }
  return { teamId: null, remappedTeam: false };
}

/**
 * Resolves saved picks onto the active edition's current `nhl_series` ids and team ids.
 * Handles legacy picks stored on an inactive edition or stale series/team UUIDs after bracket repair.
 */
export function resolveNhlPicksOntoCurrentBracket(
  activeEditionId: string,
  roundCode: "R1" | "R2",
  currentSeriesRows: NhlSeriesRow[],
  activeEditionTeams: { id: string; team_slug: string }[],
  joinedPickRows: PickRowJoined[],
): {
  pickBySeriesId: Record<string, string>;
  meta: NhlPickResolutionMeta;
} {
  const slotToSeriesId = buildSlotToSeriesIdMap(currentSeriesRows, roundCode);
  const currentSeriesIds = new Set(slotToSeriesId.values());
  const slugToTeamId = buildSlugToTeamIdMap(activeEditionTeams);

  const meta: NhlPickResolutionMeta = {
    directOnActiveCount: 0,
    remappedFromOtherEditionCount: 0,
    remappedBySlotCount: 0,
    remappedTeamIdCount: 0,
    unresolvableCount: 0,
    legacyEditionOnlyCount: 0,
  };

  const pickBySeriesId: Record<string, string> = {};

  for (const row of joinedPickRows) {
    const seriesMeta = row.series;
    if (!seriesMeta || seriesMeta.round_code !== roundCode) {
      meta.unresolvableCount += 1;
      continue;
    }

    if (row.edition_id !== activeEditionId) {
      meta.legacyEditionOnlyCount += 1;
    }

    const slotKey = nhlBracketSlotKey(seriesMeta);
    const targetSeriesId = slotToSeriesId.get(slotKey);
    if (!targetSeriesId) {
      meta.unresolvableCount += 1;
      continue;
    }

    const { teamId, remappedTeam } = resolvePickedTeamIdForActiveEdition(
      row.picked_team_id,
      row.team?.team_slug ?? null,
      slugToTeamId,
    );
    if (!teamId) {
      meta.unresolvableCount += 1;
      continue;
    }

    const onActive = row.edition_id === activeEditionId;
    const directSeries =
      onActive &&
      row.series_id === targetSeriesId &&
      currentSeriesIds.has(row.series_id) &&
      teamId === row.picked_team_id;

    if (directSeries) {
      meta.directOnActiveCount += 1;
    } else if (!onActive) {
      meta.remappedFromOtherEditionCount += 1;
    } else if (row.series_id !== targetSeriesId) {
      meta.remappedBySlotCount += 1;
    }
    if (remappedTeam || teamId !== row.picked_team_id) {
      meta.remappedTeamIdCount += 1;
    }

    pickBySeriesId[targetSeriesId] = teamId;
  }

  return { pickBySeriesId, meta };
}

const R1_PICK_SELECT =
  "edition_id, series_id, picked_team_id, series:nhl_series!inner(round_code, side_or_conference, slot_index), team:nhl_teams!picked_team_id(team_slug)";

const R2_PICK_SELECT =
  "edition_id, series_id, picked_team_id, series:nhl_series!inner(round_code, side_or_conference, slot_index), team:nhl_teams!picked_team_id(team_slug)";

export async function fetchNhlR1PicksResolvedForEdition(
  supabase: SupabaseClient,
  activeEditionId: string,
  currentR1SeriesRows: NhlSeriesRow[],
  activeEditionTeams: { id: string; team_slug: string }[],
): Promise<{
  pickBySeriesId: Record<string, string>;
  error: string | null;
  resolution: NhlPickResolutionMeta | null;
}> {
  const { data, error } = await supabase.from("nhl_r1_series_picks").select(R1_PICK_SELECT);

  if (error) {
    return { pickBySeriesId: {}, error: error.message, resolution: null };
  }

  const joinedRows = (data ?? [])
    .map(normalizePickRowJoined)
    .filter((r): r is PickRowJoined => r !== null);

  const { pickBySeriesId, meta } = resolveNhlPicksOntoCurrentBracket(
    activeEditionId,
    "R1",
    currentR1SeriesRows,
    activeEditionTeams,
    joinedRows,
  );

  return { pickBySeriesId, error: null, resolution: meta };
}

export async function fetchNhlR2PicksResolvedForEdition(
  supabase: SupabaseClient,
  activeEditionId: string,
  currentR2SeriesRows: NhlSeriesRow[],
  activeEditionTeams: { id: string; team_slug: string }[],
): Promise<{
  pickBySeriesId: Record<string, string>;
  error: string | null;
  resolution: NhlPickResolutionMeta | null;
}> {
  const { data, error } = await supabase.from("nhl_r2_series_picks").select(R2_PICK_SELECT);

  if (error) {
    return { pickBySeriesId: {}, error: error.message, resolution: null };
  }

  const joinedRows = (data ?? [])
    .map(normalizePickRowJoined)
    .filter((r): r is PickRowJoined => r !== null);

  const { pickBySeriesId, meta } = resolveNhlPicksOntoCurrentBracket(
    activeEditionId,
    "R2",
    currentR2SeriesRows,
    activeEditionTeams,
    joinedRows,
  );

  return { pickBySeriesId, error: null, resolution: meta };
}

export function hasUnresolvedLegacyPicks(meta: NhlPickResolutionMeta | null): boolean {
  if (!meta) return false;
  return meta.legacyEditionOnlyCount > 0 && meta.unresolvableCount > 0;
}

export function picksLinkageLooksBroken(
  meta: NhlPickResolutionMeta | null,
  pickBySeriesId: Record<string, string>,
): boolean {
  if (!meta) return false;
  const resolved = Object.keys(pickBySeriesId).length;
  const attempted =
    meta.directOnActiveCount +
    meta.remappedFromOtherEditionCount +
    meta.remappedBySlotCount +
    meta.unresolvableCount;
  return attempted > 0 && resolved === 0 && meta.unresolvableCount > 0;
}
