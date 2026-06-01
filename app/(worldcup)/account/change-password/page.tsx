import { ChangePasswordForm } from "@/components/auth/ChangePasswordForm";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { CHANGE_PASSWORD_NO_EMAIL_MESSAGE } from "@/lib/auth/changePassword";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ChangePasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/account/change-password");
  }

  const email = user.email?.trim() ?? "";

  return (
    <PageContainer>
      <PageTitle
        title="Change password"
        description={
          email
            ? `Update the password for ${email}.`
            : "Update your AshBracket account password."
        }
      />

      <p className="mb-6 text-sm">
        <Link href="/account" className="ash-link">
          Back to my bracket
        </Link>
      </p>

      {email ? (
        <ChangePasswordForm userEmail={email} />
      ) : (
        <div className="ash-surface max-w-lg p-6">
          <p className="text-sm text-amber-200" role="alert">
            {CHANGE_PASSWORD_NO_EMAIL_MESSAGE}
          </p>
          <p className="mt-4 text-sm">
            <Link href="/account" className="ash-link">
              Back to my bracket
            </Link>
          </p>
        </div>
      )}
    </PageContainer>
  );
}
