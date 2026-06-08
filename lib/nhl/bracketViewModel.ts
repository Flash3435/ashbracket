import type { NhlSeriesRow } from "./types";

/** Conference half of the playoff tree for read-only admin bracket UI. */
export type NhlAdminConferenceBracket = {
  r1: NhlSeriesRow[];
  r2: NhlSeriesRow[];
  cf: NhlSeriesRow | null;
};

export type NhlAdminBracketViewModel = {
  east: NhlAdminConferenceBracket;
  west: NhlAdminConferenceBracket;
  scf: NhlSeriesRow | null;
};

function bySlot(rows: NhlSeriesRow[]): NhlSeriesRow[] {
  return [...rows].sort((a, b) => a.slot_index - b.slot_index);
}

function pickConference(
  rows: NhlSeriesRow[],
  side: "east" | "west",
): NhlAdminConferenceBracket {
  const sideRows = rows.filter((r) => r.side_or_conference === side);
  const r1 = bySlot(sideRows.filter((r) => r.round_code === "R1"));
  const r2 = bySlot(sideRows.filter((r) => r.round_code === "R2"));
  const cfRows = sideRows.filter((r) => r.round_code === "CF");
  const cf = cfRows[0] ?? null;
  return { r1, r2, cf };
}

/**
 * Groups flat `nhl_series` rows (with joined team labels) for East / West / SCF columns.
 */
export function buildNhlAdminBracketViewModel(
  rows: NhlSeriesRow[],
): NhlAdminBracketViewModel {
  const scfRows = rows.filter((r) => r.round_code === "SCF");
  const scf = scfRows[0] ?? null;
  return {
    east: pickConference(rows, "east"),
    west: pickConference(rows, "west"),
    scf,
  };
}

export function roundLabel(roundCode: string): string {
  switch (roundCode) {
    case "R1":
      return "Round 1";
    case "R2":
      return "Round 2";
    case "CF":
      return "Conference Final";
    case "SCF":
      return "Stanley Cup Final";
    default:
      return roundCode;
  }
}
