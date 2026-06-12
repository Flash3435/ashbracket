import { AuthRecoveryRedirect } from "@/components/auth/AuthRecoveryRedirect";
import { PicksDeadlineBannerFromPool } from "@/components/pool/PicksDeadlineBannerFromPool";
import { resolvePostLoginDestination } from "@/lib/auth/postLoginDestination";
import { resolvePublicRulesPoolId } from "@/lib/pool/resolvePublicRulesPoolId";
import { createClient } from "@/lib/supabase/server";
import { HomeHero } from "@/components/ui/HomeHero";
import { HomeMarketingSections } from "@/components/ui/HomeMarketingSections";
import { PageContainer } from "@/components/ui/PageContainer";
import { redirect } from "next/navigation";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const resolved = await resolvePostLoginDestination(
      supabase,
      user.id,
      undefined,
    );
    if (resolved.kind === "redirect") {
      redirect(resolved.path);
    }
  }

  const { poolId: publicPoolId } = await resolvePublicRulesPoolId(supabase);

  return (
    <>
      <Suspense fallback={null}>
        <AuthRecoveryRedirect />
      </Suspense>
      <HomeHero />
      <PageContainer compactBottom>
        <PicksDeadlineBannerFromPool poolId={publicPoolId} className="mb-6" />
        <HomeMarketingSections />
      </PageContainer>
    </>
  );
}
