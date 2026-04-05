import type { Result, Team, TournamentStage } from "../../src/types/domain";

export function mapTeamRow(row: {
  id: string;
  name: string;
  country_code: string;
  fifa_code: string | null;
  created_at: string;
  updated_at: string;
}): Team {
  return {
    id: row.id,
    name: row.name,
    countryCode: row.country_code,
    fifaCode: row.fifa_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapTournamentStageRow(row: {
  id: string;
  code: string;
  label: string;
  sort_order: number;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
}): TournamentStage {
  return {
    id: row.id,
    code: row.code as TournamentStage["code"],
    label: row.label,
    sortOrder: row.sort_order,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapResultRow(row: {
  id: string;
  tournament_stage_id: string;
  kind: string;
  team_id: string;
  group_code: string | null;
  slot_key: string | null;
  value_text: string | null;
  resolved_at: string;
  created_at: string;
  source?: string | null;
  locked?: boolean | null;
}): Result {
  return {
    id: row.id,
    tournamentStageId: row.tournament_stage_id,
    kind: row.kind as Result["kind"],
    teamId: row.team_id,
    groupCode: row.group_code,
    slotKey: row.slot_key,
    valueText: row.value_text,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    source:
      row.source === "sync" || row.source === "manual"
        ? row.source
        : undefined,
    locked: row.locked ?? undefined,
  };
}
