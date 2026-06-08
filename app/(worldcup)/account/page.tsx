import Link from "next/link";
import { AccountNextMatchesSection } from "@/components/account/AccountNextMatchesSection";
import { AccountPicksProfileLinks } from "@/components/account/AccountPicksProfileLinks";
import { ParticipantBracketView } from "@/components/bracket/ParticipantBracketView";
import { MyKnockoutPicksSummary } from "@/components/picks/MyKnockoutPicksSummary";
import { PicksViewToggle } from "@/components/picks/PicksViewToggle";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  loadAccountKnockoutSelection,
  poolLocked,
} from "../../../lib/account/loadAccountKnockoutSelection";
import { resolveAccountParticipantId } from "../../../lib/account/resolveAccountParticipantId";
import {
  countryCodesFromKnockoutSlots,
  nextMatchesForTeamCountryCodes,
} from "../../../lib/participant/nextMatchesForPickedTeams";
import { fetchPublicTournamentProgress } from "../../../lib/tournament/fetchPublicTournamentProgress";
import type { TournamentMatchPublicRow } from "../../../types/tournamentPublic";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ participant?: string; view?: string }>;
};

export default async function AccountPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const view = sp.view === "bracket" ? "bracket" : "list";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/account");
  }

  const { data: orgAdminRows, error: orgErr } = await supabase
    .from("pool_admins")
    .select("pools (id, name, join_code)")
    .eq("user_id", user.id);

  const organizedPools = (
    (orgAdminRows as { pools: { id: string; name: string; join_code: string | null } | null }[] | null) ??
    []
  )
    .map((r) => r.pools)
    .filter(
      (p): p is { id: string; name: string; join_code: string | null } =>
        p != null,
    );

  const { data: rows, error } = await supabase
    .from("participants")
    .select("id, display_name, pool_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  const list = rows ?? [];

  const preferredParticipantId = resolveAccountParticipantId(
    list,
    sp.participant,
  );

  const picksCtx =
    !error && list.length > 0 && preferredParticipantId
      ? await loadAccountKnockoutSelection(user.id, preferredParticipantId)
      : null;

  let accountNextMatches: TournamentMatchPublicRow[] = [];
  let accountTournamentErr: string | null = null;

  if (picksCtx && !picksCtx.loadError && picksCtx.initialSlots.length > 0) {
    const teamById = new Map(picksCtx.teams.map((t) => [t.id, t]));
    const codes = countryCodesFromKnockoutSlots(
      picksCtx.initialSlots,
      teamById,
    );
    const { data: tp, error: te } = await fetchPublicTournamentProgress();
    accountTournamentErr = te;
    if (tp?.matches && !te) {
      accountNextMatches = nextMatchesForTeamCountryCodes(
        tp.matches,
        codes,
        8,
      );
    }
  }

  const locked = picksCtx ? poolLocked(picksCtx.selectedLockAt) : false;
  const lockHint =
    picksCtx && locked && picksCtx.selectedLockAt
      ? `Group stage, third-place advancers, and bonus picks locked ${new Intl.DateTimeFormat(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(picksCtx.selectedLockAt))}. Knockout bracket may still be editable after the official Round of 32 is published.`
      : picksCtx && locked
        ? "Pre‑knockout picks are locked; knockout bracket may still be open."
        : null;

  const picksHref =
    list.length === 1
      ? `/account/picks?participant=${list[0].id}`
      : "/account/picks";

  const dashListQs = new URLSearchParams();
  if (picksCtx?.selectedId) dashListQs.set("participant", picksCtx.selectedId);
  const dashBracketQs = new URLSearchParams(dashListQs);
  dashBracketQs.set("view", "bracket");
  const dashboardListHref = `/account${dashListQs.toString() ? `?${dashListQs}` : ""}`;
  const dashboardBracketHref = `/account?${dashBracketQs}`;
  const editPicksFromDashboardHref = picksCtx?.selectedParticipant?.id
    ? `/account/picks?participant=${picksCtx.selectedParticipant.id}`
    : picksHref;

  return (
    <PageContainer>
      <div className="mb-8">
        <PageTitle
          title="My bracket"
          description={
            user.email
              ? `Signed in as ${user.email}. Below is your bracket snapshot for the selected pool profile — use Edit picks to continue or change picks.`
              : "Your bracket overview for the selected pool profile. Use Edit picks to update your picks."
          }
        />
      </div>

      <div className="mb-6 space-y-3">
        {orgErr ? (
          <p className="text-sm text-amber-200" role="alert">
            Could not load pools you organize ({orgErr.message}).
          </p>
        ) : null}
        {organizedPools.length > 0 ? (
          <div className="ash-surface p-4">
            <h2 className="text-sm font-semibold text-ash-text">
              Pools you organize
            </h2>
            <ul className="mt-2 space-y-2 text-sm">
              {organizedPools.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2"
                >
                  <span className="text-ash-text">{p.name}</span>
                  <Link
                    href={`/admin/pools/${p.id}`}
                    className="btn-primary inline-flex py-1.5 text-xs"
                  >
                    Manage pool
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div>
          <Link
            href="/account/pools/new"
            className="btn-ghost inline-flex text-sm ring-1 ring-ash-border"
          >
            Create your own pool
          </Link>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-red-300" role="alert">
          {error.message}
        </p>
      ) : null}

      {!error && list.length === 0 ? (
        <div className="ash-surface p-6">
          <p className="text-sm text-ash-muted">
            You are not linked to a pool as a participant yet. Use your join
            code to create or claim a profile, or start your own pool as the
            organizer.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/join" className="btn-primary inline-flex">
              Join a pool
            </Link>
            <Link
              href="/account/pools/new"
              className="btn-ghost inline-flex ring-1 ring-ash-border"
            >
              Create your own pool
            </Link>
          </div>
        </div>
      ) : null}

      {!error && list.length > 0 ? (
        <>
          <div className="mb-4 flex flex-wrap gap-3">
            <Link href={picksHref} className="btn-primary inline-flex">
              Edit picks
            </Link>
            <Link
              href={
                list.length === 1
                  ? `/account/activity?participant=${list[0].id}`
                  : "/account/activity"
              }
              className="btn-ghost inline-flex ring-1 ring-ash-border"
            >
              Activity
            </Link>
          </div>

          {picksCtx && picksCtx.profileLinkItems.length > 1 ? (
            <AccountPicksProfileLinks
              profiles={picksCtx.profileLinkItems}
              selectedId={picksCtx.selectedId}
              summaryBasePath="/account/picks/summary"
              activityBasePath="/account/activity"
              multiProfileHeading="Choose profile"
            />
          ) : null}

          {picksCtx?.loadError ? (
            <p
              className="mb-4 rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200"
              role="alert"
            >
              {picksCtx.loadError}
            </p>
          ) : null}

          {picksCtx &&
          picksCtx.selectedId &&
          picksCtx.selectedParticipant &&
          !picksCtx.loadError &&
          picksCtx.initialSlots.length > 0 ? (
            <div className="space-y-6">
              <div className="mb-2">
                <PicksViewToggle
                  current={view}
                  listHref={dashboardListHref}
                  bracketHref={dashboardBracketHref}
                />
              </div>

              {view === "list" ? (
                <MyKnockoutPicksSummary
                  slots={picksCtx.initialSlots}
                  teams={picksCtx.teams}
                  participantId={picksCtx.selectedParticipant.id}
                  poolName={picksCtx.selectedPoolName}
                  locked={locked}
                  lockHint={lockHint}
                  showSavedBanner={false}
                  knockoutBracketPicksUnlocked={
                    picksCtx.knockoutBracketPicksUnlocked
                  }
                  showCompactStageProgress
                  completionStatus={picksCtx.pickCompletionStatus}
                />
              ) : (
                <>
                  <MyKnockoutPicksSummary
                    slots={picksCtx.initialSlots}
                    teams={picksCtx.teams}
                    participantId={picksCtx.selectedParticipant.id}
                    poolName={picksCtx.selectedPoolName}
                    locked={locked}
                    lockHint={lockHint}
                    showSavedBanner={false}
                    knockoutBracketPicksUnlocked={
                      picksCtx.knockoutBracketPicksUnlocked
                    }
                    showCompactStageProgress
                    completionStatus={picksCtx.pickCompletionStatus}
                    sections="toolbar_only"
                  />
                  <div className="mt-6">
                    <ParticipantBracketView
                      slots={picksCtx.initialSlots}
                      teams={picksCtx.teams}
                      knockoutBracketPicksUnlocked={
                        picksCtx.knockoutBracketPicksUnlocked
                      }
                      editPicksHref={editPicksFromDashboardHref}
                      readOnly={false}
                    />
                  </div>
                </>
              )}

              <AccountNextMatchesSection
                className="rounded-xl border border-ash-border bg-ash-surface p-4"
                title="Upcoming matches for your bracket"
                description={
                  <>
                    Highlights use your saved picks for{" "}
                    <span className="font-medium text-ash-text">
                      {picksCtx.selectedPoolName}
                    </span>
                    . Times are America/Edmonton (Calgary). If you are in several
                    pools, choose the profile above so the schedule matches that
                    bracket.
                  </>
                }
                tournamentErr={accountTournamentErr}
                matches={accountNextMatches}
                initialSlots={picksCtx.initialSlots}
                teams={picksCtx.teams}
              />
            </div>
          ) : null}

          {picksCtx &&
          picksCtx.selectedId &&
          picksCtx.selectedParticipant &&
          !picksCtx.loadError &&
          picksCtx.initialSlots.length === 0 ? (
            <div className="mb-6 rounded-xl border border-amber-700/50 bg-amber-950/25 p-6 shadow-[0_4px_12px_rgba(0,0,0,0.3)]">
              <p className="text-sm text-amber-100">
                Knockout stages are not set up in the database yet, so we
                can’t show a bracket snapshot. Ask your organizer or check
                tournament seeds.
              </p>
              <Link
                href={`/account/picks?participant=${picksCtx.selectedParticipant.id}`}
                className="btn-ghost mt-4 inline-flex border-amber-700/50 text-amber-50 hover:bg-amber-950/40"
              >
                Edit picks
              </Link>
            </div>
          ) : null}

          <ul className="mt-8 space-y-3">
            {list.map((p) => (
              <li key={p.id} className="ash-surface p-4">
                <p className="font-medium text-ash-text">{p.display_name}</p>
                <div className="mt-2 flex flex-wrap gap-3 text-sm">
                  <Link href={`/participant/${p.id}`} className="ash-link">
                    Public profile
                  </Link>
                  <Link
                    href={`/account/picks?participant=${p.id}`}
                    className="ash-link"
                  >
                    Edit picks
                  </Link>
                  <Link
                    href={`/account/activity?participant=${p.id}`}
                    className="ash-link"
                  >
                    Activity
                  </Link>
                  <Link href={`/account?participant=${p.id}`} className="ash-link">
                    This pool on My bracket
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </PageContainer>
  );
}
