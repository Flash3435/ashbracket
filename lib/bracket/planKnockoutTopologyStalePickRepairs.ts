import { createHash } from "node:crypto";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type {
  TopologyAuditSlot,
  TopologyPickRowState,
  TopologyStalePickFinding,
} from "./auditKnockoutTopologyStalePicks";

export type TopologyRepairPlanFilters = {
  onlyStaleFinalists?: boolean;
  onlyStaleChampions?: boolean;
};

export type TopologyStalePickRepairAction = {
  poolId: string;
  poolName: string;
  participantId: string;
  participantName: string;
  participantEmail: string | null;
  predictionKind: "semifinalist" | "finalist" | "champion";
  slotKey: string | null;
  tournamentStageId: string;
  slot: TopologyAuditSlot;
  savedTeamId: string;
  savedTeamName: string;
  reason: string;
  beforeValue: string;
  afterValue: string;
  rowState: TopologyPickRowState;
};

const CLEAR_REASON_PREFIX =
  "Cleared after FIFA 2026 semi-final feeder topology correction (M101=M97+M98, M102=M99+M100).";

/** One clear per saved slot even when audit emits duplicate findings. */
export function dedupeStaleFindingsForRepair(
  stalePicks: readonly TopologyStalePickFinding[],
): TopologyStalePickFinding[] {
  const bySlot = new Map<string, TopologyStalePickFinding>();
  for (const finding of stalePicks) {
    const key = `${finding.predictionKind}|${finding.slotKey ?? ""}|${finding.savedTeamId}`;
    const existing = bySlot.get(key);
    if (!existing) {
      bySlot.set(key, finding);
      continue;
    }
    if (
      finding.topologyIssue === "wrong_semifinal_branch" &&
      existing.topologyIssue === "same_branch_final_pair"
    ) {
      bySlot.set(key, finding);
    }
  }
  return [...bySlot.values()];
}

export function filterStaleFindingsForRepair(
  findings: readonly TopologyStalePickFinding[],
  filters: TopologyRepairPlanFilters,
): TopologyStalePickFinding[] {
  if (filters.onlyStaleFinalists) {
    return findings.filter((f) => f.predictionKind === "finalist");
  }
  if (filters.onlyStaleChampions) {
    return findings.filter((f) => f.predictionKind === "champion");
  }
  return [...findings];
}

function slotRow(
  slots: KnockoutPickSlotDraft[],
  kind: TopologyStalePickFinding["predictionKind"],
  slotKey: string | null,
): KnockoutPickSlotDraft | undefined {
  return slots.find(
    (s) => s.predictionKind === kind && s.slotKey === slotKey,
  );
}

export function planClearsFromStaleFindings(input: {
  poolId: string;
  poolName: string;
  participantId: string;
  participantName: string;
  participantEmail: string | null;
  slots: KnockoutPickSlotDraft[];
  staleFindings: readonly TopologyStalePickFinding[];
}): TopologyStalePickRepairAction[] {
  const deduped = dedupeStaleFindingsForRepair(input.staleFindings);
  const actions: TopologyStalePickRepairAction[] = [];

  for (const finding of deduped) {
    // Never delete persisted champion rows. An eliminated / path-invalid champion
    // must remain for display ("Champion pick: X" + out status). Audit still
    // reports stale champions separately; repair only clears SF+/finalist slots.
    if (finding.predictionKind === "champion") continue;

    const row = slotRow(input.slots, finding.predictionKind, finding.slotKey);
    if (!row?.teamId.trim()) continue;
    if (row.teamId.trim() !== finding.savedTeamId) continue;

    actions.push({
      poolId: input.poolId,
      poolName: input.poolName,
      participantId: input.participantId,
      participantName: input.participantName,
      participantEmail: input.participantEmail,
      predictionKind: finding.predictionKind,
      slotKey: finding.slotKey,
      tournamentStageId: row.tournamentStageId,
      slot: finding.slot,
      savedTeamId: finding.savedTeamId,
      savedTeamName: finding.savedTeamName,
      reason: `${CLEAR_REASON_PREFIX} ${finding.reason}`,
      beforeValue: finding.savedTeamName,
      afterValue: "",
      rowState: finding.rowState,
    });
  }

  return actions.sort((a, b) =>
    `${a.participantName}|${a.predictionKind}|${a.slotKey ?? ""}`.localeCompare(
      `${b.participantName}|${b.predictionKind}|${b.slotKey ?? ""}`,
    ),
  );
}

export function repairPlanFingerprint(
  actions: readonly TopologyStalePickRepairAction[],
): string {
  const payload = actions.map((a) => ({
    poolId: a.poolId,
    participantId: a.participantId,
    predictionKind: a.predictionKind,
    slotKey: a.slotKey,
    tournamentStageId: a.tournamentStageId,
    savedTeamId: a.savedTeamId,
  }));
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function assertRepairPlanCanApply(
  actions: readonly TopologyStalePickRepairAction[],
): { ok: true } | { ok: false; reason: string } {
  const locked = actions.filter((a) => a.rowState === "locked_out");
  if (locked.length > 0) {
    return {
      ok: false,
      reason: `Refusing apply: ${locked.length} stale pick(s) are locked out (pickStatus=out). Resolve manually before repair.`,
    };
  }
  const frozen = actions.filter((a) => a.rowState === "frozen");
  if (frozen.length > 0) {
    return {
      ok: false,
      reason: `Refusing apply: ${frozen.length} stale pick(s) are frozen by official feeder results. Resolve manually before repair.`,
    };
  }
  return { ok: true };
}

export function summarizeRepairActions(
  actions: readonly TopologyStalePickRepairAction[],
): {
  participantsAffected: number;
  semifinalistClears: number;
  finalistClears: number;
  championClears: number;
} {
  const participantsAffected = new Set(actions.map((a) => a.participantId)).size;
  let semifinalistClears = 0;
  let finalistClears = 0;
  let championClears = 0;
  for (const action of actions) {
    if (action.predictionKind === "semifinalist") semifinalistClears += 1;
    if (action.predictionKind === "finalist") finalistClears += 1;
    if (action.predictionKind === "champion") championClears += 1;
  }
  return {
    participantsAffected,
    semifinalistClears,
    finalistClears,
    championClears,
  };
}
