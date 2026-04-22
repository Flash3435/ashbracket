import { JoinPoolForm } from "@/components/join/JoinPoolForm";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { peekJoinablePool } from "@/lib/join/actions";
import { validateJoinCodeFormat } from "@/lib/pools/joinCodeFormat";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function joinPathForCode(canonicalCode: string): string {
  return `/join/${encodeURIComponent(canonicalCode)}`;
}

export default async function JoinByCodePage({
  params,
}: {
  params: Promise<{ joinCode: string }>;
}) {
  const { joinCode: rawParam } = await params;
  let decoded = (rawParam ?? "").trim();
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    /* invalid % sequences — treat as literal */
  }
  decoded = decoded.trim();
  const fmt = validateJoinCodeFormat(decoded);

  if (!fmt.ok || !fmt.normalized) {
    return (
      <PageContainer>
        <PageTitle
          title="Invalid invite link"
          description={
            fmt.ok
              ? "This URL is missing a pool join code. Ask your organizer for the full link."
              : fmt.error
          }
        />
      </PageContainer>
    );
  }

  const code = fmt.normalized;
  const peek = await peekJoinablePool(code);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const joinPath = joinPathForCode(code);
  const loginHref = `/login?next=${encodeURIComponent(joinPath)}`;
  const signupHref = `/signup?next=${encodeURIComponent(joinPath)}`;

  return (
    <PageContainer>
      <PageTitle
        title={
          peek.ok
            ? `Join ${peek.poolName}`
            : "Join a pool on AshBracket"
        }
        description={
          peek.ok
            ? "You’re invited to join this World Cup pool. Sign in or create a free account, then choose how you appear on the leaderboard."
            : "This link uses a pool join code. If the code is wrong or the pool is not open for self-join, your organizer can send an updated link or add you by email."
        }
      />
      <JoinPoolForm
        initialCode={code}
        initialInvite=""
        isSignedIn={!!user}
        loginHref={loginHref}
        signupHref={signupHref}
        lockJoinCode
        afterSuccessfulJoin="picks"
        joinCodePeek={peek}
      />
    </PageContainer>
  );
}
