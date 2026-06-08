import { PilotEnvironmentSummary } from "@/components/admin/PilotEnvironmentSummary";
import { PilotRecentEventsPanel } from "@/components/admin/PilotRecentEventsPanel";
import { PilotRunOrderPanel } from "@/components/admin/PilotRunOrderPanel";
import { PilotStandingsSnapshotPanel } from "@/components/admin/PilotStandingsSnapshotPanel";
import { PoolPilotVerificationPanel } from "@/components/admin/PoolPilotVerificationPanel";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { fetchPilotChecklistContext } from "@/lib/admin/fetchPilotChecklistContext";
import { fetchRecentPilotVerificationEvents } from "@/lib/admin/pilotVerificationLog";
import { requireGlobalAdminPage } from "@/lib/admin/requireGlobalAdmin";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminPilotPage() {
  await requireGlobalAdminPage("/admin/pilot");
  const supabase = await createClient();
  const context = await fetchPilotChecklistContext(supabase);
  const events = await fetchRecentPilotVerificationEvents(supabase, 15);

  const { data: snapshots, error: snapErr } = await supabase
    .from("admin_pilot_standings_snapshots")
    .select(
      "id, label, captured_at, summary_hash, pool_id, rows, pools(name)",
    )
    .order("captured_at", { ascending: false })
    .limit(20);

  const poolNameById = new Map(
    context.pilotSnapshot.livePools.map((p) => [p.poolId, p.poolName]),
  );

  const recentSnapshots =
    snapErr?.message.includes("admin_pilot_standings_snapshots")
      ? []
      : (snapshots ?? []).map((s) => {
          const poolId = s.pool_id as string;
          const rows = (s.rows as unknown[]) ?? [];
          const joined = s.pools as { name: string } | { name: string }[] | null;
          const nameFromJoin = Array.isArray(joined)
            ? joined[0]?.name
            : joined?.name;
          return {
            id: s.id as string,
            label: s.label as string,
            capturedAt: s.captured_at as string,
            summaryHash: s.summary_hash as string,
            rowCount: rows.length,
            poolId,
            poolName:
              nameFromJoin ?? poolNameById.get(poolId) ?? "Live pool",
          };
        });

  return (
    <PageContainer>
      <PageTitle
        title="Production pilot checklist"
        description="One place to verify environment, pool isolation, and live standings before and after a simulation test."
      />

      <p className="mb-6 text-sm text-ash-muted">
        <Link href="/admin/simulation" className="ash-link">
          Simulation testing
        </Link>
        {" · "}
        <Link href="/admin/results" className="ash-link">
          Live tournament results
        </Link>
        {" · "}
        See <code className="text-xs">ashbracket/docs/production-simulation-rollout.md</code>{" "}
        in the repo for the full rollout checklist. Auth email URLs (signup, password reset):{" "}
        <code className="text-xs">ashbracket/DEPLOY_NOTES.md</code> → Supabase URL Configuration.
      </p>

      <div className="space-y-8">
        <PilotEnvironmentSummary context={context} />
        <PilotRunOrderPanel />
        <PilotStandingsSnapshotPanel
          livePools={context.pilotSnapshot.livePools}
          recentSnapshots={recentSnapshots}
        />
        <PoolPilotVerificationPanel snapshot={context.pilotSnapshot} />
        <PilotRecentEventsPanel events={events.rows} loadError={events.error} />
      </div>
    </PageContainer>
  );
}
