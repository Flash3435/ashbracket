import { GlobalActivityDashboard } from "@/components/poolActivity/GlobalActivityDashboard";
import { GlobalActivityEngagementSummaryCards } from "@/components/poolActivity/GlobalActivityEngagementSummary";
import { GlobalPoolEngagementTable } from "@/components/poolActivity/GlobalPoolEngagementTable";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { requireGlobalAdminPage } from "@/lib/admin/requireGlobalAdmin";
import { loadGlobalActivityForAdmin } from "@/lib/poolActivity/loadGlobalActivityForAdmin";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ pool?: string }>;
};

export default async function AdminGlobalActivityPage({ searchParams }: PageProps) {
  await requireGlobalAdminPage("/admin/activity");

  const sp = await searchParams;
  const poolParam = sp.pool?.trim() ?? "";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return null;
  }

  let feedError: string | null = null;
  let data: Awaited<ReturnType<typeof loadGlobalActivityForAdmin>> | null = null;

  try {
    data = await loadGlobalActivityForAdmin(supabase, user.id, {
      poolId: poolParam || null,
    });
  } catch (e) {
    feedError =
      e instanceof Error ? e.message : "Could not load global activity.";
  }

  return (
    <PageContainer>
      <div className="mb-6">
        <Link href="/admin" className="ash-link text-sm">
          ← Admin
        </Link>
      </div>

      <PageTitle
        title="Global activity"
        description="Monitor engagement across all pools."
      />

      <p className="mb-6 text-xs text-ash-muted">
        Site-wide view for global administrators (
        <code className="text-ash-text/80">app_admins</code>
        ). Does not generate milestones or daily recaps on load.
      </p>

      {feedError ? (
        <p
          className="mb-4 rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200"
          role="alert"
        >
          {feedError}
        </p>
      ) : null}

      {data ? (
        <>
          <GlobalActivityEngagementSummaryCards summary={data.summary} />
          <GlobalPoolEngagementTable rows={data.poolOverview} />
          <section>
            <h2 className="mb-3 text-sm font-semibold text-ash-text">
              Recent activity
            </h2>
            <GlobalActivityDashboard
              items={data.items}
              reactions={data.reactions}
              viewerParticipantIdByPoolId={data.viewerParticipantIdByPoolId}
              poolOptions={data.poolOptions}
              initialPoolId={poolParam || null}
            />
          </section>
        </>
      ) : null}
    </PageContainer>
  );
}
