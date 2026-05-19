import { GlobalAdminCreatePoolForm } from "@/components/admin/GlobalAdminCreatePoolForm";
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

  // Single-pool organizers go straight to the pool dashboard. Global admins
  // stay here so they can create additional pools and use tournament tools.
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

      {global ? (
        <section className="mb-8">
          <GlobalAdminCreatePoolForm />
        </section>
      ) : null}

      {!error && list.length === 0 && !global ? (
        <div className="space-y-3 rounded-lg border border-ash-border bg-ash-body/40 p-4 text-sm text-ash-muted">
          <p className="text-ash-text">This area is for pool organizers.</p>
          <p>
            Want to run your own pool? You can create one from your account —
            you&apos;ll become the organizer and can open pool settings, invite
            participants, and manage admins for that pool only.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/account/pools/new"
              className="btn-primary inline-flex text-sm"
            >
              Create your own pool
            </Link>
            <Link
              href="/account"
              className="btn-ghost inline-flex text-sm ring-1 ring-ash-border"
            >
              My account
            </Link>
          </div>
        </div>
      ) : null}

      {!error && list.length > 0 ? (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-ash-text">
            {list.length === 1 ? "Your pool" : "Your pools"}
          </h2>
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
            <li>
              <Link href="/admin/pilot" className="ash-link text-emerald-200/90">
                Production pilot checklist
              </Link>
              <span> — verify environment, snapshots, and live pool isolation.</span>
            </li>
            <li>
              <Link href="/admin/simulation" className="ash-link text-amber-200/90">
                Simulation testing
              </Link>
              <span>
                {" "}
                — isolated test pools and fake results (does not affect live
                pools).
              </span>
            </li>
          </ul>
        </section>
      ) : null}
    </PageContainer>
  );
}
