import { LoginForm } from "@/components/auth/LoginForm";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { resolvePostLoginDestination } from "@/lib/auth/postLoginDestination";
import { canAccessAdminDashboard } from "../../lib/auth/permissions";

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
  const showEmailConfirmFailed = sp.error === "auth_confirm";
  const wantsAdminDest = sp.next?.startsWith("/admin") ?? false;
  const postLoginHref =
    sp.next !== undefined && sp.next !== ""
      ? `/login/continue?next=${encodeURIComponent(sp.next)}`
      : "/login/continue";

  const signupHref =
    sp.next !== undefined && sp.next !== ""
      ? `/signup?next=${encodeURIComponent(sp.next)}`
      : "/signup";

  if (user) {
    const canAdmin = await canAccessAdminDashboard(supabase, user.id);
    const mustBlockNonAdmin =
      !canAdmin && (wantsAdminDest || showForbidden);
    if (mustBlockNonAdmin) {
      return (
        <PageContainer>
          <PageTitle
            title="Sign in"
            description="Access your AshBracket account."
          />
          <LoginForm
            postLoginHref={postLoginHref}
            signupHref={signupHref}
            blockedEmail={user.email ?? null}
            showForbiddenMessage={showForbidden}
            showEmailConfirmFailed={showEmailConfirmFailed}
          />
        </PageContainer>
      );
    }

    const resolved = await resolvePostLoginDestination(
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
            description="Access your AshBracket account."
          />
          <LoginForm
            postLoginHref={postLoginHref}
            signupHref={signupHref}
            blockedEmail={resolved.email}
            showForbiddenMessage={showForbidden}
            showEmailConfirmFailed={showEmailConfirmFailed}
          />
        </PageContainer>
      );
    }
    redirect("/login/continue");
  }

  return (
    <PageContainer>
      <PageTitle
        title="Sign in"
        description="Access your AshBracket account."
      />
      <LoginForm
        postLoginHref={postLoginHref}
        signupHref={signupHref}
        showForbiddenMessage={showForbidden}
        showEmailConfirmFailed={showEmailConfirmFailed}
      />
    </PageContainer>
  );
}
