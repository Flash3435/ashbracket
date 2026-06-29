/** Postgres uuid text form — any version/variant nibble (not RFC-variant strict). */
export const PARTICIPANT_PROFILE_ROUTE_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Normalizes a `/participant/[id]` route param to `participants.id`.
 * Rejects display names and other non-uuid slugs.
 */
export function normalizeParticipantProfileRouteId(raw: string): string | null {
  const trimmed = raw.trim();
  return PARTICIPANT_PROFILE_ROUTE_ID_RE.test(trimmed) ? trimmed : null;
}

/** Public profile path for a participant row; null when the id is not routable. */
export function participantPublicProfileHref(participantId: string): string | null {
  const id = normalizeParticipantProfileRouteId(participantId);
  return id ? `/participant/${id}` : null;
}
