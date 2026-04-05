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
        <SignOutButton className="shrink-0 self-start rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 disabled:opacity-50" />
      </div>

      {admin ? (
        <p className="mb-4 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700">
          You have organizer access. Open{" "}
          <Link
            href="/admin"
            className="font-medium text-emerald-700 underline-offset-4 hover:underline"
          >
            Admin
          </Link>{" "}
          to manage the pool.
        </p>
      ) : null}

      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error.message}
        </p>
      ) : null}

      {!error && list.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-zinc-700">
            You are not linked to a pool yet. Use your join code to create or
            claim a profile.
          </p>
          <Link
            href="/join"
            className="mt-4 inline-flex rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-800"
          >
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
            className="inline-flex rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-800"
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
              className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm"
            >
              <p className="font-medium text-zinc-900">{p.display_name}</p>
              <p className="mt-1 text-xs text-zinc-500">
                Pool id <code className="rounded bg-zinc-100 px-1">{p.pool_id}</code>
                {p.pool_id === SAMPLE_POOL_ID ? " · sample pool" : null}
              </p>
              <div className="mt-3 flex flex-wrap gap-3 text-sm">
                <Link
                  href={`/participant/${p.id}`}
                  className="font-medium text-emerald-700 underline-offset-4 hover:underline"
                >
                  Public profile
                </Link>
                <Link
                  href={`/account/picks?participant=${p.id}`}
                  className="font-medium text-emerald-700 underline-offset-4 hover:underline"
                >
                  Edit picks
                </Link>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {sample ? (
        <p className="mt-6 text-sm text-zinc-500">
          <Link href="/" className="underline-offset-4 hover:underline">
            Home
          </Link>{" "}
          shows the sample pool leaderboard.
        </p>
      ) : null}
    </PageContainer>
  );
}
