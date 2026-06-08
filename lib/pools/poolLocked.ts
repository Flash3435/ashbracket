/** True when `pools.lock_at` is in the past (pre-knockout picks frozen). */
export function poolLocked(lockAt: string | null | undefined): boolean {
  if (lockAt == null || lockAt === "") return false;
  const t = new Date(lockAt).getTime();
  if (Number.isNaN(t)) return false;
  return t <= Date.now();
}
