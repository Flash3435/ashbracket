import Link from "next/link";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isAppAdmin } from "../../lib/auth/isAppAdmin";
import { SAMPLE_POOL_ID } from "../../lib/config/sample-pool";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/account");
  }

  const admin = await isAppAdmin(supabase, user.id);

  const { data: rows, error } = await supabase
    .from("participants")
    .select("id, display_name, pool_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  const list = rows ?? [];
  const sample = list.find((p) => p.pool_id === SAMPLE_POOL_ID);

  return (
    <PageContainer>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageTitle
          title="Your account"
          description={
            user.email
              ? `Signed in as ${user.email}. Use Edit picks to update your bracket.`
              : "Your pool profiles are listed below."
          }
        />
        <SignOutButton className="btn-ghost shrink-0 self-start text-sm disabled:opacity-50" />
      </div>

      {admin ? (
        <p className="mb-4 rounded-md border border-ash-border bg-ash-surface px-3 py-2 text-sm text-ash-muted">
          You have organizer access. Open{" "}
          <Link href="/admin" className="ash-link">
            Admin
          </Link>{" "}
          to manage the pool.
        </p>
      ) : null}

      {error ? (
        <p className="text-sm text-red-300" role="alert">
          {error.message}
        </p>
      ) : null}

      {!error && list.length === 0 ? (
        <div className="ash-surface p-6">
          <p className="text-sm text-ash-muted">
            You are not linked to a pool yet. Use your join code to create or
            claim a profile.
          </p>
          <Link href="/join" className="btn-primary mt-4 inline-flex">
            Join a pool
          </Link>
        </div>
      ) : null}

      {!error && list.length > 0 ? (
        <div className="mb-4">
          <Link
            href={
              list.length === 1
                ? `/account/picks?participant=${list[0].id}`
                : "/account/picks"
            }
            className="btn-primary inline-flex"
          >
            {list.length === 1 ? "Enter your picks" : "Your picks"}
          </Link>
        </div>
      ) : null}

      {!error && list.length > 0 ? (
        <ul className="space-y-3">
          {list.map((p) => (
            <li
              key={p.id}
              className="ash-surface p-4"
            >
              <p className="font-medium text-ash-text">{p.display_name}</p>
              <p className="mt-1 text-xs text-ash-muted">
                Pool id{" "}
                <code className="rounded bg-ash-body px-1 text-ash-text">{p.pool_id}</code>
                {p.pool_id === SAMPLE_POOL_ID ? " · sample pool" : null}
              </p>
              <div className="mt-3 flex flex-wrap gap-3 text-sm">
                <Link
                  href={`/participant/${p.id}`}
                  className="ash-link"
                >
                  Public profile
                </Link>
                <Link href={`/account/picks?participant=${p.id}`} className="ash-link">
                  Edit picks
                </Link>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {sample ? (
        <p className="mt-6 text-sm text-ash-muted">
          <Link href="/" className="ash-link">
            Home
          </Link>{" "}
          shows the sample pool leaderboard.
        </p>
      ) : null}
    </PageContainer>
  );
}
