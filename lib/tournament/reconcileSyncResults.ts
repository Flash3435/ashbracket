/**
 * Reconcile derived `results` rows for an edition without delete+rebuild.
 * Keeps existing UUIDs stable when the logical slot (stage/kind/group/slot) matches.
 */
export type SyncResultRow = {
  id?: string;
  edition_id: string;
  tournament_stage_id: string;
  kind: string;
  team_id: string | null;
  group_code: string | null;
  slot_key: string | null;
  resolved_at: string;
  source: "sync";
  locked: boolean;
};

export function resultLogicalKey(
  stageId: string,
  kind: string,
  groupCode: string | null,
  slotKey: string | null,
): string {
  return [stageId, kind, groupCode ?? "", slotKey ?? ""].join("\0");
}

export type SyncResultReconcilePlan = {
  toInsert: SyncResultRow[];
  toUpdate: Array<{ id: string; patch: Partial<SyncResultRow> }>;
  toDeleteIds: string[];
  reusedIds: string[];
};

/**
 * Given existing unlocked sync rows and the desired set keyed by logical slot,
 * plan inserts/updates/deletes that preserve IDs wherever possible.
 */
export function planSyncResultReconcile(input: {
  existingSyncUnlocked: Array<{
    id: string;
    tournament_stage_id: string;
    kind: string;
    team_id: string | null;
    group_code: string | null;
    slot_key: string | null;
    resolved_at: string | null;
  }>;
  /** Desired rows keyed by `resultLogicalKey(...)` (must omit locked slots). */
  desiredByKey: Map<string, SyncResultRow>;
  lockedKeys: ReadonlySet<string>;
}): SyncResultReconcilePlan {
  const existingByKey = new Map<
    string,
    (typeof input.existingSyncUnlocked)[number]
  >();
  for (const row of input.existingSyncUnlocked) {
    const key = resultLogicalKey(
      row.tournament_stage_id,
      row.kind,
      row.group_code,
      row.slot_key,
    );
    if (input.lockedKeys.has(key)) continue;
    existingByKey.set(key, row);
  }

  const toInsert: SyncResultRow[] = [];
  const toUpdate: Array<{ id: string; patch: Partial<SyncResultRow> }> = [];
  const reusedIds: string[] = [];

  for (const [key, desired] of input.desiredByKey) {
    if (input.lockedKeys.has(key)) continue;
    const existing = existingByKey.get(key);
    if (!existing) {
      toInsert.push(desired);
      continue;
    }
    reusedIds.push(existing.id);
    // Keep UUIDs stable. Only rewrite when team assignment changes.
    // Do not bump resolved_at solely to avoid mass churn on every sync.
    if (existing.team_id !== desired.team_id) {
      toUpdate.push({
        id: existing.id,
        patch: {
          team_id: desired.team_id,
          resolved_at: desired.resolved_at,
          source: "sync",
          locked: false,
        },
      });
    }
  }

  const toDeleteIds: string[] = [];
  for (const [key, existing] of existingByKey) {
    if (input.desiredByKey.has(key)) continue;
    if (input.lockedKeys.has(key)) continue;
    toDeleteIds.push(existing.id);
  }

  return { toInsert, toUpdate, toDeleteIds, reusedIds };
}
