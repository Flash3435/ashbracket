import { AuthRecoveryRedirect } from "@/components/auth/AuthRecoveryRedirect";
import { resolvePostLoginDestination } from "@/lib/auth/postLoginDestination";
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

  return (
    <>
      <Suspense fallback={null}>
        <AuthRecoveryRedirect />
      </Suspense>
      <HomeHero />
      <PageContainer compactBottom>
        <HomeMarketingSections />
      </PageContainer>
    </>
  );
}
