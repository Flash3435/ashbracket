import { JoinPoolForm } from "@/components/join/JoinPoolForm";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { createClient } from "@/lib/supabase/server";
import { SAMPLE_POOL_JOIN_CODE } from "../../lib/config/sample-pool";

export const dynamic = "force-dynamic";

function buildJoinPath(code: string | undefined) {
  const c = code?.trim();
  return c ? `/join?code=${encodeURIComponent(c)}` : "/join";
}

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const sp = await searchParams;
  const code = sp.code ?? "";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const joinPath = buildJoinPath(code);
  const loginHref = `/login?next=${encodeURIComponent(joinPath)}`;
  const signupHref = `/signup?next=${encodeURIComponent(joinPath)}`;

  return (
    <PageContainer>
      <PageTitle
        title="Join a pool"
        description={`Enter your join code, sign in, then create or claim your leaderboard name. Share link: /join?code=… (sample demo code: ${SAMPLE_POOL_JOIN_CODE}).`}
      />
      <JoinPoolForm
        initialCode={code}
        isSignedIn={!!user}
        loginHref={loginHref}
        signupHref={signupHref}
      />
    </PageContainer>
  );
}
