import Link from "next/link";
import { PublicLeaderboard } from "@/components/leaderboard/PublicLeaderboard";
import { PoolPublicStatsSummary } from "@/components/pool/PoolPublicStatsSummary";
import { HomeHero } from "@/components/ui/HomeHero";
import { PageContainer } from "@/components/ui/PageContainer";
import { fetchSamplePoolLeaderboard } from "../lib/leaderboard/fetchSamplePoolLeaderboard";
import { fetchSamplePoolPublicStats } from "../lib/pool/fetchSamplePoolPublicStats";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { sections, error } = await fetchSamplePoolLeaderboard();
  const { stats, poolLabel, error: statsError } =
    await fetchSamplePoolPublicStats();

  return (
    <>
      <HomeHero />
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

        <div className="grid gap-4 sm:grid-cols-2">
          <Link href="/rules" className="ash-surface-interactive block p-4">
            <h2 className="text-lg font-bold text-ash-text">Pool rules</h2>
            <p className="mt-1 text-sm font-normal leading-relaxed text-ash-muted">
              Scoring, deadlines, and tie-breakers for your pool.
            </p>
          </Link>
          <Link href="/join" className="ash-surface-interactive block p-4">
            <h2 className="text-lg font-bold text-ash-text">Join the pool</h2>
            <p className="mt-1 text-sm font-normal leading-relaxed text-ash-muted">
              Create an account, enter your join code, and link your leaderboard
              name.
            </p>
          </Link>
        </div>
      </PageContainer>
    </>
  );
}
