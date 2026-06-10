import {
  WORLD_CUP_PARTICIPANT_MOVE_AFFECTED_TABLES,
  areWorldCupPoolsCompatibleForMove,
  filterEligibleMoveDestinationPools,
  formatMoveParticipantSuccessMessage,
  mapMoveWorldCupParticipantRpcError,
  MOVE_PARTICIPANT_DUPLICATE_BLOCKED_MESSAGE,
  participantWouldDuplicateInDestinationPool,
  poolsToRecomputeAfterParticipantMove,
} from "./worldCupParticipantMove";

let failed = 0;
function t(cond: boolean, msg: string) {
  if (!cond) {
    failed++;
    console.error("FAIL:", msg);
  }
}

const editionA = "edition-a";
const editionB = "edition-b";

const sourceScope = {
  poolId: "pool-source",
  tournamentEditionId: editionA,
  isSimulation: false,
};

const compatibleDest = {
  poolId: "pool-dest",
  tournamentEditionId: editionA,
  isSimulation: false,
};

t(
  areWorldCupPoolsCompatibleForMove(sourceScope, compatibleDest),
  "compatible pools share edition and simulation mode",
);

t(
  !areWorldCupPoolsCompatibleForMove(sourceScope, {
    poolId: "pool-source",
    tournamentEditionId: editionA,
    isSimulation: false,
  }),
  "same pool is not compatible destination",
);

t(
  !areWorldCupPoolsCompatibleForMove(sourceScope, {
    poolId: "pool-other-edition",
    tournamentEditionId: editionB,
    isSimulation: false,
  }),
  "different edition blocks move",
);

t(
  !areWorldCupPoolsCompatibleForMove(sourceScope, {
    poolId: "pool-sim",
    tournamentEditionId: editionA,
    isSimulation: true,
  }),
  "live vs simulation blocks move",
);

const managedPools = [
  {
    id: "pool-source",
    name: "Source Pool",
    tournament_edition_id: editionA,
    is_simulation: false,
  },
  {
    id: "pool-dest-a",
    name: "Destination A",
    tournament_edition_id: editionA,
    is_simulation: false,
  },
  {
    id: "pool-dest-b",
    name: "Destination B",
    tournament_edition_id: editionB,
    is_simulation: false,
  },
  {
    id: "pool-unmanaged",
    name: "Unmanaged",
    tournament_edition_id: editionA,
    is_simulation: true,
  },
];

const eligible = filterEligibleMoveDestinationPools(sourceScope, managedPools);
t(eligible.length === 1, "destination dropdown excludes source and incompatible pools");
t(eligible[0]?.id === "pool-dest-a", "only compatible managed pool remains");
t(eligible[0]?.name === "Destination A", "destination label preserved");

t(
  participantWouldDuplicateInDestinationPool(
    { userId: "user-1", email: "jamie@example.com", displayName: "Jamie" },
    [{ userId: "user-2", email: "other@example.com", displayName: "Other" }],
  ) === false,
  "no duplicate when identities differ",
);

t(
  participantWouldDuplicateInDestinationPool(
    { userId: "user-1", email: "jamie@example.com", displayName: "Jamie" },
    [{ userId: "user-1", email: "jamie@example.com", displayName: "Jamie Lee" }],
  ),
  "duplicate when user_id matches",
);

t(
  participantWouldDuplicateInDestinationPool(
    { userId: null, email: "jamie@example.com", displayName: "Jamie" },
    [{ userId: null, email: "Jamie@Example.com", displayName: "Someone else" }],
  ),
  "duplicate when email matches case-insensitively",
);

t(
  participantWouldDuplicateInDestinationPool(
    { userId: null, email: "", displayName: "Jamie Lee" },
    [{ userId: null, email: "other@example.com", displayName: "jamie lee" }],
  ),
  "duplicate when display name matches",
);

t(
  mapMoveWorldCupParticipantRpcError("not authorized for destination pool") ===
    "You do not have access to one of these pools.",
  "admin cannot move to pool they do not administer",
);

t(
  mapMoveWorldCupParticipantRpcError("not authorized for source pool") ===
    "You do not have access to one of these pools.",
  "admin cannot move from pool they do not administer",
);

t(
  mapMoveWorldCupParticipantRpcError("participant not found in source pool") ===
    "Participant not found in this pool.",
  "participant must belong to source pool",
);

t(
  mapMoveWorldCupParticipantRpcError("participant already exists in destination pool") ===
    MOVE_PARTICIPANT_DUPLICATE_BLOCKED_MESSAGE,
  "rpc duplicate error maps to v1 blocked message",
);

t(
  mapMoveWorldCupParticipantRpcError("pools are not compatible") ===
    "These pools cannot be used together for a move.",
  "rpc compatibility error maps",
);

t(
  poolsToRecomputeAfterParticipantMove("pool-a", "pool-b").join(",") === "pool-a,pool-b",
  "both source and destination standings are recomputed",
);

t(
  formatMoveParticipantSuccessMessage("Jamie Lee", "Friends Pool") ===
    "Jamie Lee was moved to Friends Pool with all picks preserved.",
  "success toast copy",
);

t(
  WORLD_CUP_PARTICIPANT_MOVE_AFFECTED_TABLES.includes("predictions"),
  "move updates predictions pool_id so picks remain in destination pool",
);

t(
  WORLD_CUP_PARTICIPANT_MOVE_AFFECTED_TABLES.includes("participants"),
  "move updates participant pool membership",
);

if (failed) {
  process.exit(1);
}
console.log("worldCupParticipantMove.selftest: ok");
