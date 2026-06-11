import type { ManagedPoolRow } from "@/lib/pools/fetchManagedPoolsForViewer";

export const MOVE_PARTICIPANT_MODAL_INTRO =
  "Move this participant and all of their World Cup picks to another pool you administer. Use this when someone was added to the wrong pool.";

export const MOVE_PARTICIPANT_CONFIRM_WARNING =
  "This will move the participant, their payment status, and all submitted picks to the selected pool. Their scores will be recalculated in the new pool.";

export const MOVE_PARTICIPANT_DUPLICATE_BLOCKED_MESSAGE =
  "This participant already appears in the destination pool. Remove or merge the duplicate before moving them.";

export const MOVE_PARTICIPANT_NO_DESTINATIONS_MESSAGE =
  "You have no other World Cup pools to move participants to.";

export const MOVE_PARTICIPANT_NO_AVAILABLE_DESTINATIONS_MESSAGE =
  "There are no available destination pools for this participant.";

export type ParticipantDuplicateMatchReason = "user_id" | "email";

export type WorldCupPoolMoveScope = {
  poolId: string;
  tournamentEditionId: string;
  isSimulation: boolean;
};

export type ParticipantMoveIdentity = {
  userId: string | null;
  email: string;
  displayName: string;
};

export function normalizeParticipantEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeParticipantDisplayName(displayName: string): string {
  return displayName.trim().toLowerCase();
}

export function worldCupPoolMoveScopeFromManagedPool(
  pool: Pick<ManagedPoolRow, "id" | "tournament_edition_id" | "is_simulation">,
): WorldCupPoolMoveScope {
  return {
    poolId: pool.id,
    tournamentEditionId: pool.tournament_edition_id,
    isSimulation: pool.is_simulation,
  };
}

/** World Cup pools are compatible when they share edition and simulation mode. */
export function areWorldCupPoolsCompatibleForMove(
  source: WorldCupPoolMoveScope,
  destination: WorldCupPoolMoveScope,
): boolean {
  if (!source.tournamentEditionId || !destination.tournamentEditionId) {
    return false;
  }
  return (
    source.poolId !== destination.poolId &&
    source.tournamentEditionId === destination.tournamentEditionId &&
    source.isSimulation === destination.isSimulation
  );
}

export type DirectPoolAdminMoveAccessResult =
  | { ok: true }
  | { ok: false; error: string };

const MOVE_POOL_ACCESS_DENIED_MESSAGE =
  "You do not have access to one of these pools.";

export type MoveDestinationExclusionReason =
  | "source_pool"
  | "not_direct_admin"
  | "incompatible_edition"
  | "incompatible_simulation"
  | "duplicate_participant"
  | "eligible";

export type MoveDestinationDiagnostic = {
  poolId: string;
  poolName: string;
  directAdmin: boolean;
  compatible: boolean;
  duplicateUser: boolean;
  duplicateEmail: boolean;
  duplicateMatchReason: ParticipantDuplicateMatchReason | null;
  matchedParticipant: ParticipantMoveIdentity | null;
  excludedReason: MoveDestinationExclusionReason;
};

export type MoveDestinationOption = {
  id: string;
  name: string;
};

export type MoveDestinationBlocked = {
  id: string;
  name: string;
  label: string;
};

export type ParticipantMoveDestinationContext = {
  sourcePool: WorldCupPoolMoveScope;
  directManagedPools: Pick<
    ManagedPoolRow,
    "id" | "name" | "tournament_edition_id" | "is_simulation" | "created_by_user_id"
  >[];
  destinationParticipantsByPoolId: Record<string, ParticipantMoveIdentity[]>;
  currentUserId: string;
  poolAdminMembershipIds: string[];
};

/** Requires direct pool management on both source and destination pools. */
export function validateDirectPoolAdminMoveAccess(
  sourcePoolId: string,
  destinationPoolId: string,
  directAdminPoolIds: Iterable<string>,
): DirectPoolAdminMoveAccessResult {
  const adminIds = new Set(directAdminPoolIds);
  if (!adminIds.has(sourcePoolId.trim()) || !adminIds.has(destinationPoolId.trim())) {
    return { ok: false, error: MOVE_POOL_ACCESS_DENIED_MESSAGE };
  }
  return { ok: true };
}

export function userDirectlyManagesPoolForMove(
  pool: Pick<ManagedPoolRow, "id" | "created_by_user_id">,
  userId: string,
  poolAdminMembershipIds: Set<string>,
): boolean {
  return poolAdminMembershipIds.has(pool.id) || pool.created_by_user_id === userId;
}

export function diagnoseMoveDestinationPool(args: {
  sourcePool: WorldCupPoolMoveScope;
  destinationPool: Pick<
    ManagedPoolRow,
    "id" | "name" | "tournament_edition_id" | "is_simulation" | "created_by_user_id"
  >;
  currentUserId: string;
  poolAdminMembershipIds: Set<string>;
  movingParticipant: ParticipantMoveIdentity;
  destinationParticipants: ParticipantMoveIdentity[];
}): MoveDestinationDiagnostic {
  const destinationScope = worldCupPoolMoveScopeFromManagedPool(args.destinationPool);
  const poolName = args.destinationPool.name?.trim() || "Untitled pool";
  const directAdmin = userDirectlyManagesPoolForMove(
    args.destinationPool,
    args.currentUserId,
    args.poolAdminMembershipIds,
  );

  if (args.sourcePool.poolId === destinationScope.poolId) {
    return {
      poolId: destinationScope.poolId,
      poolName,
      directAdmin,
      compatible: false,
      duplicateUser: false,
      duplicateEmail: false,
      duplicateMatchReason: null,
      matchedParticipant: null,
      excludedReason: "source_pool",
    };
  }

  if (!directAdmin) {
    return {
      poolId: destinationScope.poolId,
      poolName,
      directAdmin: false,
      compatible: false,
      duplicateUser: false,
      duplicateEmail: false,
      duplicateMatchReason: null,
      matchedParticipant: null,
      excludedReason: "not_direct_admin",
    };
  }

  const editionMatch =
    Boolean(args.sourcePool.tournamentEditionId) &&
    Boolean(destinationScope.tournamentEditionId) &&
    args.sourcePool.tournamentEditionId === destinationScope.tournamentEditionId;
  const simulationMatch = args.sourcePool.isSimulation === destinationScope.isSimulation;

  if (!editionMatch) {
    return {
      poolId: destinationScope.poolId,
      poolName,
      directAdmin: true,
      compatible: false,
      duplicateUser: false,
      duplicateEmail: false,
      duplicateMatchReason: null,
      matchedParticipant: null,
      excludedReason: "incompatible_edition",
    };
  }

  if (!simulationMatch) {
    return {
      poolId: destinationScope.poolId,
      poolName,
      directAdmin: true,
      compatible: false,
      duplicateUser: false,
      duplicateEmail: false,
      duplicateMatchReason: null,
      matchedParticipant: null,
      excludedReason: "incompatible_simulation",
    };
  }

  const duplicate = detectParticipantDuplicateInDestinationPool(
    args.movingParticipant,
    args.destinationParticipants,
  );

  if (duplicate.isDuplicate) {
    return {
      poolId: destinationScope.poolId,
      poolName,
      directAdmin: true,
      compatible: true,
      duplicateUser: duplicate.reason === "user_id",
      duplicateEmail: duplicate.reason === "email",
      duplicateMatchReason: duplicate.reason,
      matchedParticipant: duplicate.matched ?? null,
      excludedReason: "duplicate_participant",
    };
  }

  return {
    poolId: destinationScope.poolId,
    poolName,
    directAdmin: true,
    compatible: true,
    duplicateUser: false,
    duplicateEmail: false,
    duplicateMatchReason: null,
    matchedParticipant: null,
    excludedReason: "eligible",
  };
}

export function detectParticipantDuplicateInDestinationPool(
  moving: ParticipantMoveIdentity,
  destinationParticipants: ParticipantMoveIdentity[],
): {
  isDuplicate: boolean;
  reason: ParticipantDuplicateMatchReason | null;
  matched?: ParticipantMoveIdentity;
} {
  const movingUserId = moving.userId?.trim() || null;
  const movingEmail = normalizeParticipantEmail(moving.email);

  for (const existing of destinationParticipants) {
    const existingUserId = existing.userId?.trim() || null;
    if (movingUserId && existingUserId && movingUserId === existingUserId) {
      return { isDuplicate: true, reason: "user_id", matched: existing };
    }

    const existingEmail = normalizeParticipantEmail(existing.email);
    if (movingEmail.length > 0 && existingEmail.length > 0 && movingEmail === existingEmail) {
      return { isDuplicate: true, reason: "email", matched: existing };
    }
  }

  return { isDuplicate: false, reason: null };
}

export function formatMoveDestinationBlockedLabel(
  diagnostic: MoveDestinationDiagnostic,
): string | null {
  if (diagnostic.excludedReason === "duplicate_participant") {
    if (diagnostic.duplicateMatchReason === "user_id") {
      return `${diagnostic.poolName} — same account already exists`;
    }
    if (diagnostic.duplicateMatchReason === "email") {
      return `${diagnostic.poolName} — same email already exists`;
    }
    return `${diagnostic.poolName} — participant already exists`;
  }
  if (diagnostic.excludedReason === "incompatible_simulation") {
    return `${diagnostic.poolName} — simulation pools cannot be mixed`;
  }
  if (diagnostic.excludedReason === "incompatible_edition") {
    return `${diagnostic.poolName} — different World Cup edition`;
  }
  return null;
}

export function buildMoveDestinationOptionsForParticipant(args: {
  context: ParticipantMoveDestinationContext;
  movingParticipant: ParticipantMoveIdentity;
}): {
  eligibleOptions: MoveDestinationOption[];
  blockedDestinations: MoveDestinationBlocked[];
  diagnostics: MoveDestinationDiagnostic[];
  emptyMessage?: string;
} {
  const poolAdminMembershipIds = new Set(args.context.poolAdminMembershipIds);
  const diagnostics = args.context.directManagedPools.map((pool) =>
    diagnoseMoveDestinationPool({
      sourcePool: args.context.sourcePool,
      destinationPool: pool,
      currentUserId: args.context.currentUserId,
      poolAdminMembershipIds,
      movingParticipant: args.movingParticipant,
      destinationParticipants:
        args.context.destinationParticipantsByPoolId[pool.id] ?? [],
    }),
  );

  const eligibleOptions: MoveDestinationOption[] = [];
  const blockedDestinations: MoveDestinationBlocked[] = [];

  for (const diagnostic of diagnostics) {
    if (diagnostic.excludedReason === "eligible") {
      eligibleOptions.push({
        id: diagnostic.poolId,
        name: diagnostic.poolName,
      });
      continue;
    }
    const label = formatMoveDestinationBlockedLabel(diagnostic);
    if (label) {
      blockedDestinations.push({
        id: diagnostic.poolId,
        name: diagnostic.poolName,
        label,
      });
    }
  }

  const sortByName = (a: { name: string }, b: { name: string }) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  eligibleOptions.sort(sortByName);
  blockedDestinations.sort(sortByName);

  return {
    eligibleOptions,
    blockedDestinations,
    diagnostics,
    emptyMessage:
      eligibleOptions.length === 0
        ? MOVE_PARTICIPANT_NO_AVAILABLE_DESTINATIONS_MESSAGE
        : undefined,
  };
}

export function hasCompatibleDirectMoveDestination(
  context: ParticipantMoveDestinationContext,
): boolean {
  const poolAdminMembershipIds = new Set(context.poolAdminMembershipIds);
  return context.directManagedPools.some((pool) => {
    if (!userDirectlyManagesPoolForMove(pool, context.currentUserId, poolAdminMembershipIds)) {
      return false;
    }
    return areWorldCupPoolsCompatibleForMove(
      context.sourcePool,
      worldCupPoolMoveScopeFromManagedPool(pool),
    );
  });
}

/** Managed pools eligible as a move destination (excludes source and incompatible pools). */
export function filterEligibleMoveDestinationPools(
  sourcePool: WorldCupPoolMoveScope,
  managedPools: Pick<ManagedPoolRow, "id" | "name" | "tournament_edition_id" | "is_simulation">[],
): { id: string; name: string }[] {
  return managedPools
    .filter((pool) =>
      areWorldCupPoolsCompatibleForMove(
        sourcePool,
        worldCupPoolMoveScopeFromManagedPool(pool),
      ),
    )
    .map((pool) => ({
      id: pool.id,
      name: pool.name?.trim() || "Untitled pool",
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

/** Block moves when destination pool already has the same linked account or email. */
export function participantWouldDuplicateInDestinationPool(
  moving: ParticipantMoveIdentity,
  destinationParticipants: ParticipantMoveIdentity[],
): boolean {
  return detectParticipantDuplicateInDestinationPool(moving, destinationParticipants).isDuplicate;
}

export function poolsToRecomputeAfterParticipantMove(
  sourcePoolId: string,
  destinationPoolId: string,
): string[] {
  return [sourcePoolId.trim(), destinationPoolId.trim()];
}

export function formatMoveParticipantSuccessMessage(
  displayName: string,
  destinationPoolName: string,
): string {
  const name = displayName.trim() || "Participant";
  const pool = destinationPoolName.trim() || "the selected pool";
  return `${name} was moved to ${pool} with all picks preserved.`;
}

export function moveParticipantModalSubject(args: {
  displayName: string;
  email: string;
}): string {
  const name = args.displayName.trim();
  const email = args.email.trim();
  if (name && email) return `${name} (${email})`;
  return name || email || "this participant";
}

export function mapMoveWorldCupParticipantRpcError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("not authenticated") || m.includes("not authorized")) {
    return "You do not have access to one of these pools.";
  }
  if (m.includes("participant not found in source pool")) {
    return "Participant not found in this pool.";
  }
  if (m.includes("pools are not compatible")) {
    return "These pools cannot be used together for a move.";
  }
  if (m.includes("participant already exists in destination pool")) {
    return MOVE_PARTICIPANT_DUPLICATE_BLOCKED_MESSAGE;
  }
  if (m.includes("source and destination pools must differ")) {
    return "Choose a different destination pool.";
  }
  return message;
}

/** Tables updated atomically by `move_world_cup_participant_to_pool` (for tests/docs). */
export const WORLD_CUP_PARTICIPANT_MOVE_AFFECTED_TABLES = [
  "points_ledger",
  "predictions",
  "pool_activity",
  "participants",
] as const;
