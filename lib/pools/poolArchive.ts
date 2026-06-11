import { MERGED_POOL_NAME_PREFIX } from "@/lib/participants/worldCupPoolMerge";

export const EMPTY_POOL_ARCHIVE_REASON =
  "Archived empty pool after pool cleanup.";

export const EMPTY_POOL_ARCHIVE_CONFIRM_TOKEN = "ARCHIVE_EMPTY_POOLS";

export type PoolArchiveFields = {
  archived_at: string | null;
  archived_by_user_id?: string | null;
  archive_reason?: string | null;
};

export type PoolArchiveCandidate = PoolArchiveFields & {
  id: string;
  name: string;
  is_public: boolean;
  is_simulation: boolean;
};

export type EmptyPoolArchiveOptions = {
  includeSimulation?: boolean;
  includeMerged?: boolean;
};

export type EmptyPoolArchiveBlockReason =
  | "has_participants"
  | "already_archived"
  | "simulation_pool"
  | "merged_pool";

export type EmptyPoolArchiveEvaluation =
  | { eligible: true; action: "archive" }
  | { eligible: false; blockReason: EmptyPoolArchiveBlockReason; detail: string };

export type EmptyPoolArchiveDryRunRow = {
  pool: PoolArchiveCandidate;
  participantCount: number;
  evaluation: EmptyPoolArchiveEvaluation;
};

export type EmptyPoolArchiveApplyPayload = {
  is_public: false;
  archived_at: string;
  archived_by_user_id: string | null;
  archive_reason: string;
};

export function isPoolArchived(pool: PoolArchiveFields): boolean {
  return pool.archived_at != null;
}

export function isMergedPoolName(name: string): boolean {
  return name.trim().startsWith(MERGED_POOL_NAME_PREFIX);
}

export function splitActiveAndArchivedManagedPools<T extends PoolArchiveFields>(
  pools: T[],
): { activePools: T[]; archivedPools: T[] } {
  const activePools: T[] = [];
  const archivedPools: T[] = [];
  for (const pool of pools) {
    if (isPoolArchived(pool)) {
      archivedPools.push(pool);
    } else {
      activePools.push(pool);
    }
  }
  const byName = (a: T, b: T) =>
    String((a as { name?: string }).name ?? "").localeCompare(
      String((b as { name?: string }).name ?? ""),
      undefined,
      { sensitivity: "base" },
    );
  activePools.sort(byName);
  archivedPools.sort(byName);
  return { activePools, archivedPools };
}

export function evaluateEmptyPoolArchiveEligibility(
  pool: PoolArchiveCandidate,
  participantCount: number,
  options: EmptyPoolArchiveOptions = {},
): EmptyPoolArchiveEvaluation {
  if (isPoolArchived(pool)) {
    return {
      eligible: false,
      blockReason: "already_archived",
      detail: "Pool is already archived.",
    };
  }
  if (participantCount > 0) {
    return {
      eligible: false,
      blockReason: "has_participants",
      detail: `Pool has ${participantCount} participant(s).`,
    };
  }
  if (pool.is_simulation && !options.includeSimulation) {
    return {
      eligible: false,
      blockReason: "simulation_pool",
      detail: "Simulation pools require --include-simulation.",
    };
  }
  if (isMergedPoolName(pool.name) && !options.includeMerged) {
    return {
      eligible: false,
      blockReason: "merged_pool",
      detail: "Merged pools require --include-merged.",
    };
  }
  return { eligible: true, action: "archive" };
}

export function buildEmptyPoolArchiveApplyPayload(
  archivedAt: string,
  archivedByUserId: string | null = null,
): EmptyPoolArchiveApplyPayload {
  return {
    is_public: false,
    archived_at: archivedAt,
    archived_by_user_id: archivedByUserId,
    archive_reason: EMPTY_POOL_ARCHIVE_REASON,
  };
}

function formatEvaluationAction(evaluation: EmptyPoolArchiveEvaluation): string {
  if (evaluation.eligible) {
    return "archive (set is_public=false, archived_at=now())";
  }
  return `blocked: ${evaluation.detail}`;
}

export function formatEmptyPoolArchiveDryRunReport(
  rows: EmptyPoolArchiveDryRunRow[],
): string {
  const lines: string[] = [];
  lines.push("Empty pool archive dry-run");
  lines.push("==========================");
  lines.push("");

  if (rows.length === 0) {
    lines.push("No pools matched the requested criteria.");
    return lines.join("\n");
  }

  const eligible = rows.filter((row) => row.evaluation.eligible);
  const blocked = rows.filter((row) => !row.evaluation.eligible);

  for (const row of rows) {
    lines.push(`Pool: ${row.pool.name}`);
    lines.push(`  id:              ${row.pool.id}`);
    lines.push(`  participants:    ${row.participantCount}`);
    lines.push(`  is_public:       ${row.pool.is_public}`);
    lines.push(
      `  archived_at:     ${row.pool.archived_at ?? "(null)"}`,
    );
    lines.push(`  action:          ${formatEvaluationAction(row.evaluation)}`);
    lines.push("");
  }

  lines.push("Summary");
  lines.push("-------");
  lines.push(`Eligible: ${eligible.length}`);
  lines.push(`Blocked:  ${blocked.length}`);

  if (eligible.length > 0) {
    lines.push("");
    lines.push("Would archive:");
    for (const row of eligible) {
      lines.push(`  - ${row.pool.name} (${row.pool.id})`);
    }
  }

  if (blocked.length > 0) {
    lines.push("");
    lines.push("Blocked:");
    for (const row of blocked) {
      lines.push(
        `  - ${row.pool.name} (${row.pool.id}): ${row.evaluation.eligible ? "" : row.evaluation.detail}`,
      );
    }
  }

  return lines.join("\n");
}
