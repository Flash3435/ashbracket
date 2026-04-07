import Link from "next/link";
import { SignupForm } from "@/components/auth/SignupForm";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isAppAdmin } from "../../lib/auth/isAppAdmin";
import { safeRedirectPath } from "../../lib/auth/safeRedirectPath";
import { peekParticipantInvite } from "../../lib/join/actions";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; invite?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const wantsAdminDest = sp.next?.startsWith("/admin") ?? false;
  const redirectAfterSignup = safeRedirectPath(
    sp.next,
    wantsAdminDest ? "/admin" : "/join",
  );

  if (user) {
    const admin = await isAppAdmin(supabase, user.id);
    if (admin) {
      redirect(redirectAfterSignup);
    }
    redirect(safeRedirectPath(sp.next, "/account"));
  }

  if (wantsAdminDest) {
    redirect("/login?next=/admin");
  }

  const inviteParam = sp.invite?.trim() ?? "";
  let inviteContext: { token: string; email: string } | null = null;
  if (inviteParam.length >= 16) {
    const peek = await peekParticipantInvite(inviteParam);
    if (peek.ok && peek.invitedEmail) {
      inviteContext = { token: inviteParam, email: peek.invitedEmail };
    }
  }

  const resolvedLoginHref = sp.next
    ? `/login?next=${encodeURIComponent(sp.next)}`
    : inviteParam
      ? `/login?next=${encodeURIComponent(`/join?invite=${encodeURIComponent(inviteParam)}`)}`
      : "/login";

  return (
    <PageContainer>
      <PageTitle
        title={inviteContext ? "Finish setting up your account" : "Create account"}
        description={
          inviteContext
            ? "Choose a password for the account your organizer invited. After this step we will open your bracket."
            : "Use the same email your organizer invited, if they mentioned one. After signing up, you can enter your join code on the next step."
        }
      />
      <SignupForm
        redirectAfterSignup={redirectAfterSignup}
        inviteContext={inviteContext}
        loginHref={resolvedLoginHref}
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
