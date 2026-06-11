import { MERGED_POOL_NAME_PREFIX } from "../participants/worldCupPoolMerge";
import {
  buildEmptyPoolArchiveApplyPayload,
  evaluateEmptyPoolArchiveEligibility,
  formatEmptyPoolArchiveDryRunReport,
  isPoolArchived,
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
  evaluateEmptyPoolArchiveEligibility(candidate(), 0).eligible === true,
  "empty pool is eligible",
);

t(
  !evaluateEmptyPoolArchiveEligibility(candidate(), 1).eligible,
  "pool with participants is blocked",
);

{
  const blocked = evaluateEmptyPoolArchiveEligibility(candidate(), 1);
  t(
    !blocked.eligible && blocked.blockReason === "has_participants",
    "participant block reason",
  );
}

t(
  !evaluateEmptyPoolArchiveEligibility(
    candidate({ archived_at: "2026-06-11T00:00:00.000Z" }),
    0,
  ).eligible,
  "already archived pool is skipped",
);

t(
  !evaluateEmptyPoolArchiveEligibility(
    candidate({ is_simulation: true }),
    0,
  ).eligible,
  "simulation pool requires explicit include flag",
);

t(
  evaluateEmptyPoolArchiveEligibility(
    candidate({ is_simulation: true }),
    0,
    { includeSimulation: true },
  ).eligible === true,
  "simulation pool eligible with include flag",
);

t(
  !evaluateEmptyPoolArchiveEligibility(
    candidate({ name: `${MERGED_POOL_NAME_PREFIX}FSChumps` }),
    0,
  ).eligible,
  "merged pool requires explicit include flag",
);

t(
  evaluateEmptyPoolArchiveEligibility(
    candidate({ name: `${MERGED_POOL_NAME_PREFIX}FSChumps` }),
    0,
    { includeMerged: true },
  ).eligible === true,
  "merged pool eligible with include flag",
);

{
  const payload = buildEmptyPoolArchiveApplyPayload("2026-06-11T12:00:00.000Z");
  t(payload.is_public === false, "apply sets is_public false");
  t(payload.archived_at === "2026-06-11T12:00:00.000Z", "apply sets archived_at");
  t(payload.archived_by_user_id === null, "apply leaves archived_by_user_id null by default");
  t(
    payload.archive_reason.includes("empty pool"),
    "apply sets archive reason",
  );
}

{
  const dryRunRows = [
    {
      pool: candidate(),
      participantCount: 0,
      evaluation: evaluateEmptyPoolArchiveEligibility(candidate(), 0),
    },
    {
      pool: candidate({
        id: "pool-2",
        name: "[Merged] FIFA Friends 2026",
      }),
      participantCount: 1,
      evaluation: evaluateEmptyPoolArchiveEligibility(
        candidate({
          id: "pool-2",
          name: "[Merged] FIFA Friends 2026",
        }),
        1,
      ),
    },
  ];
  const report = formatEmptyPoolArchiveDryRunReport(dryRunRows);
  t(report.includes("Would archive"), "dry-run report lists eligible pools");
  t(report.includes("Blocked"), "dry-run report lists blocked pools");
  t(!report.includes("mutate"), "dry-run report is informational only");
}

{
  const pools = [
    candidate({ id: "active", name: "Active Pool" }),
    candidate({
      id: "archived",
      name: "Archived Pool",
      archived_at: "2026-06-11T00:00:00.000Z",
    }),
  ];
  const { activePools, archivedPools } = splitActiveAndArchivedManagedPools(pools);
  t(activePools.length === 1 && activePools[0]!.id === "active", "dashboard keeps active pools");
  t(
    archivedPools.length === 1 && archivedPools[0]!.id === "archived",
    "dashboard excludes archived pools from active list",
  );
  t(isPoolArchived(pools[1]!), "isPoolArchived detects archived pool");
  t(!isPoolArchived(pools[0]!), "isPoolArchived false for active pool");
}

if (failed) {
  process.exit(1);
}
console.log("poolArchive.selftest: ok");
