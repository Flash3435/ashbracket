import Link from "next/link";
import { SignupForm } from "@/components/auth/SignupForm";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { buildNhlDraft26EmailConfirmRedirectUrl } from "@/lib/nhldraft26/nhlDraft26EmailConfirm";
import { safeNhlDraft26RedirectPath } from "@/lib/nhldraft26/safeNhlDraft26RedirectPath";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function NhlDraft26SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const redirectAfterSignup = safeNhlDraft26RedirectPath(sp.next, "/nhldraft26/picks");

  if (user) {
    redirect(redirectAfterSignup);
  }

  const resolvedLoginHref = sp.next
    ? `/nhldraft26/login?next=${encodeURIComponent(sp.next)}`
    : "/nhldraft26/login";

  const emailConfirmRedirectUrl = buildNhlDraft26EmailConfirmRedirectUrl(redirectAfterSignup);

  return (
    <PageContainer>
      <PageTitle
        title="Create your account"
        description="Sign up to enter the NHL Draft 2026 Pick'em. You will use the same AshBracket sign-in across isolated game sections."
      />
      <SignupForm
        redirectAfterSignup={redirectAfterSignup}
        emailConfirmRedirectUrl={emailConfirmRedirectUrl}
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
