import {
  areWorldCupPoolsCompatibleForMove,
  detectParticipantDuplicateInDestinationPool,
  normalizeParticipantEmail,
  type ParticipantMoveIdentity,
  type WorldCupPoolMoveScope,
  worldCupPoolMoveScopeFromManagedPool,
} from "./worldCupParticipantMove";

export const MERGED_POOL_NAME_PREFIX = "[Merged] ";

export type WorldCupPoolMergePool = {
  id: string;
  name: string;
  tournamentEditionId: string | null;
  isSimulation: boolean;
};

export type WorldCupPoolMergeParticipant = {
  id: string;
  displayName: string;
  email: string;
  userId: string | null;
};

export type PoolMergeBlockReason =
  | "duplicate_user_id"
  | "duplicate_email"
  | "missing_identity"
  | "source_duplicate_user_id"
  | "source_duplicate_email";

export type PoolMergeParticipantPlan = {
  participant: WorldCupPoolMergeParticipant;
  action: "move" | "block";
  blockReason?: PoolMergeBlockReason;
  blockDetail?: string;
  matchedDestination?: ParticipantMoveIdentity & { id?: string };
};

export type WorldCupPoolMergePlan = {
  sourcePool: WorldCupPoolMergePool;
  destinationPool: WorldCupPoolMergePool;
  sourceParticipantCount: number;
  destinationParticipantCount: number;
  participants: PoolMergeParticipantPlan[];
  movable: PoolMergeParticipantPlan[];
  blocked: PoolMergeParticipantPlan[];
};

export function participantMoveIdentityFromMergeRow(
  row: WorldCupPoolMergeParticipant,
): ParticipantMoveIdentity {
  return {
    userId: row.userId,
    email: row.email,
    displayName: row.displayName,
  };
}

export function mergedPoolDisplayName(currentName: string): string {
  const trimmed = currentName.trim() || "Untitled pool";
  if (trimmed.startsWith(MERGED_POOL_NAME_PREFIX)) {
    return trimmed;
  }
  return `${MERGED_POOL_NAME_PREFIX}${trimmed}`;
}

export function validateWorldCupPoolMergePools(
  source: WorldCupPoolMergePool,
  destination: WorldCupPoolMergePool,
): { ok: true } | { ok: false; reason: string } {
  if (source.id === destination.id) {
    return { ok: false, reason: "Source and destination pools must be different." };
  }
  if (!source.tournamentEditionId || !destination.tournamentEditionId) {
    return { ok: false, reason: "Both pools must belong to a World Cup tournament edition." };
  }

  const sourceScope: WorldCupPoolMoveScope = {
    poolId: source.id,
    tournamentEditionId: source.tournamentEditionId,
    isSimulation: source.isSimulation,
  };
  const destinationScope: WorldCupPoolMoveScope = {
    poolId: destination.id,
    tournamentEditionId: destination.tournamentEditionId,
    isSimulation: destination.isSimulation,
  };

  if (!areWorldCupPoolsCompatibleForMove(sourceScope, destinationScope)) {
    if (source.tournamentEditionId !== destination.tournamentEditionId) {
      return { ok: false, reason: "Pools use different tournament editions and cannot be merged." };
    }
    if (source.isSimulation !== destination.isSimulation) {
      return {
        ok: false,
        reason: "Live and simulation World Cup pools cannot be merged together.",
      };
    }
    return { ok: false, reason: "Pools are not compatible for a World Cup merge." };
  }

  return { ok: true };
}

export function mergeParticipantMissingIdentity(
  participant: WorldCupPoolMergeParticipant,
): boolean {
  const userId = participant.userId?.trim() || "";
  const email = normalizeParticipantEmail(participant.email);
  const displayName = participant.displayName.trim();
  return userId.length === 0 && email.length === 0 && displayName.length === 0;
}

export function formatPoolMergeBlockReason(
  reason: PoolMergeBlockReason,
  matched?: ParticipantMoveIdentity,
): string {
  switch (reason) {
    case "duplicate_user_id":
      return matched
        ? `same user_id already exists in destination (${matched.displayName || matched.email || "linked account"})`
        : "same user_id already exists in destination";
    case "duplicate_email":
      return matched
        ? `same email already exists in destination (${matched.displayName || matched.email})`
        : "same email already exists in destination";
    case "missing_identity":
      return "missing display name, email, and linked user account";
    case "source_duplicate_user_id":
      return "duplicate user_id within source pool merge batch";
    case "source_duplicate_email":
      return "duplicate email within source pool merge batch";
    default:
      return reason;
  }
}

/** Plans which source participants can move into the destination pool without duplicates. */
export function planWorldCupPoolMerge(args: {
  sourcePool: WorldCupPoolMergePool;
  destinationPool: WorldCupPoolMergePool;
  sourceParticipants: WorldCupPoolMergeParticipant[];
  destinationParticipants: Array<WorldCupPoolMergeParticipant | ParticipantMoveIdentity & { id?: string }>;
}): { ok: true; plan: WorldCupPoolMergePlan } | { ok: false; reason: string } {
  const gate = validateWorldCupPoolMergePools(args.sourcePool, args.destinationPool);
  if (!gate.ok) {
    return gate;
  }

  const destinationIdentities: ParticipantMoveIdentity[] = args.destinationParticipants.map((row) =>
    "id" in row && row.id
      ? participantMoveIdentityFromMergeRow(row as WorldCupPoolMergeParticipant)
      : {
          userId: row.userId ?? null,
          email: row.email,
          displayName: row.displayName,
        },
  );

  const destinationByUserId = new Map<string, ParticipantMoveIdentity & { id?: string }>();
  const destinationByEmail = new Map<string, ParticipantMoveIdentity & { id?: string }>();
  for (const row of args.destinationParticipants) {
    const identity =
      "id" in row && row.id
        ? participantMoveIdentityFromMergeRow(row as WorldCupPoolMergeParticipant)
        : {
            userId: row.userId ?? null,
            email: row.email,
            displayName: row.displayName,
          };
    const userId = identity.userId?.trim();
    if (userId) {
      destinationByUserId.set(userId, { ...identity, id: "id" in row ? row.id : undefined });
    }
    const email = normalizeParticipantEmail(identity.email);
    if (email.length > 0) {
      destinationByEmail.set(email, { ...identity, id: "id" in row ? row.id : undefined });
    }
  }

  const sortedSource = [...args.sourceParticipants].sort((a, b) =>
    a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" }),
  );

  const seenSourceUserIds = new Set<string>();
  const seenSourceEmails = new Set<string>();
  const participants: PoolMergeParticipantPlan[] = [];

  for (const participant of sortedSource) {
    if (mergeParticipantMissingIdentity(participant)) {
      participants.push({
        participant,
        action: "block",
        blockReason: "missing_identity",
        blockDetail: formatPoolMergeBlockReason("missing_identity"),
      });
      continue;
    }

    const userId = participant.userId?.trim() || "";
    if (userId) {
      if (seenSourceUserIds.has(userId)) {
        participants.push({
          participant,
          action: "block",
          blockReason: "source_duplicate_user_id",
          blockDetail: formatPoolMergeBlockReason("source_duplicate_user_id"),
        });
        continue;
      }
      seenSourceUserIds.add(userId);
    }

    const email = normalizeParticipantEmail(participant.email);
    if (email.length > 0) {
      if (seenSourceEmails.has(email)) {
        participants.push({
          participant,
          action: "block",
          blockReason: "source_duplicate_email",
          blockDetail: formatPoolMergeBlockReason("source_duplicate_email"),
        });
        continue;
      }
      seenSourceEmails.add(email);
    }

    const duplicate = detectParticipantDuplicateInDestinationPool(
      participantMoveIdentityFromMergeRow(participant),
      destinationIdentities,
    );

    if (duplicate.isDuplicate && duplicate.reason) {
      const matched = duplicate.matched;
      participants.push({
        participant,
        action: "block",
        blockReason:
          duplicate.reason === "user_id" ? "duplicate_user_id" : "duplicate_email",
        blockDetail: formatPoolMergeBlockReason(
          duplicate.reason === "user_id" ? "duplicate_user_id" : "duplicate_email",
          matched,
        ),
        matchedDestination: matched,
      });
      continue;
    }

    participants.push({
      participant,
      action: "move",
    });
  }

  const movable = participants.filter((row) => row.action === "move");
  const blocked = participants.filter((row) => row.action === "block");

  return {
    ok: true,
    plan: {
      sourcePool: args.sourcePool,
      destinationPool: args.destinationPool,
      sourceParticipantCount: args.sourceParticipants.length,
      destinationParticipantCount: args.destinationParticipants.length,
      participants,
      movable,
      blocked,
    },
  };
}

export function formatWorldCupPoolMergeDryRunReport(plan: WorldCupPoolMergePlan): string {
  const lines: string[] = [];
  lines.push("World Cup pool merge dry-run");
  lines.push("==========================");
  lines.push(`Source:      ${plan.sourcePool.name} (${plan.sourcePool.id})`);
  lines.push(`Destination: ${plan.destinationPool.name} (${plan.destinationPool.id})`);
  lines.push(`Source participants:      ${plan.sourceParticipantCount}`);
  lines.push(`Destination participants: ${plan.destinationParticipantCount}`);
  lines.push(`Will move:  ${plan.movable.length}`);
  lines.push(`Will block: ${plan.blocked.length}`);
  lines.push("");

  if (plan.movable.length > 0) {
    lines.push("Participants to move:");
    for (const row of plan.movable) {
      const p = row.participant;
      lines.push(
        `  - ${p.displayName || "(no name)"} <${p.email || "no email"}> [${p.id}] user_id=${p.userId ?? "null"}`,
      );
    }
    lines.push("");
  }

  if (plan.blocked.length > 0) {
    lines.push("Blocked participants:");
    for (const row of plan.blocked) {
      const p = row.participant;
      lines.push(
        `  - ${p.displayName || "(no name)"} <${p.email || "no email"}> [${p.id}] — ${row.blockDetail ?? row.blockReason}`,
      );
    }
    lines.push("");
  }

  lines.push("After apply:");
  lines.push(`  - Source pool will be renamed to: ${mergedPoolDisplayName(plan.sourcePool.name)}`);
  lines.push("  - Source pool will be set to private (is_public = false)");
  lines.push("  - Standings will be recomputed for both pools once at the end");
  lines.push("  - Source pool row will NOT be deleted");

  return lines.join("\n");
}

export function worldCupPoolMergePoolFromRow(row: {
  id: string;
  name: string | null;
  tournament_edition_id: string | null;
  is_simulation: boolean | null;
}): WorldCupPoolMergePool {
  return {
    id: row.id,
    name: row.name?.trim() || "Untitled pool",
    tournamentEditionId: row.tournament_edition_id,
    isSimulation: Boolean(row.is_simulation),
  };
}

export function poolScopeFromMergePool(pool: WorldCupPoolMergePool) {
  return worldCupPoolMoveScopeFromManagedPool({
    id: pool.id,
    tournament_edition_id: pool.tournamentEditionId ?? "",
    is_simulation: pool.isSimulation,
  });
}
