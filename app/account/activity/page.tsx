import { AccountPicksProfileLinks } from "@/components/account/AccountPicksProfileLinks";
import { PoolActivityFeed } from "@/components/poolActivity/PoolActivityFeed";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { createClient } from "@/lib/supabase/server";
import { loadAccountKnockoutSelection } from "../../../lib/account/loadAccountKnockoutSelection";
import { loadPoolActivityForViewer } from "../../../lib/poolActivity/loadPoolActivityForViewer";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ participant?: string }>;
};

export default async function AccountActivityPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/account/activity");
  }

  const participantParam = sp.participant?.trim() ?? "";
  const ctx = await loadAccountKnockoutSelection(user.id, participantParam);

  let feedError: string | null = null;
  let items: Awaited<ReturnType<typeof loadPoolActivityForViewer>> = [];
  const selectedPoolId = ctx.selectedId
    ? ctx.myParticipants.find((p) => p.id === ctx.selectedId)?.pool_id
    : null;

  if (ctx.selectedId && selectedPoolId && !ctx.loadError) {
    try {
      items = await loadPoolActivityForViewer(supabase, selectedPoolId, {
        ensureDailyRecap: true,
        limit: 20,
      });
    } catch (e) {
      feedError =
        e instanceof Error ? e.message : "Could not load pool activity.";
    }
  }

  return (
    <PageContainer>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link href="/account" className="ash-link text-sm">
          ← Dashboard
        </Link>
        {ctx.selectedId && !ctx.loadError ? (
          <>
            <span className="text-ash-border" aria-hidden>
              |
            </span>
            <Link
              href={`/account/picks?participant=${ctx.selectedId}`}
              className="ash-link text-sm"
            >
              Edit picks
            </Link>
          </>
        ) : null}
      </div>

      <PageTitle
        title="Activity"
        description="A read-only timeline for your pool: joins, pick milestones, and one Ash recap per day."
      />

      {ctx.loadError ? (
        <p
          className="mb-4 rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200"
          role="alert"
        >
          {ctx.loadError}
        </p>
      ) : null}

      {ctx.invalidQuery ? (
        <p
          className="mb-4 rounded-md border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-100"
          role="alert"
        >
          The profile id in the URL is not a valid UUID.
        </p>
      ) : null}

      {ctx.invalidOtherProfile ? (
        <p
          className="mb-4 rounded-md border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-100"
          role="alert"
        >
          That profile is not linked to your account. Choose one of your profiles
          below.
        </p>
      ) : null}

      {!ctx.loadError && ctx.myParticipants.length === 0 ? (
        <div className="ash-surface p-6">
          <p className="text-sm text-ash-muted">
            You do not have a pool profile yet. Join a pool to see activity here.
          </p>
          <Link href="/join" className="btn-primary mt-4 inline-flex">
            Join a pool
          </Link>
        </div>
      ) : null}

      {!ctx.loadError && ctx.myParticipants.length > 0 ? (
        <>
          <AccountPicksProfileLinks
            profiles={ctx.profileLinkItems}
            selectedId={ctx.selectedId}
            summaryBasePath="/account/picks/summary"
            activityBasePath="/account/activity"
          />

          {!ctx.selectedId && ctx.myParticipants.length > 1 ? (
            <p className="text-sm text-ash-muted">
              Select which pool profile you want to view activity for.
            </p>
          ) : null}

          {ctx.selectedId && selectedPoolId ? (
            <>
              <p className="mb-4 text-sm text-ash-muted">
                Pool:{" "}
                <span className="font-medium text-ash-text">
                  {ctx.selectedPoolName}
                </span>
              </p>
              {feedError ? (
                <p
                  className="mb-4 rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200"
                  role="alert"
                >
                  {feedError}
                </p>
              ) : (
                <PoolActivityFeed items={items} />
              )}
            </>
          ) : null}
        </>
      ) : null}
    </PageContainer>
  );
}
