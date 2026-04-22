import { AdminPoolHeader } from "@/components/admin/AdminPoolHeader";
import { requireManagedPool } from "@/lib/admin/requireManagedPool";
import { canManagePoolAdmins } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

export default async function AdminPoolLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ poolId: string }>;
}) {
  const { poolId } = await params;
  const { pool, supabase } = await requireManagedPool(poolId);
  const showAuditLogLink = await canManagePoolAdmins(supabase, poolId);

  return (
    <>
      <div className="mx-auto w-full max-w-3xl px-4 pt-4">
        <AdminPoolHeader
          pool={pool}
          showAuditLogLink={showAuditLogLink}
        />
      </div>
      {children}
    </>
  );
}
