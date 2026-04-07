import Link from "next/link";
import { PublicLeaderboard } from "@/components/leaderboard/PublicLeaderboard";
import { PoolRecentActivitySection } from "@/components/poolActivity/PoolRecentActivitySection";
import { PoolPublicStatsSummary } from "@/components/pool/PoolPublicStatsSummary";
import { HomeHero } from "@/components/ui/HomeHero";
import { PageContainer } from "@/components/ui/PageContainer";
import { createClient } from "@/lib/supabase/server";
import { fetchSamplePoolLeaderboard } from "../lib/leaderboard/fetchSamplePoolLeaderboard";
import { fetchSamplePoolPublicStats } from "../lib/pool/fetchSamplePoolPublicStats";
import { resolveHomePageActions } from "../lib/pool/resolveHomePageActions";
import { resolveHomePoolParticipantId } from "../lib/pool/resolveHomePoolParticipantId";
import { resolveHomePublicPool } from "../lib/pool/resolveHomePublicPool";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createClient();
  const homePool = await resolveHomePublicPool(supabase);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const homePoolParticipantId =
    user != null
      ? await resolveHomePoolParticipantId(
          supabase,
          user.id,
          homePool.poolId,
        )
      : null;

  const [{ sections, error }, { stats, poolLabel, error: statsError }, actions] =
    await Promise.all([
      fetchSamplePoolLeaderboard(homePool),
      fetchSamplePoolPublicStats(homePool),
      resolveHomePageActions(supabase, homePool.poolId),
    ]);

  return (
    <>
      <HomeHero
        primaryCtaHref={actions.primaryCta.href}
        primaryCtaLabel={actions.primaryCta.label}
      />
      <PageContainer>
        <div className="space-y-2">
          <p className="text-base font-normal leading-relaxed text-ash-muted">
            World Cup pool standings for the sample pool. Rankings use totals
            from the public score ledger — no private participant fields are
            shown.
          </p>
        </div>

        {statsError ? (
          <PoolPublicStatsSummary
            poolLabel={poolLabel}
            errorMessage={statsError}
          />
        ) : (
          <PoolPublicStatsSummary poolLabel={poolLabel} stats={stats} />
        )}

        <PublicLeaderboard
          errorMessage={error}
          sections={sections}
          nameLinks
        />

        {homePoolParticipantId ? (
          <PoolRecentActivitySection
            poolId={homePool.poolId}
            viewAllHref={`/account/activity?participant=${homePoolParticipantId}`}
            itemLimit={5}
            compact
            showWhenEmpty
          />
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Link href="/rules" className="ash-surface-interactive block p-4">
            <h2 className="text-lg font-bold text-ash-text">Pool rules</h2>
            <p className="mt-1 text-sm font-normal leading-relaxed text-ash-muted">
              Three-stage flow, scoring from live pool settings, prizes, and tie-breaks.
            </p>
          </Link>
          <Link
            href={actions.poolCard.href}
            className="ash-surface-interactive block p-4"
          >
            <h2 className="text-lg font-bold text-ash-text">
              {actions.poolCard.title}
            </h2>
            <p className="mt-1 text-sm font-normal leading-relaxed text-ash-muted">
              {actions.poolCard.description}
            </p>
          </Link>
        </div>
      </PageContainer>
    </>
  );
}
