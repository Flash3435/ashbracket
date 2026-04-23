import { LoginForm } from "@/components/auth/LoginForm";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { canAccessAdminDashboard } from "@/lib/auth/permissions";
import { resolveNhlPostLoginDestination } from "@/lib/nhl/postLoginDestination";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function NhlLoginPage({
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
  const showEmailConfirmFailed = sp.error === "auth_confirm";
  const wantsNhlAdminDest = sp.next?.startsWith("/nhl/admin") ?? false;
  const postLoginHref =
    sp.next !== undefined && sp.next !== ""
      ? `/nhl/login/continue?next=${encodeURIComponent(sp.next)}`
      : "/nhl/login/continue";

  const signupHref =
    sp.next !== undefined && sp.next !== ""
      ? `/nhl/signup?next=${encodeURIComponent(sp.next)}`
      : "/nhl/signup";

  if (user) {
    const canAdmin = await canAccessAdminDashboard(supabase, user.id);
    const mustBlockNonAdmin = !canAdmin && (wantsNhlAdminDest || showForbidden);
    if (mustBlockNonAdmin) {
      return (
        <PageContainer>
          <PageTitle
            title="Sign in"
            description="Sign in for NHL pool invites, read-only previews, and account status on AshBracket."
          />
          <LoginForm
            postLoginHref={postLoginHref}
            signupHref={signupHref}
            blockedEmail={user.email ?? null}
            showForbiddenMessage={showForbidden}
            showEmailConfirmFailed={showEmailConfirmFailed}
            signOutRedirectTo="/nhl/login"
            blockedStateAccountHref="/nhl/account"
            isNhlSurface
          />
        </PageContainer>
      );
    }

    const resolved = await resolveNhlPostLoginDestination(
      supabase,
      user.id,
      sp.next,
    );
    if (resolved.kind === "redirect") {
      redirect(resolved.path);
    }
    if (resolved.kind === "blocked_admin") {
      return (
        <PageContainer>
          <PageTitle
            title="Sign in"
            description="Sign in for NHL pool invites, read-only previews, and account status on AshBracket."
          />
          <LoginForm
            postLoginHref={postLoginHref}
            signupHref={signupHref}
            blockedEmail={resolved.email}
            showForbiddenMessage={showForbidden}
            showEmailConfirmFailed={showEmailConfirmFailed}
            signOutRedirectTo="/nhl/login"
            blockedStateAccountHref="/nhl/account"
            isNhlSurface
          />
        </PageContainer>
      );
    }
  }

  return (
    <PageContainer>
      <PageTitle
        title="Sign in"
        description="Sign in for NHL pool invites, read-only previews, and account status on AshBracket."
      />
      <LoginForm
        postLoginHref={postLoginHref}
        signupHref={signupHref}
        showForbiddenMessage={showForbidden}
        showEmailConfirmFailed={showEmailConfirmFailed}
        signOutRedirectTo="/nhl/login"
        blockedStateAccountHref="/nhl/account"
        isNhlSurface
      />
    </PageContainer>
  );
}
