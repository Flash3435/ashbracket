"use server";

import { assertCanManagePool } from "@/lib/admin/assertCanManagePool";
import {
  buildOfficialRoundOf32PreviewMatches,
  buildOfficialRoundOf32UpsertRows,
} from "@/lib/admin/officialRoundOf32FromResults";
import { normalizeClientR32SlotMap } from "@/lib/admin/normalizeClientR32SlotMap";
import {
  officialR32SlotMapsEqual,
  parseValidateAndResolveOfficialR32,
} from "@/lib/admin/officialRoundOf32Validation";
import { logAdminRiskAction } from "@/lib/admin/adminRiskAuditLog";
import { logPilotVerificationEvent } from "@/lib/admin/pilotVerificationLog";
import { fetchEditionImpactSummary, fetchPoolImpactSummary } from "@/lib/admin/fetchAdminImpactSummary";
import { checkProductionAdminAck } from "@/lib/admin/requireProductionAdminAck";
import { createClient } from "@/lib/supabase/server";
import { isGlobalAdmin } from "../../../../lib/auth/permissions";
import { mapResultRow, mapTeamRow } from "@/lib/results/mapRows";
import { ensureSimulationPoolScoringConfig } from "@/lib/scoring/ensureSimulationPoolScoringConfig";
import { TEAM_TABLE_SELECT } from "@/lib/teams/teamDbSelect";
import {
  fetchOfficialLiveEdition,
  poolIdsForEdition,
  type TournamentEditionRow,
} from "@/lib/tournament/editionScope";
import { fetchGroupTeamCountryCodesForEdition } from "@/lib/tournament/fetchGroupTeamCountryCodesForEdition";
import { recomputePoolsForEdition } from "@/lib/tournament/recomputePoolsForEdition";
import { recomputePoolLedgerForPool } from "@/lib/scoring/recomputePoolLedger";
import { revalidatePath } from "next/cache";
import type { Result, Team } from "../../../../src/types/domain";
import type { OfficialR32PreviewMatch } from "@/lib/admin/officialRoundOf32FromResults";

const KNOCKOUT_KINDS = [
  "round_of_32",
  "round_of_16",
  "quarterfinalist",
  "semifinalist",
  "finalist",
  "champion",
  "third_place_qualifier",
] as const;

const EDITABLE_RESULT_KINDS = [
  ...KNOCKOUT_KINDS,
  "group_winner",
  "group_runner_up",
] as const;

export type SetKnockoutResultResult =
  | { ok: true }
  | { ok: false; error: string };

function messageFromUnknown(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong.";
}

function isEditableResultKind(k: string): boolean {
  return (EDITABLE_RESULT_KINDS as readonly string[]).includes(k);
}

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

async function requireGlobalAdminEdition(
  supabase: SupabaseServer,
  editionId: string,
): Promise<{ ok: true; edition: TournamentEditionRow } | { ok: false; error: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await isGlobalAdmin(supabase))) {
    return {
      ok: false,
      error: "Only global administrators can edit tournament results.",
    };
  }

  const { data, error } = await supabase
    .from("tournament_editions")
    .select("id, code, name, is_simulation")
    .eq("id", editionId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Tournament edition not found." };

  return {
    ok: true,
    edition: {
      id: data.id as string,
      code: data.code as string,
      name: data.name as string,
      isSimulation: Boolean(data.is_simulation),
    },
  };
}

async function recomputeAfterEditionResultEdit(
  supabase: SupabaseServer,
  editionId: string,
): Promise<RecomputeStandingsResult> {
  const out = await recomputePoolsForEdition(
    supabase,
    editionId,
    "admin_result_edit",
  );
  if (!out.ok) return out;
  revalidatePath("/admin/results");
  return { ok: true };
}

export type RecomputeStandingsResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Re-runs deterministic scoring for one pool (global or pool admin for that pool).
 */
export async function recomputeStandingsForPoolAction(input: {
  poolId: string;
  productionAcknowledged?: boolean;
}): Promise<RecomputeStandingsResult> {
  try {
    const ack = checkProductionAdminAck(input.productionAcknowledged);
    if (!ack.ok) return ack;

    const supabase = await createClient();
    const poolId = input.poolId.trim();
    const gate = await assertCanManagePool(supabase, poolId);
    if (!gate.ok) return { ok: false, error: gate.error };

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const impact = await fetchPoolImpactSummary(supabase, poolId);
    const seededPoolScoring = await ensureSimulationPoolScoringConfig(supabase, [poolId]);
    if (!seededPoolScoring.ok) {
      return { ok: false, error: seededPoolScoring.error };
    }

    const ledger = await recomputePoolLedgerForPool(poolId, {
      ledgerTrigger: "admin_manual_recompute",
    });
    if (ledger.error) {
      return { ok: false, error: ledger.error };
    }

    logAdminRiskAction({
      action: "pool_recompute",
      userId: user?.id ?? null,
      userEmail: user?.email,
      poolId,
      poolName: impact?.poolName,
      editionId: impact?.editionId,
      editionCode: impact?.editionCode,
      isSimulation: impact?.isSimulation,
      affectedPoolCount: 1,
      affectedParticipantCount: impact?.participantCount,
    });

    return { ok: true };
  } catch (e) {
    return { ok: false, error: messageFromUnknown(e) };
  }
}

/**
 * Recomputes ledger for every **live** pool on the official edition. Global admins only.
 */
export async function recomputeAllPoolsLedgerAction(input?: {
  productionAcknowledged?: boolean;
}): Promise<RecomputeStandingsResult> {
  try {
    const ack = checkProductionAdminAck(input?.productionAcknowledged);
    if (!ack.ok) return ack;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!(await isGlobalAdmin(supabase))) {
      return {
        ok: false,
        error: "Only global administrators can refresh all pool leaderboards.",
      };
    }

    const liveEdition = await fetchOfficialLiveEdition(supabase);
    if (!liveEdition) {
      return { ok: false, error: "Official live tournament edition is not installed." };
    }

    const impact = await fetchEditionImpactSummary(supabase, liveEdition.id);
    const out = await recomputePoolsForEdition(
      supabase,
      liveEdition.id,
      "admin_recompute_all_pools",
    );
    if (!out.ok) return out;

    logAdminRiskAction({
      action: "edition_recompute_pools",
      userId: user?.id ?? null,
      userEmail: user?.email,
      editionId: liveEdition.id,
      editionCode: liveEdition.code,
      isSimulation: false,
      affectedPoolCount: impact?.poolCount,
      affectedParticipantCount: impact?.participantCount,
    });

    revalidatePath("/admin/results");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: messageFromUnknown(e) };
  }
}

/**
 * Recomputes every pool tied to a specific edition (live or simulation). Global admins only.
 */
export async function recomputeEditionPoolsLedgerAction(input: {
  editionId: string;
  productionAcknowledged?: boolean;
}): Promise<RecomputeStandingsResult> {
  try {
    const ack = checkProductionAdminAck(input.productionAcknowledged);
    if (!ack.ok) return ack;

    const supabase = await createClient();
    const gate = await requireGlobalAdminEdition(supabase, input.editionId.trim());
    if (!gate.ok) return gate;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const impact = await fetchEditionImpactSummary(supabase, gate.edition.id);
    if (gate.edition.isSimulation) {
      const poolIds = await poolIdsForEdition(supabase, gate.edition.id);
      const seededPoolScoring = await ensureSimulationPoolScoringConfig(supabase, poolIds);
      if (!seededPoolScoring.ok) {
        return { ok: false, error: seededPoolScoring.error };
      }
    }

    const out = await recomputePoolsForEdition(
      supabase,
      gate.edition.id,
      "admin_recompute_all_pools",
    );
    if (!out.ok) return out;

    logAdminRiskAction({
      action: "edition_recompute_pools",
      userId: user?.id ?? null,
      userEmail: user?.email,
      editionId: gate.edition.id,
      editionCode: gate.edition.code,
      isSimulation: gate.edition.isSimulation,
      affectedPoolCount: impact?.poolCount,
      affectedParticipantCount: impact?.participantCount,
    });

    if (gate.edition.isSimulation) {
      await logPilotVerificationEvent(supabase, {
        eventType: "simulation_results_recomputed",
        userId: user?.id ?? null,
        message: `Recalculated ${impact?.poolCount ?? 0} simulation pool leaderboard(s) for edition ${gate.edition.code}.`,
        payload: {
          editionId: gate.edition.id,
          poolCount: impact?.poolCount,
        },
      });
    }

    revalidatePath("/admin/results");
    revalidatePath("/admin/pilot");
    revalidatePath(`/admin/simulation/editions/${gate.edition.id}/results`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: messageFromUnknown(e) };
  }
}

/**
 * Saves knockout result rows for one tournament edition. **Global admins only.**
 * Recomputes ledgers only for pools bound to that edition.
 */
export async function setKnockoutResultAction(input: {
  editionId: string;
  tournamentStageId: string;
  kind: string;
  slotKey: string | null;
  /** For group-stage rows: uppercase letter A–L; bracket rows omit or null. */
  groupCode?: string | null;
  teamId: string | null;
}): Promise<SetKnockoutResultResult> {
  if (!isEditableResultKind(input.kind)) {
    return { ok: false, error: "Invalid result kind." };
  }

  try {
    const supabase = await createClient();
    const gate = await requireGlobalAdminEdition(supabase, input.editionId.trim());
    if (!gate.ok) return gate;

    const editionId = gate.edition.id;
    const gc =
      input.groupCode != null && String(input.groupCode).trim() !== ""
        ? String(input.groupCode).trim().toUpperCase()
        : null;

    if (!input.teamId) {
      let q = supabase
        .from("results")
        .delete()
        .eq("edition_id", editionId)
        .eq("tournament_stage_id", input.tournamentStageId)
        .eq("kind", input.kind);

      q = gc ? q.eq("group_code", gc) : q.is("group_code", null);

      q =
        input.slotKey === null
          ? q.is("slot_key", null)
          : q.eq("slot_key", input.slotKey);

      const { error } = await q;
      if (error) return { ok: false, error: error.message };
    } else {
      const resolvedAt = new Date().toISOString();
      const { error } = await supabase.from("results").upsert(
        {
          edition_id: editionId,
          tournament_stage_id: input.tournamentStageId,
          kind: input.kind,
          team_id: input.teamId,
          group_code: gc,
          slot_key: input.slotKey,
          resolved_at: resolvedAt,
          source: "manual",
          locked: true,
        },
        {
          onConflict: "edition_id,tournament_stage_id,kind,group_code,slot_key",
        },
      );

      if (error) return { ok: false, error: error.message };
    }

    const recompute = await recomputeAfterEditionResultEdit(supabase, editionId);
    if (!recompute.ok) {
      return {
        ok: false,
        error: `Result saved, but pool leaderboards could not be refreshed: ${recompute.error}`,
      };
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const impact = await fetchEditionImpactSummary(supabase, editionId);
    logAdminRiskAction({
      action: "edition_results_edit",
      userId: user?.id ?? null,
      userEmail: user?.email,
      editionId: gate.edition.id,
      editionCode: gate.edition.code,
      isSimulation: gate.edition.isSimulation,
      affectedPoolCount: impact?.poolCount,
      affectedParticipantCount: impact?.participantCount,
      detail: `${input.kind} slot saved`,
    });

    return { ok: true };
  } catch (e) {
    return { ok: false, error: messageFromUnknown(e) };
  }
}

export type ApplyOfficialRoundOf32Result =
  | { ok: true; message: string }
  | { ok: false; error: string };

export type PreviewOfficialRoundOf32Result =
  | { ok: true; matches: OfficialR32PreviewMatch[]; slotTeamIdByKey: Record<string, string> }
  | { ok: false; error: string };

async function fetchOfficialR32ResolutionData(
  supabase: SupabaseServer,
  editionId: string,
): Promise<
  | { ok: false; error: string }
  | {
      ok: true;
      groupStageId: string;
      r32StageId: string;
      results: Result[];
      teams: Team[];
      groupTeamCountryCodesByLetter: Record<string, string[]>;
    }
> {
  const { data: stageRows, error: stErr } = await supabase
    .from("tournament_stages")
    .select("id, code")
    .in("code", ["group", "round_of_32"]);

  if (stErr) return { ok: false, error: stErr.message };
  const groupStageId = stageRows?.find((s) => s.code === "group")?.id as string | undefined;
  const r32StageId = stageRows?.find((s) => s.code === "round_of_32")?.id as string | undefined;
  if (!groupStageId || !r32StageId) {
    return {
      ok: false,
      error: "Tournament stages `group` and `round_of_32` must exist before resolving the Round of 32.",
    };
  }

  const { data: groupResRows, error: gErr } = await supabase
    .from("results")
    .select(
      "id, tournament_stage_id, kind, team_id, group_code, slot_key, value_text, resolved_at, created_at, edition_id",
    )
    .eq("edition_id", editionId)
    .eq("tournament_stage_id", groupStageId)
    .in("kind", ["group_winner", "group_runner_up"]);

  if (gErr) return { ok: false, error: gErr.message };

  const { data: thirdResRows, error: tErr } = await supabase
    .from("results")
    .select(
      "id, tournament_stage_id, kind, team_id, group_code, slot_key, value_text, resolved_at, created_at, edition_id",
    )
    .eq("edition_id", editionId)
    .eq("tournament_stage_id", r32StageId)
    .eq("kind", "third_place_qualifier");

  if (tErr) return { ok: false, error: tErr.message };

  const { data: teamRows, error: teamErr } = await supabase
    .from("teams")
    .select(TEAM_TABLE_SELECT)
    .order("name", { ascending: true });

  if (teamErr) return { ok: false, error: teamErr.message };

  const teams = (teamRows ?? []).map(mapTeamRow);
  type ResRow = Parameters<typeof mapResultRow>[0];
  const results: Result[] = [...(groupResRows ?? []), ...(thirdResRows ?? [])].map((r) =>
    mapResultRow(r as ResRow),
  );

  const groupTeamCountryCodesByLetter =
    await fetchGroupTeamCountryCodesForEdition(supabase, editionId);

  return {
    ok: true,
    groupStageId,
    r32StageId,
    results,
    teams,
    groupTeamCountryCodesByLetter,
  };
}

/**
 * Validates official inputs and returns the resolved R32 pairings for admin review
 * (no database writes).
 */
export async function previewOfficialRoundOf32FromEnteredResultsAction(
  editionId: string,
): Promise<PreviewOfficialRoundOf32Result> {
  try {
    const supabase = await createClient();
    const gate = await requireGlobalAdminEdition(supabase, editionId.trim());
    if (!gate.ok) return gate;

    const bundle = await fetchOfficialR32ResolutionData(supabase, gate.edition.id);
    if (!bundle.ok) return bundle;

    const parsed = parseValidateAndResolveOfficialR32({
      results: bundle.results,
      groupStageId: bundle.groupStageId,
      roundOf32StageId: bundle.r32StageId,
      teams: bundle.teams,
      groupTeamCountryCodesByLetter: bundle.groupTeamCountryCodesByLetter,
    });
    if (!parsed.ok) return parsed;

    return {
      ok: true,
      slotTeamIdByKey: parsed.data.slotTeamIdByKey,
      matches: buildOfficialRoundOf32PreviewMatches(
        parsed.data.slotTeamIdByKey,
        bundle.teams,
      ),
    };
  } catch (e) {
    return { ok: false, error: messageFromUnknown(e) };
  }
}

/**
 * Writes all 32 official `round_of_32` result rows after validation and confirmation.
 * `slotTeamIdByKey` must match a fresh server-side resolution (same payload as preview).
 */
export async function applyOfficialRoundOf32FromEnteredResultsAction(input: {
  editionId: string;
  slotTeamIdByKey: Record<string, string>;
}): Promise<ApplyOfficialRoundOf32Result> {
  try {
    const normalized = normalizeClientR32SlotMap(input.slotTeamIdByKey);
    if (!normalized.ok) return { ok: false, error: normalized.error };

    const supabase = await createClient();
    const gate = await requireGlobalAdminEdition(supabase, input.editionId.trim());
    if (!gate.ok) return gate;

    const bundle = await fetchOfficialR32ResolutionData(supabase, gate.edition.id);
    if (!bundle.ok) return bundle;

    const parsed = parseValidateAndResolveOfficialR32({
      results: bundle.results,
      groupStageId: bundle.groupStageId,
      roundOf32StageId: bundle.r32StageId,
      teams: bundle.teams,
      groupTeamCountryCodesByLetter: bundle.groupTeamCountryCodesByLetter,
    });
    if (!parsed.ok) return { ok: false, error: parsed.error };

    if (!officialR32SlotMapsEqual(normalized.slotTeamIdByKey, parsed.data.slotTeamIdByKey)) {
      return {
        ok: false,
        error:
          "That preview no longer matches the current official results. Generate a new preview, then apply again (without changing group or third-place rows in between).",
      };
    }

    const built = buildOfficialRoundOf32UpsertRows({
      roundOf32StageId: bundle.r32StageId,
      groupStageId: bundle.groupStageId,
      results: bundle.results,
      teams: bundle.teams,
      groupTeamCountryCodesByLetter: bundle.groupTeamCountryCodesByLetter,
    });
    if (!built.ok) return { ok: false, error: built.error };

    const rowsWithEdition = built.rows.map((row) => ({
      ...row,
      edition_id: gate.edition.id,
    }));

    const { error: upErr } = await supabase.from("results").upsert(rowsWithEdition, {
      onConflict: "edition_id,tournament_stage_id,kind,group_code,slot_key",
    });
    if (upErr) return { ok: false, error: upErr.message };

    const recompute = await recomputeAfterEditionResultEdit(supabase, gate.edition.id);
    if (!recompute.ok) {
      return {
        ok: false,
        error: `Round of 32 saved, but leaderboard recompute failed: ${recompute.error}`,
      };
    }

    revalidatePath("/admin/results");
    revalidatePath(`/admin/simulation/editions/${gate.edition.id}/results`);
    return {
      ok: true,
      message:
        "Applied FIFA Annex C: all 32 Round of 32 slots were saved. Pool scores were refreshed.",
    };
  } catch (e) {
    return { ok: false, error: messageFromUnknown(e) };
  }
}
