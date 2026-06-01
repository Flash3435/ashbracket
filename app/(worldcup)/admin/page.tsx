import {
  AdminManagedPoolList,
  type AdminManagedPoolListItem,
} from "@/components/admin/AdminManagedPoolList";
import { GlobalAdminCreatePoolForm } from "@/components/admin/GlobalAdminCreatePoolForm";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { createClient } from "@/lib/supabase/server";
import { isGlobalAdmin } from "@/lib/auth/permissions";
import { fetchManagedPoolsForCurrentUser } from "@/lib/pools/fetchManagedPoolsForViewer";
import type { ManagedPoolRow } from "@/lib/pools/fetchManagedPoolsForViewer";
import { fetchParticipantCountsByPoolId } from "@/lib/pools/fetchParticipantCountsByPoolId";
import { sortManagedPoolsForAdminHome } from "@/lib/pools/sortManagedPoolsForAdminHome";
import {
  fetchUserDirectPoolInvolvement,
  splitManagedPoolsForAdminHome,
} from "@/lib/pools/splitManagedPoolsForAdminHome";
import Link from "next/link";
import { redirect } from "next/navigation";

function poolsWithParticipantCounts(
  pools: ManagedPoolRow[],
  countsByPoolId: Map<string, number>,
): AdminManagedPoolListItem[] {
  return pools.map((pool) => ({
    id: pool.id,
    name: pool.name,
    is_simulation: pool.is_simulation,
    participantCount: countsByPoolId.get(pool.id) ?? 0,
  }));
}

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

  const involvementResult = await fetchUserDirectPoolInvolvement(
    supabase,
    user.id,
  );
  const involvementError = involvementResult.error;
  const { directPools, otherAdminVisiblePools } = involvementResult.involvement
    ? splitManagedPoolsForAdminHome(
        list,
        user.id,
        involvementResult.involvement,
      )
    : { directPools: list, otherAdminVisiblePools: [] as typeof list };

  const poolIds = list.map((p) => p.id);
  const participantCountsResult = await fetchParticipantCountsByPoolId(
    supabase,
    poolIds,
  );
  const countsByPoolId = participantCountsResult.countsByPoolId;
  const participantCountError = participantCountsResult.error;

  const directPoolsForList = poolsWithParticipantCounts(
    sortManagedPoolsForAdminHome(directPools, countsByPoolId),
    countsByPoolId,
  );
  const otherPoolsForList = poolsWithParticipantCounts(
    sortManagedPoolsForAdminHome(otherAdminVisiblePools, countsByPoolId),
    countsByPoolId,
  );

  // Single-pool organizers go straight to the pool dashboard. Global admins
  // stay here so they can create additional pools and use tournament tools.
  if (!error && list.length === 1 && !global) {
    redirect(`/admin/pools/${list[0].id}`);
  }

  const showPoolSections = !error && list.length > 0;

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

      {involvementError ? (
        <p className="mb-4 rounded-md border border-amber-800/80 bg-amber-950/40 px-3 py-2 text-sm text-amber-200">
          Could not load your pool memberships ({involvementError}). Pool lists
          may be incomplete.
        </p>
      ) : null}

      {participantCountError ? (
        <p className="mb-4 rounded-md border border-amber-800/80 bg-amber-950/40 px-3 py-2 text-sm text-amber-200">
          Could not load participant counts ({participantCountError}). Counts
          shown as zero.
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

      {showPoolSections ? (
        <div className="space-y-8">
          <section>
            <h2 className="text-sm font-semibold text-ash-text">
              Pools you&apos;re part of
            </h2>
            <p className="mt-1 text-sm text-ash-muted">
              Pools you created, organize, or joined.
            </p>
            {directPools.length === 0 ? (
              <p className="mt-3 text-sm text-ash-muted">
                You haven&apos;t joined or created any pools yet.
              </p>
            ) : (
              <AdminManagedPoolList pools={directPoolsForList} />
            )}
          </section>

          {global && otherAdminVisiblePools.length > 0 ? (
            <section>
              <h2 className="text-sm font-semibold text-ash-text">
                Other pools you can administer
              </h2>
              <p className="mt-1 text-sm text-ash-muted">
                Visible because you are a site admin.
              </p>
              <AdminManagedPoolList pools={otherPoolsForList} />
            </section>
          ) : null}

          <p className="text-xs text-ash-muted">
            Participant count includes invited and manual participants.
          </p>
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
              <Link href="/admin/tournament" className="ash-link">
                Update today&apos;s scores
              </Link>
              <span> — once-daily live score and standings refresh.</span>
            </li>
            <li>
              <Link href="/admin/results" className="ash-link">
                Tournament results
              </Link>
              <span> — enter or correct official bracket outcomes.</span>
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
