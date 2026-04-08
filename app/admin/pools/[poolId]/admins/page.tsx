import { PoolAdminsManager } from "@/components/admin/PoolAdminsManager";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { requireManagedPool } from "@/lib/admin/requireManagedPool";
import { canManagePoolAdmins } from "@/lib/auth/permissions";
import { listPoolAdminInvites } from "@/lib/pools/listPoolAdminInvites";
import { listPoolAdmins } from "@/lib/pools/listPoolAdmins";
import { getSiteUrl } from "@/lib/site-url";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminPoolAdminsPage({
  params,
}: {
  params: Promise<{ poolId: string }>;
}) {
  const { poolId } = await params;
  const { supabase } = await requireManagedPool(poolId);

  const canManageMembership = await canManagePoolAdmins(supabase, poolId);
  const canViewAudit = canManageMembership;

  const {
    data: { user: viewer },
  } = await supabase.auth.getUser();
  const viewerUserId = viewer?.id ?? "";

  let loadError: string | null = null;
  let rows: Awaited<ReturnType<typeof listPoolAdmins>> = [];
  let inviteRows: Awaited<ReturnType<typeof listPoolAdminInvites>> = [];
  try {
    rows = await listPoolAdmins(supabase, poolId);
    inviteRows = await listPoolAdminInvites(supabase, poolId);
  } catch (e) {
    loadError =
      e instanceof Error ? e.message : "Failed to load pool administrators.";
  }

  const poolAdminsManagerKey = [
    ...rows.map((r) => `${r.membershipId}:${r.role}`),
    ...inviteRows.map(
      (i) => `${i.id}:${i.claimedAt ?? ""}:${i.revokedAt ?? ""}`,
    ),
  ].join("|");

  const loginUrl = `${getSiteUrl()}/login`;

  return (
    <PageContainer>
      <PageTitle
        title="Pool admins"
        description="Pool owners and pool admins for this bracket. Owners can delegate access; pool admins help run day-to-day operations but cannot add or remove admins unless they are also an owner."
      />
      {canViewAudit ? (
        <p className="-mt-2 mb-4 text-sm">
          <Link
            href={`/admin/pools/${poolId}/admins/history`}
            className="ash-link"
          >
            View admin audit history
          </Link>
        </p>
      ) : null}
      {loadError ? (
        <p
          className="mb-4 rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200"
          role="alert"
        >
          {loadError}
        </p>
      ) : (
        <PoolAdminsManager
          key={poolAdminsManagerKey}
          poolId={poolId}
          initialRows={rows}
          initialInvites={inviteRows}
          loginUrl={loginUrl}
          canManageMembership={canManageMembership}
          viewerUserId={viewerUserId}
        />
      )}
    </PageContainer>
  );
}
