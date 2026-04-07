import type { Prediction } from "../../src/types/domain";
import type { ParticipantPickSlotPayload } from "../../types/knockoutPicksSave";

/** Picks that lock at `pools.lock_at` (group + third-place + bonus). Knockout bracket uses the official R32 gate instead. */
export const FROZEN_AT_POOL_LOCK_KINDS = new Set([
  "group_winner",
  "group_runner_up",
  "third_place_qualifier",
  "bonus_pick",
]);

export function isFrozenAtPoolLockKind(kind: string): boolean {
  return FROZEN_AT_POOL_LOCK_KINDS.has(kind);
}

function slotPayloadKey(s: ParticipantPickSlotPayload): string {
  const k = s.predictionKind;
  if (k === "group_winner" || k === "group_runner_up") {
    const gc = (s.groupCode ?? "").trim().toUpperCase();
    return `${k}\0${s.tournamentStageId}\0${gc}`;
  }
  if (k === "third_place_qualifier") {
    return `${k}\0${s.tournamentStageId}\0${s.slotKey ?? ""}`;
  }
  if (k === "bonus_pick") {
    return `${k}\0${s.tournamentStageId}\0${(s.bonusKey ?? "").trim()}`;
  }
  return "";
}

function slotPredictionKey(p: Prediction): string {
  const k = p.predictionKind;
  if (k === "group_winner" || k === "group_runner_up") {
    return `${k}\0${p.tournamentStageId}\0${(p.groupCode ?? "").toUpperCase()}`;
  }
  if (k === "third_place_qualifier") {
    return `${k}\0${p.tournamentStageId}\0${p.slotKey ?? ""}`;
  }
  if (k === "bonus_pick") {
    return `${k}\0${p.tournamentStageId}\0${p.bonusKey ?? ""}`;
  }
  return "";
}

/**
 * When the pool lock time has passed, every frozen slot in the payload must match
 * the server (including empty). Returns an error message or null if OK.
 */
export function validateFrozenPicksUnchangedWhenPoolLocked(
  existing: Prediction[],
  incoming: ParticipantPickSlotPayload[],
): string | null {
  const err =
    "Group stage, third-place, and bonus picks are locked. You can still update knockout bracket picks after the official Round of 32 is published.";

  for (const s of incoming) {
    if (!isFrozenAtPoolLockKind(s.predictionKind)) continue;
    const key = slotPayloadKey(s);
    if (!key) continue;
    const e = existing.find((p) => slotPredictionKey(p) === key);
    const incT = (s.teamId ?? "").trim();
    const exT = (e?.teamId ?? "").trim();
    if (incT !== exT) {
      return err;
    }
  }

  return null;
}
