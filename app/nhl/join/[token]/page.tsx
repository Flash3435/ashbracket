import Link from "next/link";
import { NhlJoinInvitePanel } from "@/components/nhl/NhlJoinInvitePanel";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { peekNhlParticipationInviteWithClient } from "@/lib/nhl/join/invite";
import { safeNhlRedirectPath } from "@/lib/nhl/safeNhlRedirectPath";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function decodeToken(raw: string): string {
  let t = (raw ?? "").trim();
  try {
    t = decodeURIComponent(t);
  } catch {
    /* keep literal */
  }
  return t.trim();
}

export default async function NhlJoinByInviteTokenPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { token: rawParam } = await params;
  const sp = await searchParams;
  const token = decodeToken(rawParam);

  if (token.length < 16) {
    return (
      <PageContainer>
        <PageTitle
          title="Invalid NHL invite"
          description="This link is missing a valid invite token."
        />
        <p className="mt-4 text-sm text-slate-400">
          Ask your organizer for the full invite URL, or head to your{" "}
          <Link href="/nhl/account" className="ash-link font-medium">
            NHL account
          </Link>
          .
        </p>
      </PageContainer>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const peek = await peekNhlParticipationInviteWithClient(supabase, token);
  const joinPath = `/nhl/join/${encodeURIComponent(token)}`;
  const loginHref = `/nhl/login?next=${encodeURIComponent(safeNhlRedirectPath(sp.next, joinPath))}`;
  const signupHref = `/nhl/signup?invite=${encodeURIComponent(token)}&next=${encodeURIComponent(safeNhlRedirectPath(sp.next, joinPath))}`;
  const afterClaimRedirect = safeNhlRedirectPath(sp.next, "/nhl/account");

  return (
    <PageContainer>
      <PageTitle
        title={peek.ok ? `Join ${peek.editionName}` : "NHL invite"}
        description={
          peek.ok
            ? "This invite enters you in the global NHL playoff competition for this edition. Use your main AshBracket sign-in."
            : "We could not read this NHL invite. It may be invalid, expired, or already used."
        }
      />
      <NhlJoinInvitePanel
        inviteToken={token}
        initialPeek={peek}
        isSignedIn={!!user}
        loginHref={loginHref}
        signupHref={signupHref}
        afterClaimRedirect={afterClaimRedirect}
      />
    </PageContainer>
  );
}
