import Link from "next/link";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { resolveNhlPostLoginDestination } from "@/lib/nhl/postLoginDestination";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ next?: string }>;
};

export default async function NhlLoginContinuePage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const qs = sp.next ? `?next=${encodeURIComponent(sp.next)}` : "";
    redirect(`/nhl/login${qs}`);
  }

  const result = await resolveNhlPostLoginDestination(
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
          description="Sign in to access NHL playoff picks."
        />
        <div className="space-y-4">
          <p className="rounded-md border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
            That NHL admin page is only available to AshBracket global admins.
          </p>
          <p className="rounded-md border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
            Signed in as{" "}
            <span className="font-medium text-amber-50">
              {result.email ?? "this account"}
            </span>
            . This account is not authorized for NHL admin tools.
          </p>
          <div className="flex flex-wrap gap-2">
            <SignOutButton redirectTo="/nhl/login" />
            <Link
              href="/nhl/account"
              className="btn-ghost inline-flex items-center px-3 py-1.5 text-sm"
            >
              NHL account
            </Link>
          </div>
        </div>
      </PageContainer>
    );
  }
}
