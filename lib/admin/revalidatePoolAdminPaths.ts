import { revalidatePath } from "next/cache";

/**
 * Invalidate public surfaces and pool-scoped admin routes after pool data changes.
 */
export function revalidatePoolAdminPaths(poolId: string): void {
  revalidatePath("/");
  revalidatePath("/rules");
  revalidatePath("/account");
  revalidatePath("/account/picks");
  revalidatePath("/admin");
  revalidatePath(`/admin/pools/${poolId}`);
  revalidatePath(`/admin/pools/${poolId}/settings`);
  revalidatePath(`/admin/pools/${poolId}/participants`);
  revalidatePath(`/admin/pools/${poolId}/picks`);
  revalidatePath(`/admin/pools/${poolId}/payments`);
  revalidatePath(`/admin/pools/${poolId}/communications`);
  revalidatePath(`/admin/pools/${poolId}/standings`);
  revalidatePath(`/admin/pools/${poolId}/admins`);
  revalidatePath(`/admin/pools/${poolId}/admins/history`);
  revalidatePath("/participant/[id]", "layout");
}
