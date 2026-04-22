import Link from "next/link";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { resolvePostLoginDestination } from "@/lib/auth/postLoginDestination";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ next?: string }>;
};

export default async function LoginContinuePage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const qs = sp.next
      ? `?next=${encodeURIComponent(sp.next)}`
      : "";
    redirect(`/login${qs}`);
  }

  const result = await resolvePostLoginDestination(
    supabase,
    user.id,
    sp.next,
  );

  if (result.kind === "redirect") {
    redirect(result.path);
  }

  if (result.kind === "blocked_admin") {
    return (
      <PageContainer>
        <PageTitle
          title="Sign in"
          description="Access your AshBracket account."
        />
        <div className="space-y-4">
          <p className="rounded-md border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
            That page is only available to pool organizers (admin accounts).
          </p>
          <p className="rounded-md border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
            Signed in as{" "}
            <span className="font-medium text-amber-50">
              {result.email ?? "this account"}
            </span>
            . This account is not authorized for the admin area. Sign out and
            use an organizer account, or ask an owner to add you in{" "}
            <code className="rounded bg-amber-950/60 px-1 text-amber-100">
              pool_admins
            </code>{" "}
            or{" "}
            <code className="rounded bg-amber-950/60 px-1 text-amber-100">
              app_admins
            </code>
            .
          </p>
          <div className="flex flex-wrap gap-2">
            <SignOutButton redirectTo="/login" />
            <Link
              href="/account"
              className="btn-ghost inline-flex items-center px-3 py-1.5 text-sm"
            >
              My account
            </Link>
          </div>
        </div>
      </PageContainer>
    );
  }
}
