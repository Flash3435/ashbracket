import { SAMPLE_POOL_ID } from "../config/sample-pool";
import { ASHBRACKET_2026_POOL_LOCK_AT_ISO } from "../datetime/poolLockDeadline";
import { isMergedPoolName } from "../pools/poolArchive";
import { poolLocked } from "../pools/poolLocked";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AccountParticipantProfile = {
  id: string;
  pool_id: string;
  pool_lock_at?: string | null;
  pool_name?: string;
  is_simulation?: boolean;
  archived_at?: string | null;
};

/** Simulation, archived, and merged organizer pools should not drive account defaults. */
export function isDeprioritizedAccountParticipantPool(
  profile: Pick<
    AccountParticipantProfile,
    "is_simulation" | "archived_at" | "pool_name"
  >,
): boolean {
  if (profile.is_simulation) return true;
  if (profile.archived_at != null && profile.archived_at.trim() !== "") {
    return true;
  }
  if (profile.pool_name && isMergedPoolName(profile.pool_name)) return true;
  return false;
}

export function isPastAshbracket2026PoolLockDeadline(nowMs = Date.now()): boolean {
  return poolLocked(ASHBRACKET_2026_POOL_LOCK_AT_ISO, nowMs);
}

function profilePoolLocked(
  profile: AccountParticipantProfile,
  nowMs: number,
): boolean {
  return poolLocked(profile.pool_lock_at ?? null, nowMs);
}

/**
 * Default participant profile when none is selected explicitly.
 * Prefers live participant pools over simulation/archived/merged pools, then locked
 * live pools after the canonical tournament deadline.
 */
export function pickDefaultAccountParticipantId(
  profiles: AccountParticipantProfile[],
  nowMs = Date.now(),
): string | null {
  if (profiles.length === 0) return null;
  if (profiles.length === 1) return profiles[0].id;

  const preferLockedLive = isPastAshbracket2026PoolLockDeadline(nowMs);

  const ranked = profiles
    .map((profile, index) => ({
      profile,
      index,
      deprioritized: isDeprioritizedAccountParticipantPool(profile),
      locked: profilePoolLocked(profile, nowMs),
      isSample: profile.pool_id === SAMPLE_POOL_ID,
    }))
    .sort((a, b) => {
      if (a.deprioritized !== b.deprioritized) {
        return a.deprioritized ? 1 : -1;
      }
      if (a.isSample !== b.isSample) {
        return a.isSample ? -1 : 1;
      }
      if (preferLockedLive && a.locked !== b.locked) {
        return a.locked ? -1 : 1;
      }
      return a.index - b.index;
    });

  return ranked[0]?.profile.id ?? profiles[0].id;
}

/**
 * Picks which pool profile to use on account-style pages: explicit `?participant=`,
 * else a live participant pool (not simulation/archived/merged), preferring locked
 * live pools after the canonical deadline.
 */
export function resolveAccountParticipantId(
  profiles: AccountParticipantProfile[],
  participantParam: string | undefined,
  nowMs = Date.now(),
): string | null {
  const trimmed = participantParam?.trim() ?? "";
  if (trimmed && UUID_RE.test(trimmed)) {
    const found = profiles.find((p) => p.id === trimmed);
    if (found) return found.id;
  }
  return pickDefaultAccountParticipantId(profiles, nowMs);
}
