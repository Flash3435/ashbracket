import { poolsToRecomputeAfterParticipantMove } from "./worldCupParticipantMove";
import {
  formatWorldCupPoolMergeDryRunReport,
  mergedPoolDisplayName,
  planWorldCupPoolMerge,
  validateWorldCupPoolMergePools,
} from "./worldCupPoolMerge";

let failed = 0;
function t(cond: boolean, msg: string) {
  if (!cond) {
    failed++;
    console.error("FAIL:", msg);
  }
}

const edition = "edition-wc";
const sourcePool = {
  id: "pool-source",
  name: "FSChumps",
  tournamentEditionId: edition,
  isSimulation: false,
};
const destinationPool = {
  id: "pool-dest",
  name: "PPFamily",
  tournamentEditionId: edition,
  isSimulation: false,
};

t(
  validateWorldCupPoolMergePools(sourcePool, destinationPool).ok === true,
  "compatible pools pass validation",
);

t(
  !validateWorldCupPoolMergePools(sourcePool, { ...sourcePool, id: "pool-source" }).ok,
  "same pool blocks merge",
);

t(
  !validateWorldCupPoolMergePools(sourcePool, {
    ...destinationPool,
    isSimulation: true,
  }).ok,
  "simulation mismatch blocks merge",
);

const destinationParticipants = [
  {
    id: "dest-1",
    displayName: "Alice",
    email: "alice@example.com",
    userId: "user-alice",
  },
];

{
  const result = planWorldCupPoolMerge({
    sourcePool,
    destinationPool,
    sourceParticipants: [
      {
        id: "src-1",
        displayName: "Jamie",
        email: "jamie@example.com",
        userId: "user-jamie",
      },
      {
        id: "src-2",
        displayName: "Taylor",
        email: "taylor@example.com",
        userId: null,
      },
    ],
    destinationParticipants,
  });
  t(result.ok, "merge plan succeeds");
  if (result.ok) {
    t(result.plan.movable.length === 2, "preview lists movable participants");
    t(result.plan.blocked.length === 0, "no blocked participants");
    t(
      formatWorldCupPoolMergeDryRunReport(result.plan).includes("Will move:  2"),
      "dry-run report includes move count",
    );
  }
}

{
  const result = planWorldCupPoolMerge({
    sourcePool,
    destinationPool,
    sourceParticipants: [
      {
        id: "src-dup-user",
        displayName: "Adarsh",
        email: "other@example.com",
        userId: "user-alice",
      },
    ],
    destinationParticipants,
  });
  t(result.ok, "duplicate user plan builds");
  if (result.ok) {
    t(result.plan.movable.length === 0, "duplicate user_id blocks move");
    t(result.plan.blocked[0]?.blockReason === "duplicate_user_id", "duplicate user_id reason");
  }
}

{
  const result = planWorldCupPoolMerge({
    sourcePool,
    destinationPool,
    sourceParticipants: [
      {
        id: "src-dup-email",
        displayName: "Someone",
        email: "Alice@Example.com",
        userId: null,
      },
    ],
    destinationParticipants,
  });
  t(result.ok, "duplicate email plan builds");
  if (result.ok) {
    t(result.plan.blocked[0]?.blockReason === "duplicate_email", "duplicate email blocks move");
  }
}

{
  const result = planWorldCupPoolMerge({
    sourcePool,
    destinationPool,
    sourceParticipants: [
      {
        id: "src-a",
        displayName: "Pat",
        email: "pat@example.com",
        userId: null,
      },
      {
        id: "src-b",
        displayName: "Pat duplicate",
        email: "pat@example.com",
        userId: null,
      },
    ],
    destinationParticipants: [],
  });
  t(result.ok, "source duplicate email plan builds");
  if (result.ok) {
    t(result.plan.movable.length === 1, "first source duplicate email can move");
    t(result.plan.blocked.length === 1, "second source duplicate email blocked");
    t(
      result.plan.blocked[0]?.blockReason === "source_duplicate_email",
      "source duplicate email reason",
    );
  }
}

t(
  mergedPoolDisplayName("FSChumps") === "[Merged] FSChumps",
  "merged pool rename prefix",
);

t(
  poolsToRecomputeAfterParticipantMove(sourcePool.id, destinationPool.id).join(",") ===
    "pool-source,pool-dest",
  "merge apply recomputes both source and destination standings",
);

if (failed) {
  process.exit(1);
}
console.log("worldCupPoolMerge.selftest: ok");
