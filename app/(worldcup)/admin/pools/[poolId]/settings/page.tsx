import { PoolScoringDebugSummary } from "@/components/admin/PoolScoringDebugSummary";
import { PoolSettingsForm } from "@/components/admin/PoolSettingsForm";
import { PoolShareInvitePanel } from "@/components/admin/PoolShareInvitePanel";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { fetchPoolScoringDebugSummary } from "@/lib/admin/fetchPoolScoringDebugSummary";
import { requireManagedPool } from "@/lib/admin/requireManagedPool";
import { mapPoolSettingsRow } from "@/lib/pools/poolSettingsDb";
import { poolShareJoinUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminPoolSettingsPage({
  params,
}: {
  params: Promise<{ poolId: string }>;
}) {
  const { poolId } = await params;
  const { pool } = await requireManagedPool(poolId);
  const supabase = await createClient();
  const { summary: scoringDebug, error: scoringDebugError } =
    await fetchPoolScoringDebugSummary(supabase, poolId);

  const initial = mapPoolSettingsRow({
    id: pool.id,
    name: pool.name,
    is_public: pool.is_public,
    show_public_rules: pool.show_public_rules,
    lock_at: pool.lock_at,
    ashbot_enabled: pool.ashbot_enabled !== false,
    payment_type: pool.payment_type ?? "free",
    entry_fee_label: pool.entry_fee_label ?? null,
    entry_fee_amount: pool.entry_fee_amount ?? null,
    payment_instructions: pool.payment_instructions ?? null,
    entry_fee_cents: pool.entry_fee_cents ?? null,
    currency_code: pool.currency_code,
    show_pot_to_participants: pool.show_pot_to_participants,
  });
  const jc = pool.join_code?.trim() ?? null;
  const shareUrl = jc ? poolShareJoinUrl(jc) : null;

  return (
    <PageContainer>
      <PageTitle
        title="Pool settings"
        description="Set your pool’s name, free vs paid entry, public leaderboard visibility, whether pool rules are visible to visitors, and when picks must be in by."
      />

      <PoolShareInvitePanel
        joinCode={jc}
        shareUrl={shareUrl}
        variant="compact"
        participantsHref={`/admin/pools/${poolId}/participants`}
      />

      <PoolSettingsForm poolId={poolId} initial={initial} />

      {scoringDebug ? (
        <PoolScoringDebugSummary
          summary={scoringDebug}
          errorMessage={scoringDebugError}
        />
      ) : null}
    </PageContainer>
  );
}
