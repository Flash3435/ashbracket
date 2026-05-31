import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import Link from "next/link";
import { Suspense } from "react";

export default function ResetPasswordPage() {
  return (
    <PageContainer>
      <PageTitle
        title="Set a new password"
        description="Use the link from your reset email to choose a new password."
      />
      <Suspense
        fallback={
          <div className="ash-surface p-6 text-sm text-ash-muted">
            Loading…
          </div>
        }
      >
        <ResetPasswordForm />
      </Suspense>
      <p className="text-center text-sm text-ash-muted">
        <Link href="/forgot-password" className="ash-link">
          Request another reset link
        </Link>
        {" · "}
        <Link href="/login" className="ash-link">
          Sign in
        </Link>
      </p>
    </PageContainer>
  );
}
