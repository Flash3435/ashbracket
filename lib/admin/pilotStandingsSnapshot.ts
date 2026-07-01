import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import { fetchPoolLedgerLinesForStandings } from "@/lib/leaderboard/fetchPoolLedgerLinesForStandings";
import { fetchWcLedgerRecomputeDiagnosticsForPools } from "./wcLedgerRecomputeDiagnostics";

export type PilotStandingsRow = {
  participantId: string;
  displayName: string;
  totalPoints: number;
  rank: number;
};

export type PilotStandingsCapture = {
  rows: PilotStandingsRow[];
  summaryHash: string;
  ledgerRecomputedAt: string | null;
};

export function hashPilotStandingsRows(rows: PilotStandingsRow[]): string {
  const normalized = [...rows]
    .sort((a, b) => a.participantId.localeCompare(b.participantId))
    .map((r) => ({
      participantId: r.participantId,
      totalPoints: r.totalPoints,
      rank: r.rank,
    }));
  return createHash("sha256")
    .update(JSON.stringify(normalized))
    .digest("hex")
    .slice(0, 16);
}

export async function capturePoolStandingsState(
  supabase: SupabaseClient,
  poolId: string,
): Promise<PilotStandingsCapture> {
  const { data: participants, error: pErr } = await supabase
    .from("participants")
    .select("id, display_name")
    .eq("pool_id", poolId);

  if (pErr) throw new Error(pErr.message);

  const ledgerRes = await fetchPoolLedgerLinesForStandings(supabase, poolId);
  if (!ledgerRes.ok) throw new Error(ledgerRes.error);

  const totals = new Map<string, number>();
  for (const p of participants ?? []) {
    totals.set(p.id as string, 0);
  }
  for (const line of ledgerRes.ledgerLines) {
    const pid = line.participant_id;
    const delta = Number(line.points_delta ?? 0);
    totals.set(pid, (totals.get(pid) ?? 0) + delta);
  }

  const withNames: { participantId: string; displayName: string; totalPoints: number }[] =
    (participants ?? []).map((p) => ({
      participantId: p.id as string,
      displayName: String(p.display_name ?? "").trim() || "—",
      totalPoints: totals.get(p.id as string) ?? 0,
    }));

  withNames.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    return a.displayName.localeCompare(b.displayName, undefined, {
      sensitivity: "base",
    });
  });

  const rows: PilotStandingsRow[] = withNames.map((r, i) => ({
    ...r,
    rank: i + 1,
  }));

  const { rows: diagRows } = await fetchWcLedgerRecomputeDiagnosticsForPools(
    supabase,
    [poolId],
  );
  const ledgerRecomputedAt = diagRows[0]?.lastSuccessAt ?? null;

  return {
    rows,
    summaryHash: hashPilotStandingsRows(rows),
    ledgerRecomputedAt,
  };
}

export type PilotStandingsCompareResult = {
  matches: boolean;
  baselineHash: string;
  currentHash: string;
  rowCountBaseline: number;
  rowCountCurrent: number;
  diffs: { participantId: string; displayName: string; baselinePoints: number; currentPoints: number }[];
};

export function comparePilotStandings(
  baseline: PilotStandingsRow[],
  current: PilotStandingsRow[],
): PilotStandingsCompareResult {
  const baselineHash = hashPilotStandingsRows(baseline);
  const currentHash = hashPilotStandingsRows(current);
  const baseById = new Map(baseline.map((r) => [r.participantId, r]));
  const curById = new Map(current.map((r) => [r.participantId, r]));
  const ids = new Set([...baseById.keys(), ...curById.keys()]);
  const diffs: PilotStandingsCompareResult["diffs"] = [];

  for (const id of ids) {
    const b = baseById.get(id);
    const c = curById.get(id);
    const bp = b?.totalPoints ?? 0;
    const cp = c?.totalPoints ?? 0;
    if (bp !== cp) {
      diffs.push({
        participantId: id,
        displayName: c?.displayName ?? b?.displayName ?? id,
        baselinePoints: bp,
        currentPoints: cp,
      });
    }
  }

  return {
    matches: baselineHash === currentHash && diffs.length === 0,
    baselineHash,
    currentHash,
    rowCountBaseline: baseline.length,
    rowCountCurrent: current.length,
    diffs,
  };
}
