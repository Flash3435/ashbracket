import {
  WORLD_CUP_PARTICIPANT_MOVE_AFFECTED_TABLES,
  areWorldCupPoolsCompatibleForMove,
  buildMoveDestinationOptionsForParticipant,
  detectParticipantDuplicateInDestinationPool,
  diagnoseMoveDestinationPool,
  filterEligibleMoveDestinationPools,
  formatMoveParticipantSuccessMessage,
  mapMoveWorldCupParticipantRpcError,
  MOVE_PARTICIPANT_DUPLICATE_BLOCKED_MESSAGE,
  MOVE_PARTICIPANT_NO_AVAILABLE_DESTINATIONS_MESSAGE,
  participantWouldDuplicateInDestinationPool,
  poolsToRecomputeAfterParticipantMove,
  validateDirectPoolAdminMoveAccess,
} from "./worldCupParticipantMove";
import { filterPoolsToDirectPoolManagement } from "../pools/fetchDirectlyManagedPoolsForCurrentUser";

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

{
  const globalAdminVisiblePools = [
    ...managedPools,
    {
      id: "pool-global-only",
      name: "Global Admin Only",
      tournament_edition_id: editionA,
      is_simulation: false,
    },
  ];
  const directAdminPoolIds = new Set(["pool-source", "pool-dest-a"]);
  const directOnly = filterPoolsToDirectPoolManagement(
    globalAdminVisiblePools,
    directAdminPoolIds,
    "user-1",
  );
  const moveOptions = filterEligibleMoveDestinationPools(sourceScope, directOnly);
  t(moveOptions.length === 1, "global admin without pool_admins sees only direct destinations");
  t(moveOptions[0]?.id === "pool-dest-a", "eligible direct destination remains");
  t(
    !moveOptions.some((pool) => pool.id === "pool-global-only"),
    "global-admin-only pool is not a move destination",
  );
}

{
  const access = validateDirectPoolAdminMoveAccess(
    "pool-source",
    "pool-dest-a",
    ["pool-source", "pool-dest-a"],
  );
  t(access.ok, "explicit pool_admin on both pools can move");
}

{
  const access = validateDirectPoolAdminMoveAccess(
    "pool-source",
    "pool-global-only",
    ["pool-source", "pool-dest-a"],
  );
  t(!access.ok, "global admin without destination pool_admins is blocked server-side");
}

{
  const creatorPools = [
    ...managedPools,
    {
      id: "pool-creator-only",
      name: "Creator Pool",
      tournament_edition_id: editionA,
      is_simulation: false,
      created_by_user_id: "user-creator",
    },
  ];
  const creatorManaged = filterPoolsToDirectPoolManagement(
    creatorPools,
    new Set(["pool-source"]),
    "user-creator",
  );
  const creatorMoveOptions = filterEligibleMoveDestinationPools(sourceScope, creatorManaged);
  t(
    creatorMoveOptions.some((pool) => pool.id === "pool-creator-only"),
    "pool creator without global-admin status can see created pool as destination",
  );
}

{
  const diagnostic = diagnoseMoveDestinationPool({
    sourcePool: sourceScope,
    destinationPool: {
      id: "pool-dest-a",
      name: "Destination A",
      tournament_edition_id: editionA,
      is_simulation: false,
      created_by_user_id: null,
    },
    currentUserId: "user-1",
    poolAdminMembershipIds: new Set(["pool-source", "pool-dest-a"]),
    movingParticipant: {
      userId: "user-adarsh",
      email: "adarsh@example.com",
      displayName: "Adarsh",
    },
    destinationParticipants: [
      {
        userId: "user-adarsh",
        email: "adarsh@example.com",
        displayName: "Adarsh K",
      },
    ],
  });
  t(diagnostic.excludedReason === "duplicate_participant", "duplicate destination is diagnosed");
  t(diagnostic.duplicateUser, "duplicate user_id flagged");
}

{
  const built = buildMoveDestinationOptionsForParticipant({
    context: {
      sourcePool: sourceScope,
      directManagedPools: [
        {
          id: "pool-dest-a",
          name: "Destination A",
          tournament_edition_id: editionA,
          is_simulation: false,
          created_by_user_id: null,
        },
        {
          id: "pool-dest-dup",
          name: "Fampool",
          tournament_edition_id: editionA,
          is_simulation: false,
          created_by_user_id: null,
        },
      ],
      destinationParticipantsByPoolId: {
        "pool-dest-dup": [
          {
            userId: null,
            email: "adarsh@example.com",
            displayName: "Someone else",
          },
        ],
      },
      currentUserId: "user-1",
      poolAdminMembershipIds: ["pool-source", "pool-dest-a", "pool-dest-dup"],
    },
    movingParticipant: {
      userId: null,
      email: "adarsh@example.com",
      displayName: "Adarsh",
    },
  });
  t(built.eligibleOptions.length === 1, "eligible destination stays in select");
  t(built.eligibleOptions[0]?.id === "pool-dest-a", "PPFamily-style eligible destination remains selectable");
  t(
    built.blockedDestinations.some((blocked) => blocked.id === "pool-dest-dup"),
    "duplicate destination listed as blocked with reason",
  );
  t(
    Boolean(
      built.blockedDestinations
        .find((blocked) => blocked.id === "pool-dest-dup")
        ?.label.includes("same email already exists"),
    ),
    "duplicate email reason is explicit",
  );
}

{
  const built = buildMoveDestinationOptionsForParticipant({
    context: {
      sourcePool: sourceScope,
      directManagedPools: [
        {
          id: "pool-dest-a",
          name: "PPFamily",
          tournament_edition_id: editionA,
          is_simulation: false,
          created_by_user_id: null,
        },
      ],
      destinationParticipantsByPoolId: {
        "pool-dest-a": [
          { userId: null, email: "alice@example.com", displayName: "Alice" },
          { userId: null, email: "bob@example.com", displayName: "Bob" },
          { userId: "user-other", email: "carol@example.com", displayName: "Carol" },
        ],
      },
      currentUserId: "user-1",
      poolAdminMembershipIds: ["pool-source", "pool-dest-a"],
    },
    movingParticipant: {
      userId: "user-adarsh",
      email: "info@chinesetrack.com",
      displayName: "Adarsh",
    },
  });
  t(built.eligibleOptions.length === 1, "unrelated destination participants do not block move");
  t(built.eligibleOptions[0]?.name === "PPFamily", "PPFamily remains selectable");
}

t(
  !detectParticipantDuplicateInDestinationPool(
    {
      userId: "user-adarsh",
      email: "info@chinesetrack.com",
      displayName: "Adarsh",
    },
    [
      { userId: null, email: "alice@example.com", displayName: "Alice" },
      { userId: "user-other", email: "bob@example.com", displayName: "Bob" },
    ],
  ).isDuplicate,
  "duplicate check is scoped to destination pool participants only",
);

{
  const diagnostic = diagnoseMoveDestinationPool({
    sourcePool: sourceScope,
    destinationPool: {
      id: "pool-sim",
      name: "Simulation",
      tournament_edition_id: editionA,
      is_simulation: true,
      created_by_user_id: null,
    },
    currentUserId: "user-1",
    poolAdminMembershipIds: new Set(["pool-sim"]),
    movingParticipant: { userId: null, email: "", displayName: "Adarsh" },
    destinationParticipants: [],
  });
  t(
    diagnostic.excludedReason === "incompatible_simulation",
    "simulation-incompatible pool remains excluded",
  );
}

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
  !participantWouldDuplicateInDestinationPool(
    { userId: null, email: "", displayName: "Jamie Lee" },
    [{ userId: null, email: "other@example.com", displayName: "jamie lee" }],
  ),
  "display name alone does not count as duplicate",
);

t(
  !participantWouldDuplicateInDestinationPool(
    { userId: null, email: "", displayName: "Jamie" },
    [{ userId: null, email: "", displayName: "Jamie" }],
  ),
  "null user_id does not match null user_id",
);

t(
  !participantWouldDuplicateInDestinationPool(
    { userId: null, email: "", displayName: "Jamie" },
    [{ userId: null, email: "", displayName: "Someone else" }],
  ),
  "empty email does not match empty email",
);

t(
  participantWouldDuplicateInDestinationPool(
    { userId: "user-1", email: "other@example.com", displayName: "Jamie" },
    [{ userId: "user-1", email: "jamie@example.com", displayName: "Different Name" }],
  ),
  "same user_id in destination blocks move even if email differs",
);

{
  const built = buildMoveDestinationOptionsForParticipant({
    context: {
      sourcePool: sourceScope,
      directManagedPools: [
        {
          id: "pool-dest-dup",
          name: "Blocked Pool",
          tournament_edition_id: editionA,
          is_simulation: false,
          created_by_user_id: null,
        },
      ],
      destinationParticipantsByPoolId: {
        "pool-dest-dup": [
          {
            userId: "user-adarsh",
            email: "other@example.com",
            displayName: "Other label",
          },
        ],
      },
      currentUserId: "user-1",
      poolAdminMembershipIds: ["pool-source", "pool-dest-dup"],
    },
    movingParticipant: {
      userId: "user-adarsh",
      email: "info@chinesetrack.com",
      displayName: "Adarsh",
    },
  });
  t(built.eligibleOptions.length === 0, "no selectable destinations when all blocked");
  t(
    built.emptyMessage === MOVE_PARTICIPANT_NO_AVAILABLE_DESTINATIONS_MESSAGE,
    "empty dropdown message when no destinations are selectable",
  );
  t(
    Boolean(built.blockedDestinations[0]?.label.includes("same account already exists")),
    "account duplicate reason is shown for blocked destination",
  );
}

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
