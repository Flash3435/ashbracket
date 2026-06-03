import { LoginForm } from "@/components/auth/LoginForm";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { canAccessAdminDashboard } from "@/lib/auth/permissions";
import { resolveNhlDraft26PostLoginDestination } from "@/lib/nhldraft26/postLoginDestination";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function NhlDraft26LoginPage({
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
  const wantsAdminDest = sp.next?.startsWith("/nhldraft26/admin") ?? false;
  const postLoginHref =
    sp.next !== undefined && sp.next !== ""
      ? `/nhldraft26/login/continue?next=${encodeURIComponent(sp.next)}`
      : "/nhldraft26/login/continue";

  const signupHref =
    sp.next !== undefined && sp.next !== ""
      ? `/nhldraft26/signup?next=${encodeURIComponent(sp.next)}`
      : "/nhldraft26/signup";

  if (user) {
    const canAdmin = await canAccessAdminDashboard(supabase, user.id);
    const mustBlockNonAdmin = !canAdmin && (wantsAdminDest || showForbidden);
    if (mustBlockNonAdmin) {
      return (
        <PageContainer>
          <PageTitle
            title="Sign in"
            description="Sign in to enter and save your NHL Draft 2026 Pick'em board."
          />
          <LoginForm
            postLoginHref={postLoginHref}
            signupHref={signupHref}
            blockedEmail={user.email ?? null}
            showForbiddenMessage={showForbidden}
            showEmailConfirmFailed={showEmailConfirmFailed}
            signOutRedirectTo="/nhldraft26/login"
            blockedStateAccountHref="/nhldraft26/picks"
            isNhlDraft26Surface
          />
        </PageContainer>
      );
    }

    const resolved = await resolveNhlDraft26PostLoginDestination(
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
            description="Sign in to enter and save your NHL Draft 2026 Pick'em board."
          />
          <LoginForm
            postLoginHref={postLoginHref}
            signupHref={signupHref}
            blockedEmail={resolved.email}
            showForbiddenMessage={showForbidden}
            showEmailConfirmFailed={showEmailConfirmFailed}
            signOutRedirectTo="/nhldraft26/login"
            blockedStateAccountHref="/nhldraft26/picks"
            isNhlDraft26Surface
          />
        </PageContainer>
      );
    }
  }

  return (
    <PageContainer>
      <PageTitle
        title="Sign in"
        description="Sign in to enter and save your NHL Draft 2026 Pick'em board."
      />
      <LoginForm
        postLoginHref={postLoginHref}
        signupHref={signupHref}
        showForbiddenMessage={showForbidden}
        showEmailConfirmFailed={showEmailConfirmFailed}
        signOutRedirectTo="/nhldraft26/login"
        blockedStateAccountHref="/nhldraft26/picks"
        isNhlDraft26Surface
      />
    </PageContainer>
  );
}
