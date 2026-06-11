import {
  resolveAccountParticipantId,
  type AccountParticipantProfile,
} from "./resolveAccountParticipantId";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type KnockoutSelectionParticipantRow = AccountParticipantProfile;

export type ResolveKnockoutSelectionParticipantResult = {
  paramId: string | null;
  selectedId: string | null;
  invalidQuery: boolean;
  invalidOtherProfile: boolean;
};

/**
 * Resolves which participant profile account-style pages should load.
 * Explicit owned `?participant=` wins; otherwise uses live-pool defaults.
 * Invalid foreign UUIDs do not fall back to a default profile.
 */
export function resolveKnockoutSelectionParticipantId(
  profiles: KnockoutSelectionParticipantRow[],
  participantParam: string,
  nowMs = Date.now(),
): ResolveKnockoutSelectionParticipantResult {
  const trimmed = participantParam.trim();
  const paramId = trimmed && UUID_RE.test(trimmed) ? trimmed : null;
  const profileIds = new Set(profiles.map((p) => p.id));

  const invalidQuery = Boolean(trimmed) && !UUID_RE.test(trimmed);
  const invalidOtherProfile =
    paramId != null && !profileIds.has(paramId);

  let selectedId: string | null = null;
  if (paramId && profileIds.has(paramId)) {
    selectedId = paramId;
  } else if (!invalidOtherProfile) {
    selectedId = resolveAccountParticipantId(profiles, undefined, nowMs);
  }

  return {
    paramId,
    selectedId,
    invalidQuery,
    invalidOtherProfile,
  };
}
