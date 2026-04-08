import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { createClient } from "@/lib/supabase/server";
import { isGlobalAdmin } from "@/lib/auth/permissions";
import { fetchManagedPoolsForCurrentUser } from "@/lib/pools/fetchManagedPoolsForViewer";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login?next=/admin");
  }

  const { data: pools, error } =
    await fetchManagedPoolsForCurrentUser(supabase);
  const list = pools ?? [];

  const global = await isGlobalAdmin(supabase);

  if (!error && list.length === 1 && !global) {
    redirect(`/admin/pools/${list[0].id}`);
  }

  return (
    <PageContainer>
      <PageTitle
        title="Admin"
        description="Choose a pool to manage settings, participants, picks, email, and pool admins. Tournament-wide tools are below for global administrators."
      />

      {error ? (
        <p className="rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      ) : null}

      {!error && list.length === 0 ? (
        <p className="text-sm text-ash-muted">
          You do not have any pools yet. When a pool is created and you are
          assigned as an organizer, it will appear here.
        </p>
      ) : null}

      {!error && list.length > 1 ? (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-ash-text">Your pools</h2>
          <ul className="list-inside list-disc space-y-1 text-sm text-ash-muted">
            {list.map((p) => (
              <li key={p.id}>
                <Link
                  className="ash-link font-medium text-ash-text"
                  href={`/admin/pools/${p.id}`}
                >
                  {p.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {global ? (
        <section className="mt-10 border-t border-ash-border pt-8">
          <h2 className="text-sm font-semibold text-ash-text">
            Tournament (global)
          </h2>
          <p className="mt-1 text-sm text-ash-muted">
            Shared official data used by all pools. Only global administrators
            can edit these.
          </p>
          <ul className="mt-3 list-inside list-disc space-y-2 text-sm text-ash-muted">
            <li>
              <Link href="/admin/results" className="ash-link">
                Tournament results
              </Link>
              <span> — enter official bracket outcomes.</span>
            </li>
            <li>
              <Link href="/admin/tournament" className="ash-link">
                Tournament sync
              </Link>
              <span> — pull official match data.</span>
            </li>
            <li>
              <Link href="/admin/tournament/status" className="ash-link">
                Tournament status
              </Link>
              <span> — health check for data and scores.</span>
            </li>
          </ul>
        </section>
      ) : null}
    </PageContainer>
  );
}
