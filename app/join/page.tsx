import { JoinPoolForm } from "@/components/join/JoinPoolForm";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { createClient } from "@/lib/supabase/server";
import { SAMPLE_POOL_JOIN_CODE } from "../../lib/config/sample-pool";

export const dynamic = "force-dynamic";

function buildJoinPath(code: string | undefined, invite: string | undefined) {
  const params = new URLSearchParams();
  const c = code?.trim();
  const inv = invite?.trim();
  if (c) params.set("code", c);
  if (inv) params.set("invite", inv);
  const qs = params.toString();
  return qs ? `/join?${qs}` : "/join";
}

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; invite?: string }>;
}) {
  const sp = await searchParams;
  const code = sp.code ?? "";
  const invite = sp.invite ?? "";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const joinPath = buildJoinPath(code, invite);
  const loginHref = `/login?next=${encodeURIComponent(joinPath)}`;
  const signupHref = `/signup?next=${encodeURIComponent(joinPath)}`;

  const inviteMode = Boolean(invite.trim());

  return (
    <PageContainer>
      <PageTitle
        title="Join a pool"
        description={
          inviteMode
            ? "You have a personal invite. Sign in with the same email your organizer used, then accept the invite to open your bracket."
            : `Enter your join code, sign in, then create or claim your leaderboard name. Share link: /join?code=… (sample demo code: ${SAMPLE_POOL_JOIN_CODE}).`
        }
      />
      <JoinPoolForm
        initialCode={code}
        initialInvite={invite}
        isSignedIn={!!user}
        loginHref={loginHref}
        signupHref={signupHref}
      />
    </PageContainer>
  );
}
