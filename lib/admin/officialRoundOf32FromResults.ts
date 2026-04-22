import type { Result, Team } from "../../src/types/domain";
import {
  r32SlotKeysForMatchIndex,
  WC2026_R32_MATCH_DEFS,
  type Wc2026R32SideSpec,
} from "../bracket/wc2026RoundOf32";
import { wc2026ThirdRoutedSideDisplayLabel } from "../tournament/worldcup2026ThirdPlaceMapping";
import { parseValidateAndResolveOfficialR32 } from "./officialRoundOf32Validation";

export type OfficialRoundOf32UpsertRow = {
  tournament_stage_id: string;
  kind: "round_of_32";
  team_id: string;
  group_code: null;
  slot_key: string;
  resolved_at: string;
  source: "manual";
  locked: boolean;
};

export type OfficialR32PreviewSide = {
  teamId: string;
  teamName: string;
  countryCode: string;
  /** FIFA route label for `third_routed` sides (e.g. `3 ABCDF`); null for fixed seeds. */
  routeLabel: string | null;
};

export type OfficialR32PreviewMatch = {
  fifaMatchNo: number;
  home: OfficialR32PreviewSide;
  away: OfficialR32PreviewSide;
};

function teamLine(
  teamById: Map<string, Team>,
  teamId: string,
  spec: Wc2026R32SideSpec,
): OfficialR32PreviewSide {
  const t = teamById.get(teamId);
  const routeLabel =
    spec.kind === "third_routed" ? wc2026ThirdRoutedSideDisplayLabel(spec.winnerSlot) : null;
  return {
    teamId,
    teamName: t?.name ?? "Unknown team",
    countryCode: t?.countryCode ?? "",
    routeLabel,
  };
}

/** Compact human-readable pairings for admin confirmation before upsert. */
export function buildOfficialRoundOf32PreviewMatches(
  slotTeamIdByKey: Record<string, string>,
  teams: Team[],
): OfficialR32PreviewMatch[] {
  const teamById = new Map(teams.map((x) => [x.id, x]));
  return WC2026_R32_MATCH_DEFS.map((def, i) => {
    const { top: topKey, bottom: botKey } = r32SlotKeysForMatchIndex(i);
    const homeId = slotTeamIdByKey[topKey] ?? "";
    const awayId = slotTeamIdByKey[botKey] ?? "";
    return {
      fifaMatchNo: def.fifaMatchNo,
      home: teamLine(teamById, homeId, def.top),
      away: teamLine(teamById, awayId, def.bottom),
    };
  });
}

/**
 * Builds `results` upsert rows for all 32 `round_of_32` slots from official group
 * outcomes and the eight `third_place_qualifier` teams already stored on the
 * Round of 32 stage.
 */
export function buildOfficialRoundOf32UpsertRows(input: {
  roundOf32StageId: string;
  groupStageId: string;
  results: Result[];
  teams: Team[];
  groupTeamCountryCodesByLetter: Record<string, string[]>;
  resolvedAtIso?: string;
}):
  | { ok: true; rows: OfficialRoundOf32UpsertRow[] }
  | { ok: false; error: string } {
  const { roundOf32StageId, groupStageId, results, teams, groupTeamCountryCodesByLetter } =
    input;
  const resolvedAt = input.resolvedAtIso ?? new Date().toISOString();

  const parsed = parseValidateAndResolveOfficialR32({
    results,
    groupStageId,
    roundOf32StageId,
    teams,
    groupTeamCountryCodesByLetter,
  });
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const rows: OfficialRoundOf32UpsertRow[] = [];
  for (let slot = 1; slot <= 32; slot += 1) {
    const slotKey = String(slot);
    const teamId = parsed.data.slotTeamIdByKey[slotKey];
    if (!teamId) {
      return { ok: false, error: `Internal error: missing team for slot ${slotKey}.` };
    }
    rows.push({
      tournament_stage_id: roundOf32StageId,
      kind: "round_of_32",
      team_id: teamId,
      group_code: null,
      slot_key: slotKey,
      resolved_at: resolvedAt,
      source: "manual",
      locked: true,
    });
  }

  return { ok: true, rows };
}
