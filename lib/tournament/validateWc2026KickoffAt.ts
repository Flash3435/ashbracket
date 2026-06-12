/** Canonical UTC instant for tournament match kickoffs (no offset suffix). */
export const KICKOFF_AT_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

/**
 * Ensures kickoff_at is a real UTC ISO instant, not local wall clock with a fake Z.
 */
export function validateKickoffAtUtc(
  iso: string,
  label: string,
): string | null {
  if (!KICKOFF_AT_UTC_RE.test(iso)) {
    return `${label}: kickoff_at must be UTC ISO ending in Z (got ${iso})`;
  }
  if (Number.isNaN(Date.parse(iso))) {
    return `${label}: kickoff_at is not a valid instant (got ${iso})`;
  }
  return null;
}
