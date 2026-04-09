import Link from "next/link";
import { SignupForm } from "@/components/auth/SignupForm";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { canAccessAdminDashboard } from "../../../lib/auth/permissions";
import { buildEmailConfirmRedirectUrl } from "../../../lib/auth/buildEmailConfirmRedirectUrl";
import { safeRedirectPath } from "../../../lib/auth/safeRedirectPath";

export const dynamic = "force-dynamic";

export default async function OrganizerSignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const redirectAfterSignup = safeRedirectPath(sp.next, "/admin");
  const loginHref = `/login?next=${encodeURIComponent(redirectAfterSignup)}`;

  if (user) {
    const canAdmin = await canAccessAdminDashboard(supabase, user.id);
    if (canAdmin) {
      redirect(redirectAfterSignup);
    }
    redirect("/account");
  }

  const emailConfirmRedirectUrl = buildEmailConfirmRedirectUrl(redirectAfterSignup);

  return (
    <PageContainer>
      <PageTitle
        title="Create your organizer account"
        description="Set up your pool, invite participants, and manage your World Cup pool in one place."
      />
      <SignupForm
        redirectAfterSignup={redirectAfterSignup}
        emailConfirmRedirectUrl={emailConfirmRedirectUrl}
        loginHref={loginHref}
        requirePasswordConfirmation
      />
      <p className="mt-4 text-center text-sm text-ash-muted">
        Already have an account?{" "}
        <Link href={loginHref} className="ash-link">
          Sign in
        </Link>
      </p>
    </PageContainer>
  );
}
