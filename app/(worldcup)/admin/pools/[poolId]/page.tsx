import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { requireManagedPool } from "@/lib/admin/requireManagedPool";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminPoolDashboardPage({
  params,
}: {
  params: Promise<{ poolId: string }>;
}) {
  const { poolId } = await params;
  await requireManagedPool(poolId);

  const base = `/admin/pools/${poolId}`;

  return (
    <PageContainer>
      <PageTitle
        title="Pool dashboard"
        description="Settings, participants, picks, payments, and email for this pool. Use Standings to refresh scores from official results."
      />

      <ul className="list-inside list-disc space-y-2 text-sm text-ash-muted">
        <li>
          <Link href={`${base}/settings`} className="ash-link">
            Pool settings
          </Link>
          <span> — name, public leaderboard, lock time.</span>
        </li>
        <li>
          <Link href={`${base}/participants`} className="ash-link">
            Participants
          </Link>
          <span> — invites, manual rows, payment flags.</span>
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
