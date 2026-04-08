import { AdminLoginForm } from "@/components/auth/AdminLoginForm";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { canAccessAdminDashboard } from "../../lib/auth/permissions";
import { safeRedirectPath } from "../../lib/auth/safeRedirectPath";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const showForbidden = sp.error === "forbidden";
  const wantsAdminDest = sp.next?.startsWith("/admin") ?? false;
  const redirectAfterLogin = safeRedirectPath(
    sp.next,
    wantsAdminDest ? "/admin" : "/account",
  );

  let blockedEmail: string | null = null;
  if (user) {
    const canAdmin = await canAccessAdminDashboard(supabase, user.id);
    if (canAdmin) {
      redirect(redirectAfterLogin);
    }
    if (wantsAdminDest) {
      blockedEmail = user.email ?? null;
    } else {
      redirect(redirectAfterLogin);
    }
  }

  const variant = wantsAdminDest ? "organizer" : "participant";

  return (
    <PageContainer>
      <PageTitle
        title={variant === "organizer" ? "Organizer sign in" : "Sign in"}
        description={
          variant === "organizer"
            ? "Access the admin dashboard for pool setup, participants, and scoring."
            : "Sign in with your pool account. You can join a pool next or open your profile."
        }
      />
      <AdminLoginForm
        redirectAfterLogin={redirectAfterLogin}
        signupHref={`/signup?next=${encodeURIComponent(redirectAfterLogin)}`}
        blockedEmail={blockedEmail}
        showForbiddenMessage={showForbidden}
        variant={variant}
      />
    </PageContainer>
  );
}
