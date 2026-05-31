import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import Link from "next/link";

export default function ForgotPasswordPage() {
  return (
    <PageContainer>
      <PageTitle
        title="Forgot password"
        description="We will email you a secure link to set a new password."
      />
      <ForgotPasswordForm />
      <p className="text-center text-sm text-ash-muted">
        Remember your password?{" "}
        <Link href="/login" className="ash-link">
          Back to sign in
        </Link>
      </p>
    </PageContainer>
  );
}
