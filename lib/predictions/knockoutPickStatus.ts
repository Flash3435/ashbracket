import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { Prediction } from "../../src/types/domain";
import type { KnockoutPathPickClearReason } from "./pruneOfficialKnockoutPathPicks";

/** Participant knockout pick lifecycle for bracket-path invalidation. */
export type KnockoutPickStatus = "active" | "out";

export type KnockoutPickStatusMetadata = {
  v: 1;
  status: KnockoutPickStatus;
  reason: KnockoutPathPickClearReason;
  invalidatedAt?: string;
  /** Source correction audit row when restored from admin review. */
  auditId?: string;
  /** Admin note from reviewed backfill decision file. */
  reviewNote?: string;
};

const STATUS_PREFIX = "ab_pick_status:";

export function isKnockoutPickLockedOut(
  row: Pick<KnockoutPickSlotDraft, "pickStatus" | "teamId">,
): boolean {
  return row.pickStatus === "out" && Boolean(row.teamId.trim());
}

export function encodeKnockoutPickStatusMetadata(
  meta: KnockoutPickStatusMetadata,
): string {
  return `${STATUS_PREFIX}${JSON.stringify(meta)}`;
}

export function decodeKnockoutPickStatusMetadata(
  valueText: string | null | undefined,
): KnockoutPickStatusMetadata | null {
  const raw = (valueText ?? "").trim();
  if (!raw.startsWith(STATUS_PREFIX)) return null;
  try {
    const parsed = JSON.parse(raw.slice(STATUS_PREFIX.length)) as KnockoutPickStatusMetadata;
    if (parsed?.v !== 1 || parsed.status !== "out" || !parsed.reason) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function pickStatusFromPrediction(pred: Prediction): {
  pickStatus: KnockoutPickStatus | null;
  invalidReason: KnockoutPathPickClearReason | null;
} {
  const meta = decodeKnockoutPickStatusMetadata(pred.valueText);
  if (!meta) {
    return { pickStatus: null, invalidReason: null };
  }
  return { pickStatus: meta.status, invalidReason: meta.reason };
}

export function applyPickStatusMetadataToDraft(
  draft: KnockoutPickSlotDraft,
  pred: Prediction | undefined,
): KnockoutPickSlotDraft {
  if (!pred) return draft;
  const { pickStatus, invalidReason } = pickStatusFromPrediction(pred);
  if (pickStatus !== "out" || !pred.teamId?.trim()) return draft;
  return {
    ...draft,
    teamId: pred.teamId.trim(),
    pickStatus,
    invalidReason,
  };
}

export function knockoutPickStatusValueText(
  row: Pick<KnockoutPickSlotDraft, "pickStatus" | "invalidReason" | "teamId">,
): string | null {
  if (row.pickStatus !== "out" || !row.teamId.trim() || !row.invalidReason) {
    return null;
  }
  return encodeKnockoutPickStatusMetadata({
    v: 1,
    status: "out",
    reason: row.invalidReason,
    invalidatedAt: new Date().toISOString(),
  });
}

export function clearedOutPickRowKeys(
  slots: readonly KnockoutPickSlotDraft[],
): Set<string> {
  const keys = new Set<string>();
  for (const row of slots) {
    if (isKnockoutPickLockedOut(row)) keys.add(row.rowKey);
  }
  return keys;
}

/** Knockout progression picks score by saved teamId vs official results (pickStatus out is display-only). */
export function isKnockoutPredictionScoringEligible(pred: Prediction): boolean {
  return Boolean(pred.teamId?.trim());
}

export function participantPickSlotPayloadFromDraft(
  row: KnockoutPickSlotDraft,
): import("../../types/knockoutPicksSave").ParticipantPickSlotPayload {
  return {
    predictionKind: row.predictionKind,
    tournamentStageId: row.tournamentStageId,
    slotKey: row.slotKey,
    groupCode: row.groupCode,
    bonusKey: row.bonusKey,
    teamId: row.teamId,
    valueText: knockoutPickStatusValueText(row),
  };
}
