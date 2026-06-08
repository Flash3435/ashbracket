/** Lowercase trimmed email for pool admin invite matching (consistent with DB trigger). */
export function normalizePoolAdminInviteEmail(email: string): string {
  return email.trim().toLowerCase();
}
