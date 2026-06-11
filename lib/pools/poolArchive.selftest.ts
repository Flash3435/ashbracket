import { MERGED_POOL_NAME_PREFIX } from "../participants/worldCupPoolMerge";
import {
  buildEmptyPoolArchiveApplyPayload,
  buildPoolArchiveApplyPayload,
  EMPTY_POOL_ARCHIVE_CONFIRM_TOKEN,
  evaluatePoolArchiveEligibility,
  formatPoolArchiveDryRunReport,
  isPoolArchived,
  resolveArchiveReasonForPool,
  resolvePoolArchiveApplyConfirmation,
  SELECTED_POOLS_ARCHIVE_CONFIRM_TOKEN,
  splitActiveAndArchivedManagedPools,
  type PoolArchiveCandidate,
} from "./poolArchive";

let failed = 0;
function t(cond: boolean, msg: string) {
  if (!cond) {
    failed++;
    console.error("FAIL:", msg);
  }
}

function candidate(
  overrides: Partial<PoolArchiveCandidate> = {},
): PoolArchiveCandidate {
  return {
    id: "pool-1",
    name: "AshBracket 2026",
    is_public: true,
    is_simulation: false,
    archived_at: null,
    ...overrides,
  };
}

t(
  evaluatePoolArchiveEligibility(candidate(), 0).eligible === true,
  "empty pool is eligible",
);

t(
  !evaluatePoolArchiveEligibility(candidate(), 1).eligible,
  "non-empty pool is blocked by default",
);

{
  const blocked = evaluatePoolArchiveEligibility(candidate(), 1);
  t(
    !blocked.eligible && blocked.blockReason === "has_participants",
    "participant block reason",
  );
}

t(
  evaluatePoolArchiveEligibility(candidate(), 2, { allowNonEmpty: true }).eligible ===
    true,
  "non-empty pool allowed only with --allow-non-empty",
);

t(
  !evaluatePoolArchiveEligibility(
    candidate({ archived_at: "2026-06-11T00:00:00.000Z" }),
    0,
  ).eligible,
  "already archived pool is skipped",
);

t(
  !evaluatePoolArchiveEligibility(
    candidate({ is_simulation: true, name: "Simulation test pool" }),
    2,
    { allowNonEmpty: true },
  ).eligible,
  "simulation pool still requires --include-simulation",
);

t(
  evaluatePoolArchiveEligibility(
    candidate({ is_simulation: true, name: "Simulation test pool" }),
    2,
    { allowNonEmpty: true, includeSimulation: true },
  ).eligible === true,
  "simulation pool eligible with include flag",
);

t(
  !evaluatePoolArchiveEligibility(
    candidate({ name: `${MERGED_POOL_NAME_PREFIX}FIFA Friends 2026` }),
    1,
    { allowNonEmpty: true },
  ).eligible,
  "merged pool still requires --include-merged",
);

t(
  evaluatePoolArchiveEligibility(
    candidate({ name: `${MERGED_POOL_NAME_PREFIX}FIFA Friends 2026` }),
    1,
    { allowNonEmpty: true, includeMerged: true },
  ).eligible === true,
  "merged pool eligible with include flag",
);

{
  const emptyOnly = resolvePoolArchiveApplyConfirmation(
    [{ participantCount: 0 }],
    EMPTY_POOL_ARCHIVE_CONFIRM_TOKEN,
    { allowNonEmpty: false },
  );
  t(emptyOnly.ok === true, "empty-pool confirmation works for empty pools");

  const emptyBlockedBySelectedOnly = resolvePoolArchiveApplyConfirmation(
    [{ participantCount: 0 }],
    SELECTED_POOLS_ARCHIVE_CONFIRM_TOKEN,
    { allowNonEmpty: false },
  );
  t(
    !emptyBlockedBySelectedOnly.ok,
    "empty-pool archive behavior remains unchanged (requires empty token)",
  );

  const nonEmptyNeedsStrongToken = resolvePoolArchiveApplyConfirmation(
    [{ participantCount: 2 }],
    SELECTED_POOLS_ARCHIVE_CONFIRM_TOKEN,
    { allowNonEmpty: true },
  );
  t(
    nonEmptyNeedsStrongToken.ok === true,
    "non-empty pool allowed with strong confirmation",
  );

  const nonEmptyRejectsEmptyToken = resolvePoolArchiveApplyConfirmation(
    [{ participantCount: 1 }],
    EMPTY_POOL_ARCHIVE_CONFIRM_TOKEN,
    { allowNonEmpty: true },
  );
  t(
    !nonEmptyRejectsEmptyToken.ok,
    "non-empty pool cannot use ARCHIVE_EMPTY_POOLS",
  );

  const nonEmptyNeedsAllowFlag = resolvePoolArchiveApplyConfirmation(
    [{ participantCount: 1 }],
    SELECTED_POOLS_ARCHIVE_CONFIRM_TOKEN,
    { allowNonEmpty: false },
  );
  t(
    !nonEmptyNeedsAllowFlag.ok,
    "non-empty pool requires --allow-non-empty at apply time",
  );
}

{
  const payload = buildEmptyPoolArchiveApplyPayload("2026-06-11T12:00:00.000Z");
  t(payload.is_public === false, "apply sets is_public false");
  t(payload.archived_at === "2026-06-11T12:00:00.000Z", "apply sets archived_at");
  t(payload.archived_by_user_id === null, "apply leaves archived_by_user_id null by default");
  t(payload.archive_reason.includes("empty pool"), "empty apply sets empty archive reason");
}

{
  const reason = resolveArchiveReasonForPool(2, null);
  t(
    reason.includes("merge/admin cleanup"),
    "non-empty default reason is selected-pool cleanup",
  );
  const custom = resolveArchiveReasonForPool(2, "Custom archive reason");
  t(custom === "Custom archive reason", "custom --reason is used");
  const payload = buildPoolArchiveApplyPayload(
    "2026-06-11T12:00:00.000Z",
    reason,
  );
  t(payload.archive_reason === reason, "selected apply payload uses reason");
}

{
  const dryRunRows = [
    {
      pool: candidate({ is_simulation: true, name: "Simulation test pool" }),
      participantCount: 2,
      evaluation: evaluatePoolArchiveEligibility(
        candidate({ is_simulation: true, name: "Simulation test pool" }),
        2,
        { allowNonEmpty: true, includeSimulation: true },
      ),
    },
    {
      pool: candidate({
        id: "pool-2",
        name: "[Merged] FIFA Friends 2026",
      }),
      participantCount: 1,
      evaluation: evaluatePoolArchiveEligibility(
        candidate({
          id: "pool-2",
          name: "[Merged] FIFA Friends 2026",
        }),
        1,
        { allowNonEmpty: true, includeMerged: true },
      ),
    },
  ];
  const report = formatPoolArchiveDryRunReport(dryRunRows);
  t(report.includes("Would archive"), "dry-run report lists eligible pools");
  t(report.includes("simulation:      true"), "dry-run shows simulation status");
  t(report.includes("merged:          true"), "dry-run shows merged status");
  t(report.includes("participant(s) will be retained"), "dry-run warns participants retained");
  t(
    report.includes("hidden from normal admin lists"),
    "dry-run warns pool hidden from normal lists",
  );
}

{
  const pools = [
    candidate({ id: "active", name: "Active Pool" }),
    candidate({
      id: "archived-empty",
      name: "Archived Empty Pool",
      archived_at: "2026-06-11T00:00:00.000Z",
    }),
    candidate({
      id: "archived-nonempty",
      name: "Simulation test pool",
      is_simulation: true,
      archived_at: "2026-06-11T01:00:00.000Z",
    }),
  ];
  const { activePools, archivedPools } = splitActiveAndArchivedManagedPools(pools);
  t(activePools.length === 1 && activePools[0]!.id === "active", "dashboard keeps active pools");
  t(
    archivedPools.length === 2,
    "archived non-empty pools appear in Archived pools section",
  );
  t(
    archivedPools.some((pool) => pool.id === "archived-nonempty"),
    "archived non-empty pool is in archived section",
  );
  t(isPoolArchived(pools[2]!), "isPoolArchived detects archived non-empty pool");
}

if (failed) {
  process.exit(1);
}
console.log("poolArchive.selftest: ok");
