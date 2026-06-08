import Link from "next/link";
import { SignupForm } from "@/components/auth/SignupForm";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { buildNhlEmailConfirmRedirectUrl } from "@/lib/nhl/nhlEmailConfirm";
import { claimNhlParticipationInvite } from "@/lib/nhl/join/actions";
import { peekNhlParticipationInviteWithClient } from "@/lib/nhl/join/invite";
import { safeNhlRedirectPath } from "@/lib/nhl/safeNhlRedirectPath";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function NhlSignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; invite?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const redirectAfterSignup = safeNhlRedirectPath(sp.next, "/nhl/account");

  if (user) {
    redirect(redirectAfterSignup);
  }

  const inviteParam = sp.invite?.trim() ?? "";
  let inviteContext: { token: string; email: string } | null = null;
  let inviteBanner: string | null = null;

  if (inviteParam.length >= 16) {
    const peek = await peekNhlParticipationInviteWithClient(supabase, inviteParam);
    if (peek.ok && peek.alreadyClaimed) {
      inviteBanner =
        "This NHL invite was already accepted. Sign in with the same account to open your NHL hub.";
    } else if (!peek.ok) {
      inviteBanner = peek.message;
    } else if (peek.invitedEmail) {
      inviteContext = { token: inviteParam, email: peek.invitedEmail };
    }
  }

  const joinPath =
    inviteParam.length >= 16
      ? `/nhl/join/${encodeURIComponent(inviteParam)}`
      : redirectAfterSignup;

  const resolvedLoginHref = sp.next
    ? `/nhl/login?next=${encodeURIComponent(sp.next)}`
    : inviteParam
      ? `/nhl/login?next=${encodeURIComponent(joinPath)}`
      : "/nhl/login";

  const emailConfirmRedirectUrl = buildNhlEmailConfirmRedirectUrl(redirectAfterSignup);
  const postInviteClaimPath = safeNhlRedirectPath(sp.next, "/nhl/account");

  return (
    <PageContainer>
      <PageTitle
        title={inviteContext ? "Finish your NHL invite" : "Create your NHL playoff account"}
        description={
          inviteContext
            ? "Use the invited email and a password to join this NHL playoff pool."
            : "Create your NHL playoff account. You will use the same AshBracket sign-in everywhere on the site."
        }
      />
      {inviteBanner ? (
        <p className="mb-4 rounded-md border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
          {inviteBanner}
        </p>
      ) : null}
      <SignupForm
        redirectAfterSignup={redirectAfterSignup}
        emailConfirmRedirectUrl={emailConfirmRedirectUrl}
        inviteContext={inviteContext}
        loginHref={resolvedLoginHref}
        claimInvite={inviteContext ? claimNhlParticipationInvite : undefined}
        postInviteClaimPath={inviteContext ? postInviteClaimPath : undefined}
      />
      <p className="mt-4 text-center text-sm text-ash-muted">
        Already have an account?{" "}
        <Link href={resolvedLoginHref} className="ash-link">
          Sign in
        </Link>
      </p>
    </PageContainer>
  );
}
