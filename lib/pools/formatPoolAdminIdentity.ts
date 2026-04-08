import type { PoolAdminListEntry } from "@/lib/pools/listPoolAdmins";

/**
 * Prefer display name + email, then email, then short user id for admin-facing lists.
 */
export function formatPoolAdminIdentity(row: {
  displayName: string | null;
  email: string | null;
  userId: string;
}): string {
  const name = row.displayName?.trim();
  const email = row.email?.trim();
  if (name && email) return `${name} (${email})`;
  if (email) return email;
  if (name) return name;
  const id = row.userId;
  return id.length > 12 ? `User ${id.slice(0, 8)}…` : `User ${id}`;
}

export function formatPoolAdminListEntryLabel(row: PoolAdminListEntry): string {
  return formatPoolAdminIdentity({
    displayName: row.displayName,
    email: row.email,
    userId: row.userId,
  });
}
