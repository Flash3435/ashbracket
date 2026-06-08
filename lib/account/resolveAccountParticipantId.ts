import { SAMPLE_POOL_ID } from "../config/sample-pool";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Profile = { id: string; pool_id: string };

/**
 * Picks which pool profile to use on account-style pages: explicit `?participant=`,
 * else sample pool profile when present, else first profile (created_at order from query).
 */
export function resolveAccountParticipantId(
  profiles: Profile[],
  participantParam: string | undefined,
): string | null {
  const trimmed = participantParam?.trim() ?? "";
  if (trimmed && UUID_RE.test(trimmed)) {
    const found = profiles.find((p) => p.id === trimmed);
    if (found) return found.id;
  }
  if (profiles.length === 0) return null;
  if (profiles.length === 1) return profiles[0].id;
  const sample = profiles.find((p) => p.pool_id === SAMPLE_POOL_ID);
  return sample?.id ?? profiles[0].id;
}
