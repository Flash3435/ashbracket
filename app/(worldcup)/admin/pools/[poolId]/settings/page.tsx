import { PoolSettingsForm } from "@/components/admin/PoolSettingsForm";
import { PoolShareInvitePanel } from "@/components/admin/PoolShareInvitePanel";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { requireManagedPool } from "@/lib/admin/requireManagedPool";
import { mapPoolSettingsRow } from "@/lib/pools/poolSettingsDb";
import { poolShareJoinUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

export default async function AdminPoolSettingsPage({
  params,
}: {
  params: Promise<{ poolId: string }>;
}) {
  const { poolId } = await params;
  const { pool } = await requireManagedPool(poolId);

  const initial = mapPoolSettingsRow({
    id: pool.id,
    name: pool.name,
    is_public: pool.is_public,
    show_public_rules: pool.show_public_rules,
    lock_at: pool.lock_at,
  });
  const jc = pool.join_code?.trim() ?? null;
  const shareUrl = jc ? poolShareJoinUrl(jc) : null;

  return (
    <PageContainer>
      <PageTitle
        title="Pool settings"
        description="Set your pool’s name, public leaderboard visibility, whether pool rules are visible to visitors, and when picks must be in by."
      />

      <PoolShareInvitePanel
        joinCode={jc}
        shareUrl={shareUrl}
        variant="compact"
        participantsHref={`/admin/pools/${poolId}/participants`}
      />

      <PoolSettingsForm poolId={poolId} initial={initial} />
    </PageContainer>
  );
}
