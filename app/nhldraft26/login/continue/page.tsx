import Link from "next/link";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { resolveNhlDraft26PostLoginDestination } from "@/lib/nhldraft26/postLoginDestination";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ next?: string }>;
};

export default async function NhlDraft26LoginContinuePage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const qs = sp.next ? `?next=${encodeURIComponent(sp.next)}` : "";
    redirect(`/nhldraft26/login${qs}`);
  }

  const result = await resolveNhlDraft26PostLoginDestination(
    supabase,
    user.id,
    sp.next,
  );

  if (result.kind === "redirect") {
    return redirect(result.path);
  }

  if (result.kind === "blocked_admin") {
    return (
      <PageContainer>
        <PageTitle
          title="Sign in"
          description="Sign in to enter and save your NHL Draft 2026 Pick'em board."
        />
        <div className="space-y-4">
          <p className="rounded-md border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
            That NHL Draft admin page is only available to AshBracket global admins.
          </p>
          <p className="rounded-md border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
            Signed in as{" "}
            <span className="font-medium text-amber-50">
              {result.email ?? "this account"}
            </span>
            . This account is not authorized for NHL Draft admin tools.
          </p>
          <div className="flex flex-wrap gap-2">
            <SignOutButton redirectTo="/nhldraft26/login" />
            <Link
              href="/nhldraft26/picks"
              className="btn-ghost inline-flex items-center px-3 py-1.5 text-sm"
            >
              My picks
            </Link>
          </div>
        </div>
      </PageContainer>
    );
  }

  return redirect("/nhldraft26/picks");
}
