import { MERGED_POOL_NAME_PREFIX } from "@/lib/participants/worldCupPoolMerge";

export const EMPTY_POOL_ARCHIVE_REASON =
  "Archived empty pool after pool cleanup.";

export const SELECTED_POOL_ARCHIVE_REASON =
  "Archived after pool merge/admin cleanup.";

export const EMPTY_POOL_ARCHIVE_CONFIRM_TOKEN = "ARCHIVE_EMPTY_POOLS";

export const SELECTED_POOLS_ARCHIVE_CONFIRM_TOKEN =
  "ARCHIVE_SELECTED_POOLS_WITH_PARTICIPANTS";

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

export type PoolArchiveOptions = {
  includeSimulation?: boolean;
  includeMerged?: boolean;
  allowNonEmpty?: boolean;
};

/** @deprecated Use `PoolArchiveOptions` */
export type EmptyPoolArchiveOptions = PoolArchiveOptions;

export type PoolArchiveBlockReason =
  | "has_participants"
  | "already_archived"
  | "simulation_pool"
  | "merged_pool";

export type PoolArchiveEvaluation =
  | { eligible: true; action: "archive" }
  | { eligible: false; blockReason: PoolArchiveBlockReason; detail: string };

/** @deprecated Use `PoolArchiveEvaluation` */
export type EmptyPoolArchiveEvaluation = PoolArchiveEvaluation;

export type PoolArchiveDryRunRow = {
  pool: PoolArchiveCandidate;
  participantCount: number;
  evaluation: PoolArchiveEvaluation;
};

/** @deprecated Use `PoolArchiveDryRunRow` */
export type EmptyPoolArchiveDryRunRow = PoolArchiveDryRunRow;

export type PoolArchiveApplyPayload = {
  is_public: false;
  archived_at: string;
  archived_by_user_id: string | null;
  archive_reason: string;
};

/** @deprecated Use `PoolArchiveApplyPayload` */
export type EmptyPoolArchiveApplyPayload = PoolArchiveApplyPayload;

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

export function evaluatePoolArchiveEligibility(
  pool: PoolArchiveCandidate,
  participantCount: number,
  options: PoolArchiveOptions = {},
): PoolArchiveEvaluation {
  if (isPoolArchived(pool)) {
    return {
      eligible: false,
      blockReason: "already_archived",
      detail: "Pool is already archived.",
    };
  }
  if (participantCount > 0 && !options.allowNonEmpty) {
    return {
      eligible: false,
      blockReason: "has_participants",
      detail: `Pool has ${participantCount} participant(s). Use --allow-non-empty to archive named pools with participants.`,
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

/** @deprecated Use `evaluatePoolArchiveEligibility` */
export const evaluateEmptyPoolArchiveEligibility = evaluatePoolArchiveEligibility;

export function buildPoolArchiveApplyPayload(
  archivedAt: string,
  archiveReason: string,
  archivedByUserId: string | null = null,
): PoolArchiveApplyPayload {
  return {
    is_public: false,
    archived_at: archivedAt,
    archived_by_user_id: archivedByUserId,
    archive_reason: archiveReason,
  };
}

export function buildEmptyPoolArchiveApplyPayload(
  archivedAt: string,
  archivedByUserId: string | null = null,
): PoolArchiveApplyPayload {
  return buildPoolArchiveApplyPayload(
    archivedAt,
    EMPTY_POOL_ARCHIVE_REASON,
    archivedByUserId,
  );
}

export function resolveArchiveReasonForPool(
  participantCount: number,
  customReason: string | null | undefined,
): string {
  const trimmed = customReason?.trim();
  if (trimmed) return trimmed;
  return participantCount > 0
    ? SELECTED_POOL_ARCHIVE_REASON
    : EMPTY_POOL_ARCHIVE_REASON;
}

export function resolvePoolArchiveApplyConfirmation(
  eligible: Array<{ participantCount: number }>,
  confirmToken: string | null,
  options: { allowNonEmpty: boolean },
): { ok: true } | { ok: false; error: string } {
  if (eligible.length === 0) {
    return { ok: false, error: "No eligible pools to archive." };
  }

  const hasNonEmpty = eligible.some((row) => row.participantCount > 0);
  if (hasNonEmpty) {
    if (!options.allowNonEmpty) {
      return {
        ok: false,
        error:
          "Non-empty pools require --allow-non-empty and cannot use the empty-pool confirmation token.",
      };
    }
    if (confirmToken === EMPTY_POOL_ARCHIVE_CONFIRM_TOKEN) {
      return {
        ok: false,
        error: `Pools with participants cannot be archived with --confirm "${EMPTY_POOL_ARCHIVE_CONFIRM_TOKEN}". Use --confirm "${SELECTED_POOLS_ARCHIVE_CONFIRM_TOKEN}" instead.`,
      };
    }
    if (confirmToken !== SELECTED_POOLS_ARCHIVE_CONFIRM_TOKEN) {
      return {
        ok: false,
        error: `Apply blocked: pass --confirm "${SELECTED_POOLS_ARCHIVE_CONFIRM_TOKEN}" exactly for pools with participants.`,
      };
    }
    return { ok: true };
  }

  if (confirmToken !== EMPTY_POOL_ARCHIVE_CONFIRM_TOKEN) {
    return {
      ok: false,
      error: `Apply blocked: pass --confirm "${EMPTY_POOL_ARCHIVE_CONFIRM_TOKEN}" exactly for empty pools.`,
    };
  }
  return { ok: true };
}

function formatEvaluationAction(evaluation: PoolArchiveEvaluation): string {
  if (evaluation.eligible) {
    return "archive (set is_public=false, archived_at=now())";
  }
  return `blocked: ${evaluation.detail}`;
}

function formatPoolArchiveWarnings(row: PoolArchiveDryRunRow): string[] {
  if (!row.evaluation.eligible) return [];

  const warnings: string[] = [];
  if (row.participantCount > 0) {
    warnings.push(
      `  warning:         ${row.participantCount} participant(s) will be retained (not deleted)`,
    );
  }
  if (row.pool.is_simulation) {
    warnings.push("  warning:         simulation pool");
  }
  if (isMergedPoolName(row.pool.name)) {
    warnings.push("  warning:         merged pool name prefix");
  }
  warnings.push(
    "  warning:         pool will be hidden from normal admin lists after archive",
  );
  warnings.push(
    "  warning:         participants, picks, activity, and ledgers are retained",
  );
  return warnings;
}

export function formatPoolArchiveDryRunReport(rows: PoolArchiveDryRunRow[]): string {
  const lines: string[] = [];
  lines.push("Pool archive dry-run");
  lines.push("==================");
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
    lines.push(`  simulation:      ${row.pool.is_simulation}`);
    lines.push(`  merged:          ${isMergedPoolName(row.pool.name)}`);
    lines.push(`  is_public:       ${row.pool.is_public}`);
    lines.push(`  archived_at:     ${row.pool.archived_at ?? "(null)"}`);
    lines.push(`  action:          ${formatEvaluationAction(row.evaluation)}`);
    for (const warning of formatPoolArchiveWarnings(row)) {
      lines.push(warning);
    }
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

/** @deprecated Use `formatPoolArchiveDryRunReport` */
export const formatEmptyPoolArchiveDryRunReport = formatPoolArchiveDryRunReport;
