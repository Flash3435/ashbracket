import type { SupabaseClient } from "@supabase/supabase-js";
import { recomputePoolLedgerForPool } from "@/lib/scoring/recomputePoolLedger";
import {
  computeGroupStandings,
  type FinishedGroupMatch,
} from "./groupStandings";
import { winnerFromMatchScores } from "./matchOutcome";

export type OfficialMatchScorePatch = {
  matchCode: string;
  homeGoals: number;
  awayGoals: number;
  homePenalties?: number | null;
  awayPenalties?: number | null;
  status?: "scheduled" | "live" | "finished" | "postponed" | "cancelled";
};

type DbMatch = {
  id: string;
  match_code: string;
  stage_code: string;
  group_code: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
  home_goals: number | null;
  away_goals: number | null;
  home_penalties: number | null;
  away_penalties: number | null;
  winner_team_id: string | null;
  status: string;
  home_advance_from_match_id: string | null;
  away_advance_from_match_id: string | null;
  scoring_result_kind: string | null;
  scoring_slot_key: string | null;
  scoring_stage_code: string | null;
  sync_locked: boolean;
};

function resultSlotKey(
  stageId: string,
  kind: string,
  groupCode: string | null,
  slotKey: string | null,
): string {
  return [stageId, kind, groupCode ?? "", slotKey ?? ""].join("\0");
}

function applyPatches(matches: DbMatch[], patches: OfficialMatchScorePatch[]) {
  const byCode = new Map(matches.map((m) => [m.match_code, m]));
  for (const p of patches) {
    const row = byCode.get(p.matchCode);
    if (!row || row.sync_locked) continue;
    row.home_goals = p.homeGoals;
    row.away_goals = p.awayGoals;
    if (p.homePenalties !== undefined) row.home_penalties = p.homePenalties;
    if (p.awayPenalties !== undefined) row.away_penalties = p.awayPenalties;
    if (p.status) row.status = p.status;
  }
}

function recomputeWinners(matches: DbMatch[]) {
  for (const m of matches) {
    m.winner_team_id = winnerFromMatchScores({
      homeTeamId: m.home_team_id,
      awayTeamId: m.away_team_id,
      homeGoals: m.home_goals,
      awayGoals: m.away_goals,
      homePenalties: m.home_penalties,
      awayPenalties: m.away_penalties,
    });
    if (m.winner_team_id && m.status !== "cancelled" && m.status !== "postponed") {
      m.status = "finished";
    }
  }
}

/**
 * Copy winners into downstream matches until stable (KO bracket).
 */
function propagateBracketAdvance(matches: DbMatch[]) {
  const byId = new Map(matches.map((m) => [m.id, m]));
  let changed = true;
  let guard = 0;
  while (changed && guard < 64) {
    changed = false;
    guard += 1;
    for (const m of matches) {
      if (m.home_advance_from_match_id) {
        const src = byId.get(m.home_advance_from_match_id);
        const w = src?.winner_team_id;
        if (w && m.home_team_id !== w) {
          m.home_team_id = w;
          changed = true;
        }
      }
      if (m.away_advance_from_match_id) {
        const src = byId.get(m.away_advance_from_match_id);
        const w = src?.winner_team_id;
        if (w && m.away_team_id !== w) {
          m.away_team_id = w;
          changed = true;
        }
      }
    }
    recomputeWinners(matches);
  }
}

async function persistMatches(
  supabase: SupabaseClient,
  matches: DbMatch[],
): Promise<{ error?: string }> {
  const now = new Date().toISOString();
  for (const m of matches) {
    const { error } = await supabase
      .from("tournament_matches")
      .update({
        home_team_id: m.home_team_id,
        away_team_id: m.away_team_id,
        home_goals: m.home_goals,
        away_goals: m.away_goals,
        home_penalties: m.home_penalties,
        away_penalties: m.away_penalties,
        winner_team_id: m.winner_team_id,
        status: m.status,
        last_sync_at: now,
      })
      .eq("id", m.id);
    if (error) return { error: error.message };
  }
  return {};
}

async function loadStageIdsByCode(
  supabase: SupabaseClient,
): Promise<{ map: Map<string, string> } | { error: string }> {
  const { data, error } = await supabase
    .from("tournament_stages")
    .select("id, code");
  if (error) return { error: error.message };
  return { map: new Map((data ?? []).map((r) => [r.code as string, r.id as string])) };
}

/**
 * 1) Optional score patches (skipped when `sync_locked`).
 * 2) Recompute winners + bracket propagation via `*_advance_from_match_id`.
 * 3) Persist match rows.
 * 4) Replace `results` rows with `source = 'sync'`, then insert derived group + KO slots (skips locked manual keys).
 * 5) Recompute pool ledger for each pool in `poolIds`.
 */
export async function syncOfficialTournament(
  supabase: SupabaseClient,
  options: {
    editionCode: string;
    poolIds: string[];
    patches?: OfficialMatchScorePatch[];
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { editionCode, poolIds, patches = [] } = options;

  const { data: edition, error: edErr } = await supabase
    .from("tournament_editions")
    .select("id")
    .eq("code", editionCode)
    .maybeSingle();
  if (edErr) return { ok: false, error: edErr.message };
  if (!edition) {
    return { ok: false, error: `Unknown edition "${editionCode}". Run WC2026 seed first.` };
  }

  const editionId = edition.id as string;

  const { data: rawMatches, error: mErr } = await supabase
    .from("tournament_matches")
    .select(
      "id, match_code, stage_code, group_code, home_team_id, away_team_id, home_goals, away_goals, home_penalties, away_penalties, winner_team_id, status, home_advance_from_match_id, away_advance_from_match_id, scoring_result_kind, scoring_slot_key, scoring_stage_code, sync_locked",
    )
    .eq("edition_id", editionId);

  if (mErr) return { ok: false, error: mErr.message };
  const matches = (rawMatches ?? []) as DbMatch[];

  applyPatches(matches, patches);
  recomputeWinners(matches);
  propagateBracketAdvance(matches);

  const persistRes = await persistMatches(supabase, matches);
  if (persistRes.error) {
    return { ok: false, error: persistRes.error };
  }

  const stages = await loadStageIdsByCode(supabase);
  if ("error" in stages) {
    return { ok: false, error: stages.error };
  }
  const stageMap = stages.map;

  const { data: lockedRows, error: lrErr } = await supabase
    .from("results")
    .select("tournament_stage_id, kind, group_code, slot_key")
    .eq("locked", true);
  if (lrErr) return { ok: false, error: lrErr.message };

  const lockedKeys = new Set(
    (lockedRows ?? []).map((r) =>
      resultSlotKey(
        r.tournament_stage_id as string,
        r.kind as string,
        r.group_code as string | null,
        r.slot_key as string | null,
      ),
    ),
  );

  const { error: delErr } = await supabase.from("results").delete().eq("source", "sync");
  if (delErr) return { ok: false, error: delErr.message };

  const resolvedAt = new Date().toISOString();
  const inserts: Record<string, unknown>[] = [];

  const groupStageId = stageMap.get("group");
  if (!groupStageId) {
    return { ok: false, error: 'Missing tournament_stages row for code "group".' };
  }

  const byGroup = new Map<string, DbMatch[]>();
  for (const m of matches) {
    if (m.stage_code !== "group" || !m.group_code) continue;
    const list = byGroup.get(m.group_code) ?? [];
    list.push(m);
    byGroup.set(m.group_code, list);
  }

  for (const [g, gms] of byGroup) {
    const finished: FinishedGroupMatch[] = [];
    for (const m of gms) {
      if (
        m.home_goals === null ||
        m.away_goals === null ||
        !m.home_team_id ||
        !m.away_team_id
      ) {
        continue;
      }
      finished.push({
        homeTeamId: m.home_team_id,
        awayTeamId: m.away_team_id,
        homeGoals: m.home_goals,
        awayGoals: m.away_goals,
      });
    }
    if (finished.length !== 6) continue;

    const teamIds = [
      ...new Set(finished.flatMap((x) => [x.homeTeamId, x.awayTeamId])),
    ];
    if (teamIds.length !== 4) continue;

    const standings = computeGroupStandings(teamIds, finished);
    if (!standings || standings.length < 2) continue;

    const first = standings[0]!;
    const second = standings[1]!;

    const wKey = resultSlotKey(groupStageId, "group_winner", g, null);
    const rKey = resultSlotKey(groupStageId, "group_runner_up", g, null);
    if (!lockedKeys.has(wKey)) {
      inserts.push({
        tournament_stage_id: groupStageId,
        kind: "group_winner",
        team_id: first.teamId,
        group_code: g,
        slot_key: null,
        resolved_at: resolvedAt,
        source: "sync",
        locked: false,
      });
    }
    if (!lockedKeys.has(rKey)) {
      inserts.push({
        tournament_stage_id: groupStageId,
        kind: "group_runner_up",
        team_id: second.teamId,
        group_code: g,
        slot_key: null,
        resolved_at: resolvedAt,
        source: "sync",
        locked: false,
      });
    }
  }

  for (const m of matches) {
    if (!m.scoring_result_kind || !m.scoring_stage_code || !m.winner_team_id) continue;
    const stageId = stageMap.get(m.scoring_stage_code);
    if (!stageId) continue;
    const slotKey = m.scoring_slot_key ?? null;
    const k = resultSlotKey(
      stageId,
      m.scoring_result_kind,
      null,
      slotKey,
    );
    if (lockedKeys.has(k)) continue;
    inserts.push({
      tournament_stage_id: stageId,
      kind: m.scoring_result_kind,
      team_id: m.winner_team_id,
      group_code: null,
      slot_key: slotKey,
      resolved_at: resolvedAt,
      source: "sync",
      locked: false,
    });
  }

  if (inserts.length > 0) {
    const { error: insErr } = await supabase.from("results").insert(inserts);
    if (insErr) return { ok: false, error: insErr.message };
  }

  for (const poolId of poolIds) {
    const ledger = await recomputePoolLedgerForPool(poolId);
    if (ledger.error) {
      return { ok: false, error: ledger.error };
    }
  }

  return { ok: true };
}
