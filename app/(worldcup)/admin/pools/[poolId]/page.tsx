import { IncompleteBracketsPanel } from "@/components/admin/IncompleteBracketsPanel";
import { KnockoutPickStatusPanel } from "@/components/admin/KnockoutPickStatusPanel";
import { PoolPotAdminSummary } from "@/components/pools/PoolPotAdminSummary";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { loadAdminKnockoutPickStatusForPool } from "@/lib/admin/loadAdminKnockoutPickStatusForPool";
import { loadIncompleteBracketPanelForPool } from "@/lib/admin/loadIncompleteBracketPanelForPool";
import { getSimulationPoolEmailUiStatus } from "@/lib/admin/simulationPoolEmailPolicy";
import { requireManagedPool } from "@/lib/admin/requireManagedPool";
import { mapPoolPaymentFromPool, poolIsPaid } from "@/lib/pools/poolPayment";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminPoolDashboardPage({
  params,
}: {
  params: Promise<{ poolId: string }>;
}) {
  const { poolId } = await params;
  const { supabase, pool } = await requireManagedPool(poolId);
  const poolPayment = mapPoolPaymentFromPool(pool);
  const poolIsPaidPool = poolIsPaid(poolPayment);
  const simulationEmailStatus = getSimulationPoolEmailUiStatus(
    Boolean(pool.is_simulation),
  );
  const [incompleteBracketPanel, knockoutPickStatus] = await Promise.all([
    loadIncompleteBracketPanelForPool(supabase, {
      poolId,
      poolName: pool.name?.trim() || "Your pool",
      lockAtIso: pool.lock_at ?? null,
    }),
    loadAdminKnockoutPickStatusForPool(supabase, {
      poolId,
      poolName: pool.name?.trim() || "Your pool",
    }),
  ]);

  let potParticipants: { paid: boolean }[] = [];
  if (poolIsPaidPool) {
    const { data } = await supabase
      .from("participants")
      .select("is_paid")
      .eq("pool_id", poolId);
    potParticipants = (data ?? []).map((r) => ({
      paid: Boolean(r.is_paid),
    }));
  }

  const base = `/admin/pools/${poolId}`;

  return (
    <PageContainer>
      <PageTitle
        title="Pool dashboard"
        description="Settings, participants, picks, payments, and email for this pool. Use Standings to refresh scores from official results."
      />

      {poolIsPaidPool ? (
        <div className="mb-6">
          <PoolPotAdminSummary
            poolPayment={poolPayment}
            participants={potParticipants}
          />
        </div>
      ) : null}

      <KnockoutPickStatusPanel data={knockoutPickStatus} className="mb-6" />

      <IncompleteBracketsPanel
        data={incompleteBracketPanel}
        simulationEmailStatus={simulationEmailStatus}
        showPoolName={false}
        className="mb-6"
      />

      <ul className="list-inside list-disc space-y-2 text-sm text-ash-muted">
        <li>
          <Link href={`${base}/settings`} className="ash-link">
            Pool settings
          </Link>
          <span> — name, free vs paid, public leaderboard, lock time.</span>
        </li>
        <li>
          <Link href={`${base}/participants`} className="ash-link">
            Participants
          </Link>
          <span> — invites, manual rows, payment flags, pot summary.</span>
        </li>
        <li>
          <Link href={`${base}/picks`} className="ash-link">
            Participant picks
          </Link>
          <span> — edit brackets for any member.</span>
        </li>
        <li>
          <Link href={`${base}/payments`} className="ash-link">
            Payments
          </Link>
          <span> — overview of who paid.</span>
        </li>
        <li>
          <Link href={`${base}/communications`} className="ash-link">
            Email participants
          </Link>
          <span> — reminders and custom messages.</span>
        </li>
        <li>
          <Link href={`${base}/standings`} className="ash-link">
            Standings / recalculate
          </Link>
          <span> — re-score this pool from results and rules.</span>
        </li>
      </ul>
    </PageContainer>
  );
}
