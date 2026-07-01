import { KnockoutOutBackfillReviewPanel } from "@/components/admin/KnockoutOutBackfillReviewPanel";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import {
  loadKnockoutOutPickBackfillReview,
  loadManagedPoolIdsForBackfillReview,
} from "@/lib/admin/loadKnockoutOutPickBackfillReview";
import { requireGlobalAdminPage } from "@/lib/admin/requireGlobalAdmin";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminKnockoutOutBackfillPage() {
  await requireGlobalAdminPage("/admin/knockout-out-backfill");

  const supabase = await createClient();
  const pools = await loadManagedPoolIdsForBackfillReview(supabase);

  let loadError: string | null = null;
  let data = null;

  if (!pools.ok) {
    loadError = pools.error;
  } else {
    const reviewResult = await loadKnockoutOutPickBackfillReview(
      supabase,
      pools.poolIds,
    );
    if (!reviewResult.ok) {
      loadError = reviewResult.error;
    } else {
      data = reviewResult.data;
    }
  }

  return (
    <PageContainer>
      <PageTitle
        title="Knockout out-pick backfill review"
        description="Review medium-confidence historical pick clears from admin correction audit logs before restoring them as out picks."
      />
      <p className="mt-2 text-sm text-ash-muted">
        CLI workflow still available:{" "}
        <code className="text-xs">scripts/backfill-knockout-out-picks-from-audit.ts</code>
        .{" "}
        <Link href="/admin" className="ash-link">
          Back to admin home
        </Link>
      </p>

      {loadError ? (
        <p className="mt-6 rounded-md border border-red-800/70 bg-red-950/35 px-3 py-2 text-sm text-red-200">
          {loadError}
        </p>
      ) : data ? (
        <div className="mt-6">
          <KnockoutOutBackfillReviewPanel
            summary={data.summary}
            mediumReports={data.mediumReports}
            highConfidenceRows={data.highConfidenceRows}
            manualAuditGaps={data.manualAuditGaps}
            generatedAt={data.generatedAt}
          />
        </div>
      ) : null}
    </PageContainer>
  );
}
