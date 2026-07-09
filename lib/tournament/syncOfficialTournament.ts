import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildScoreImpactMatchResults,
  scoreImpactSignatureFromMatchResults,
} from "@/lib/poolActivity/scoreImpact/buildScoreImpactMatchResults";
import { loadTeamNameMapForEdition } from "@/lib/poolActivity/scoreImpact/loadScoreImpactContext";
import { recomputePoolLedgersWithScoreImpact } from "@/lib/poolActivity/scoreImpact/recomputeWithScoreImpact";
import type { ApplyPhaseLogger } from "./liveScores/applyPhaseLogger";
import {
  publishConfirmedRoundOf32Fixtures,
  type PublishRoundOf32FixturesSummary,
} from "./publishRoundOf32Fixtures";
import { ensureOfficialWc2026LaterKnockoutFixtures } from "./seedOfficialWc2026LaterKnockoutFixtures";
import {
  computeGroupStandings,
  type FinishedGroupMatch,
} from "./groupStandings";
import { ensureThirdPlaceQualifierResults } from "@/lib/scoring/ensureThirdPlaceQualifierResults";
import { postThirdPlaceScoringBackfillNoticesForPools } from "@/lib/poolActivity/thirdPlaceScoringBackfillAnnouncement";
import { buildRoundOf32AdvancementResultInserts } from "./deriveRoundOf32AdvancementResults";
import { winnerFromMatchScores } from "./matchOutcome";

export type SyncOfficialTournamentSummary = {
  /** All matches loaded for the edition. */
  matchCount: number;
  /** Matches with both regulation scores on file (may still be in progress). */
  matchesWithScoresCount: number;
  finishedMatchCount: number;
  derivedResultsInserted: number;
  poolsRecalculated: number;
  syncLockedMatchCount: number;
  patchesApplied: number;
  patchesSkipped: number;
  roundOf32Publish: PublishRoundOf32FixturesSummary | null;
};

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

export type PatchApplyOutcome = {
  applied: string[];
  skipped: Array<{ matchCode: string; reason: "not_found" | "sync_locked" }>;
};

export function applyPatches(matches: DbMatch[], patches: OfficialMatchScorePatch[]): PatchApplyOutcome {
  const byCode = new Map(matches.map((m) => [m.match_code, m]));
  const applied: string[] = [];
  const skipped: PatchApplyOutcome["skipped"] = [];

  for (const p of patches) {
    const row = byCode.get(p.matchCode);
    if (!row) {
      skipped.push({ matchCode: p.matchCode, reason: "not_found" });
      continue;
    }
    if (row.sync_locked) {
      skipped.push({ matchCode: p.matchCode, reason: "sync_locked" });
      continue;
    }
    row.home_goals = p.homeGoals;
    row.away_goals = p.awayGoals;
    if (p.homePenalties !== undefined) row.home_penalties = p.homePenalties;
    if (p.awayPenalties !== undefined) row.away_penalties = p.awayPenalties;
    if (p.status) row.status = p.status;
    applied.push(p.matchCode);
  }

  return { applied, skipped };
}

function snapshotMatchRow(m: DbMatch): string {
  return [
    m.home_team_id ?? "",
    m.away_team_id ?? "",
    m.home_goals ?? "",
    m.away_goals ?? "",
    m.home_penalties ?? "",
    m.away_penalties ?? "",
    m.winner_team_id ?? "",
    m.status,
  ].join("\0");
}

function matchRowChanged(before: DbMatch, after: DbMatch): boolean {
  return snapshotMatchRow(before) !== snapshotMatchRow(after);
}

export function recomputeWinners(matches: DbMatch[]) {
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
export function propagateBracketAdvance(matches: DbMatch[]) {
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
  dirtyMatchIds?: Set<string>,
): Promise<{ error?: string; persistedCount: number }> {
  const now = new Date().toISOString();
  let persistedCount = 0;
  for (const m of matches) {
    if (dirtyMatchIds && !dirtyMatchIds.has(m.id)) continue;
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
    if (error) return { error: error.message, persistedCount };
    persistedCount += 1;
  }
  return { persistedCount };
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
    logger?: ApplyPhaseLogger;
    /** When true, save scores/results/bracket only — skip live pool ledger recompute. */
    skipPoolRecalculation?: boolean;
  },
): Promise<
  | { ok: true; summary: SyncOfficialTournamentSummary; patchOutcome: PatchApplyOutcome }
  | { ok: false; error: string }
> {
  const { editionCode, poolIds, patches = [], logger, skipPoolRecalculation = false } = options;

  try {
  const { data: edition, error: edErr } = await supabase
    .from("tournament_editions")
    .select("id, is_simulation")
    .eq("code", editionCode)
    .maybeSingle();
  if (edErr) return { ok: false, error: edErr.message };
  if (!edition) {
    return { ok: false, error: `Unknown edition "${editionCode}". Run WC2026 seed first.` };
  }

  const editionId = edition.id as string;
  const editionIsSimulation = Boolean(edition.is_simulation);

  const { data: rawMatches, error: mErr } = await supabase
    .from("tournament_matches")
    .select(
      "id, match_code, stage_code, group_code, home_team_id, away_team_id, home_goals, away_goals, home_penalties, away_penalties, winner_team_id, status, home_advance_from_match_id, away_advance_from_match_id, scoring_result_kind, scoring_slot_key, scoring_stage_code, sync_locked",
    )
    .eq("edition_id", editionId);

  if (mErr) return { ok: false, error: mErr.message };
  const matches = (rawMatches ?? []) as DbMatch[];
  const beforeById = new Map(matches.map((m) => [m.id, snapshotMatchRow(m)]));
  const beforeStatusByCode = new Map(matches.map((m) => [m.match_code, m.status]));
  const patchByCode = new Map(patches.map((p) => [p.matchCode, p]));
  const matchByCode = new Map(matches.map((m) => [m.match_code, m]));

  logger?.log("sync.patches_planned", {
    patchCount: patches.length,
    patchMatchCodes: patches.map((p) => p.matchCode),
    poolCount: poolIds.length,
    matchCount: matches.length,
    patchTargets: patches.map((p) => {
      const row = matchByCode.get(p.matchCode);
      return {
        matchCode: p.matchCode,
        previousDbStatus: beforeStatusByCode.get(p.matchCode) ?? null,
        providerStatus: p.status ?? null,
        plannedStatus: p.status ?? "finished",
      };
    }),
  });

  const patchOutcome = applyPatches(matches, patches);
  recomputeWinners(matches);
  propagateBracketAdvance(matches);

  const dirtyMatchIds = new Set<string>();
  for (const m of matches) {
    const before = beforeById.get(m.id);
    if (before == null || before !== snapshotMatchRow(m)) {
      dirtyMatchIds.add(m.id);
    }
  }
  for (const matchCode of patchOutcome.applied) {
    const row = matchByCode.get(matchCode);
    if (row) dirtyMatchIds.add(row.id);
  }

  logger?.log("sync.score_patches_applied", {
    applied: patchOutcome.applied,
    skipped: patchOutcome.skipped,
    dirtyMatchCount: dirtyMatchIds.size,
    patchTargets: patchOutcome.applied.map((matchCode) => {
      const patch = patchByCode.get(matchCode);
      const row = matchByCode.get(matchCode);
      return {
        matchCode,
        previousDbStatus: beforeStatusByCode.get(matchCode) ?? null,
        providerStatus: patch?.status ?? null,
        plannedStatus: patch?.status ?? "finished",
        updatePayloadStatus: row?.status ?? null,
        homeGoals: row?.home_goals ?? null,
        awayGoals: row?.away_goals ?? null,
        winnerTeamId: row?.winner_team_id ?? null,
      };
    }),
  });

  const persistRes = await (logger
    ? logger.time(
        "sync.persist_matches",
        () => persistMatches(supabase, matches, dirtyMatchIds),
        { dirtyMatchCount: dirtyMatchIds.size },
      )
    : persistMatches(supabase, matches, dirtyMatchIds));
  if (persistRes.error) {
    return { ok: false, error: persistRes.error };
  }

  logger?.log("sync.score_writes_complete", {
    persistedCount: persistRes.persistedCount,
  });

  async function logPatchTargetDbStatus(phase: string) {
    if (!logger || patchOutcome.applied.length === 0) return;
    const { data, error } = await supabase
      .from("tournament_matches")
      .select("match_code, status, home_goals, away_goals, winner_team_id")
      .eq("edition_id", editionId)
      .in("match_code", patchOutcome.applied);
    if (error) {
      logger.log(phase, { error: error.message });
      return;
    }
    logger.log(phase, {
      targets: (data ?? []).map((row) => ({
        matchCode: row.match_code,
        postWriteDbStatus: row.status,
        homeGoals: row.home_goals,
        awayGoals: row.away_goals,
        winnerTeamId: row.winner_team_id,
      })),
    });
  }

  await logPatchTargetDbStatus("sync.patch_targets_after_persist");

  const stages = await loadStageIdsByCode(supabase);
  if ("error" in stages) {
    return { ok: false, error: stages.error };
  }
  const stageMap = stages.map;

  const { data: lockedRows, error: lrErr } = await supabase
    .from("results")
    .select("tournament_stage_id, kind, group_code, slot_key")
    .eq("edition_id", editionId)
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

  const { error: delErr } = await supabase
    .from("results")
    .delete()
    .eq("edition_id", editionId)
    .eq("source", "sync");
  if (delErr) return { ok: false, error: delErr.message };

  const resolvedAt = new Date().toISOString();
  const insertByKey = new Map<string, Record<string, unknown>>();

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
      insertByKey.set(wKey, {
        edition_id: editionId,
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
      insertByKey.set(rKey, {
        edition_id: editionId,
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
    insertByKey.set(k, {
      edition_id: editionId,
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

  const roundOf32StageId = stageMap.get("round_of_32");
  const roundOf16StageId = stageMap.get("round_of_16");
  if (roundOf32StageId && roundOf16StageId) {
    const r32AdvancementRows = buildRoundOf32AdvancementResultInserts({
      editionId,
      matches,
      roundOf32StageId,
      roundOf16StageId,
      resolvedAtIso: resolvedAt,
      lockedKeys,
      resultSlotKey,
    });
    for (const row of r32AdvancementRows) {
      const k = resultSlotKey(
        row.tournament_stage_id,
        row.kind,
        row.group_code,
        row.slot_key,
      );
      if (lockedKeys.has(k)) continue;
      insertByKey.set(k, row);
    }
  }

  const inserts = [...insertByKey.values()];

  logger?.log("sync.derived_results_rebuild_start", {
    knockoutResultCandidates: matches.filter(
      (m) => m.scoring_result_kind && m.scoring_stage_code,
    ).length,
    knockoutResultsWithWinner: matches.filter(
      (m) => m.scoring_result_kind && m.scoring_stage_code && m.winner_team_id,
    ).length,
    roundOf32FinishedWithWinner: matches.filter(
      (m) =>
        m.stage_code === "round_of_32" &&
        !m.scoring_result_kind &&
        m.status === "finished" &&
        m.winner_team_id,
    ).length,
    roundOf32AdvancementRows: inserts.filter((r) => r.kind === "round_of_32").length,
    roundOf16FromR32AdvancementRows: inserts.filter(
      (r) => r.kind === "round_of_16" && r.source === "sync",
    ).length,
  });

  if (inserts.length > 0) {
    const { error: insErr } = await supabase.from("results").insert(inserts);
    if (insErr) return { ok: false, error: insErr.message };
  }

  const thirdPlaceEnsure = await ensureThirdPlaceQualifierResults(supabase, editionId);

  logger?.log("sync.derived_results_rebuild_end", {
    insertCount: inserts.length,
    thirdPlaceQualifierUpserted: thirdPlaceEnsure.upsertedCount,
    thirdPlaceQualifierSource: thirdPlaceEnsure.resolution.source,
    poolCount: poolIds.length,
    skipPoolRecalculation,
  });

  let poolsRecalculated = 0;
  if (!skipPoolRecalculation && poolIds.length > 0) {
    const teamNameById = await loadTeamNameMapForEdition(supabase, editionId);
    const matchResults = buildScoreImpactMatchResults({
      matches,
      patches,
      teamNameById,
    });
    const scoreSignature = scoreImpactSignatureFromMatchResults(matchResults);

    const ledgerOut = await recomputePoolLedgersWithScoreImpact(
      supabase,
      poolIds,
      "tournament_sync",
      {
        editionId,
        matchResults,
        scoreSignature,
        thirdPlaceQualifiersNewlyScored: thirdPlaceEnsure.upsertedCount > 0,
      },
      {
        editionIsSimulation,
        onPoolStart: (poolId, index) => {
          logger?.log("sync.pool_recalc_start", { poolId, index, total: poolIds.length });
        },
        onPoolEnd: (poolId, index, error) => {
          logger?.log("sync.pool_recalc_end", {
            poolId,
            index,
            total: poolIds.length,
            ok: !error,
            error: error ?? null,
          });
        },
      },
    );
    if (!ledgerOut.ok) {
      logger?.log("sync.pool_recalc_failed", { error: ledgerOut.error });
      return { ok: false, error: ledgerOut.error };
    }

    poolsRecalculated = poolIds.length;
    logger?.log("sync.pool_recalc_complete", { poolCount: poolIds.length });

    if (thirdPlaceEnsure.upsertedCount > 0) {
      await postThirdPlaceScoringBackfillNoticesForPools(supabase, poolIds);
    }
  } else if (skipPoolRecalculation) {
    logger?.log("sync.pool_recalc_skipped", { poolCount: poolIds.length });
  }

  let roundOf32Publish: PublishRoundOf32FixturesSummary | null = null;
  if (!editionIsSimulation) {
    const publishOut = await publishConfirmedRoundOf32Fixtures(supabase, editionId);
    if (!publishOut.ok) {
      return { ok: false, error: publishOut.error };
    }
    roundOf32Publish = publishOut.summary;
    await logPatchTargetDbStatus("sync.patch_targets_after_r32_publish");
    if (
      publishOut.summary.conflicts.length > 0 ||
      publishOut.summary.confirmedFixturesPublished > 0
    ) {
      console.info("[ashbracket:sync] round of 32 fixture publish", publishOut.summary);
    }
  }

  if (!editionIsSimulation) {
    const laterKoOut = await ensureOfficialWc2026LaterKnockoutFixtures(supabase, editionId);
    if (!laterKoOut.ok) {
      return { ok: false, error: laterKoOut.error };
    }
  }

  const matchesWithScoresCount = matches.filter(
    (m) => m.home_goals != null && m.away_goals != null,
  ).length;
  const finishedMatchCount = matches.filter(
    (m) =>
      m.status === "finished" &&
      m.home_goals != null &&
      m.away_goals != null,
  ).length;
  const syncLockedMatchCount = matches.filter((m) => m.sync_locked).length;

  return {
    ok: true,
    summary: {
      matchCount: matches.length,
      matchesWithScoresCount,
      finishedMatchCount,
      derivedResultsInserted: inserts.length,
      poolsRecalculated,
      syncLockedMatchCount,
      patchesApplied: patchOutcome.applied.length,
      patchesSkipped: patchOutcome.skipped.length,
      roundOf32Publish,
    },
    patchOutcome,
  };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected tournament sync error.";
    logger?.log("sync.failed", { error: message });
    return { ok: false, error: message };
  }
}
