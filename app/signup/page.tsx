import Link from "next/link";
import { SignupForm } from "@/components/auth/SignupForm";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isAppAdmin } from "../../lib/auth/isAppAdmin";
import { safeRedirectPath } from "../../lib/auth/safeRedirectPath";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
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

  return (
    <PageContainer>
      <PageTitle
        title="Create account"
        description="Use the same email your organizer invited, if they mentioned one. After signing up, you can enter your join code on the next step."
      />
      <SignupForm redirectAfterSignup={redirectAfterSignup} />
      <p className="mt-4 text-center text-sm text-zinc-600">
        Already have an account?{" "}
        <Link
          href={`/login${sp.next ? `?next=${encodeURIComponent(sp.next)}` : ""}`}
          className="font-medium text-emerald-700 underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </PageContainer>
  );
}
