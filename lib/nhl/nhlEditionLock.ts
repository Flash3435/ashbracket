/** True when `lock_at` is in the past (edition pick window closed). */
export function isNhlEditionLocked(lockAt: string | null): boolean {
  if (lockAt == null || lockAt === "") return false;
  const t = new Date(lockAt).getTime();
  if (Number.isNaN(t)) return false;
  return t <= Date.now();
}
