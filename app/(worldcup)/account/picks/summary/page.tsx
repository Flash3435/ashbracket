import { WhoToCheerForCard } from "@/components/account/WhoToCheerForCard";
import { AccountPicksProfileLinks } from "@/components/account/AccountPicksProfileLinks";
import { PicksDeadlineBannerFromPool } from "@/components/pool/PicksDeadlineBannerFromPool";
import { whoToCheerForFromSchedule } from "@/lib/account/loadWhoToCheerFor";
import { ParticipantBracketView } from "@/components/bracket/ParticipantBracketView";
import { MyKnockoutPicksSummary } from "@/components/picks/MyKnockoutPicksSummary";
import { PicksViewToggle } from "@/components/picks/PicksViewToggle";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { createClient } from "@/lib/supabase/server";
import {
  accountPicksNavLabel,
  loadAccountKnockoutSelection,
  poolLocked,
} from "../../../../../lib/account/loadAccountKnockoutSelection";
import { fetchPublicTournamentProgress } from "../../../../../lib/tournament/fetchPublicTournamentProgress";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ participant?: string; saved?: string; view?: string }>;
};

export default async function AccountPicksSummaryPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/account/picks/summary");
  }

  const participantParam = sp.participant?.trim() ?? "";
  const showSavedBanner = sp.saved === "1" || sp.saved === "true";
  const view = sp.view === "bracket" ? "bracket" : "list";

  const ctx = await loadAccountKnockoutSelection(user.id, participantParam);

  if (ctx.invalidOtherProfile && ctx.paramId) {
    const redirectQs = new URLSearchParams();
    redirectQs.set("from", "account");
    if (showSavedBanner) redirectQs.set("saved", "1");
    if (view === "bracket") redirectQs.set("view", "bracket");
    redirect(`/participant/${ctx.paramId}/snapshot?${redirectQs}`);
  }

  const locked = poolLocked(ctx.selectedLockAt);

  const { data: tournamentPayload, error: tournamentErr } =
    await fetchPublicTournamentProgress();
  const whoToCheer =
    ctx.initialSlots.length > 0
      ? whoToCheerForFromSchedule(
          ctx,
          tournamentPayload?.matches,
          tournamentErr,
        )
      : null;

  const pid = ctx.selectedParticipant?.id;
  const listQs = new URLSearchParams();
  if (pid) listQs.set("participant", pid);
  if (showSavedBanner) listQs.set("saved", "1");
  const bracketQs = new URLSearchParams(listQs);
  bracketQs.set("view", "bracket");
  const listHref = `/account/picks/summary${listQs.toString() ? `?${listQs}` : ""}`;
  const bracketHref = `/account/picks/summary?${bracketQs}`;
  const editPicksHref = pid ? `/account/picks?participant=${pid}` : "/account/picks";

  return (
    <PageContainer>
      {ctx.selectedPoolId ? (
        <PicksDeadlineBannerFromPool
          poolId={ctx.selectedPoolId}
          className="mb-6"
        />
      ) : null}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link href="/account" className="ash-link text-sm">
          ← Back to account
        </Link>
        <span className="text-ash-border" aria-hidden>
          |
        </span>
        <Link
          href={
            ctx.selectedId
              ? `/account/picks?participant=${ctx.selectedId}`
              : "/account/picks"
          }
          className="ash-link text-sm"
        >
          {locked
            ? `${accountPicksNavLabel(true)} wizard`
            : "Edit picks wizard"}
        </Link>
      </div>

      <PageTitle
        title="Your bracket snapshot"
        description="Stage 1–2 picks, knockout bracket when unlocked, bonus answers, and upcoming matches for the teams you selected."
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
            You do not have a pool profile yet. Join with a code to create one,
            then return here to see your picks.
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
            revealBasePath="/account/reveal"
            multiProfileHeading="Choose profile"
          />

          {!ctx.selectedId && ctx.myParticipants.length > 1 ? (
            <p className="text-sm text-ash-muted">
              Select which pool profile you want to view.
            </p>
          ) : null}

          {ctx.selectedId &&
          ctx.selectedParticipant &&
          !ctx.loadError &&
          ctx.initialSlots.length > 0 ? (
            <>
              <div className="mb-6">
                <PicksViewToggle
                  current={view}
                  listHref={listHref}
                  bracketHref={bracketHref}
                  knockoutBracketPicksUnlocked={ctx.knockoutBracketPicksUnlocked}
                />
              </div>

              {view === "list" ? (
                <MyKnockoutPicksSummary
                  slots={ctx.initialSlots}
                  teams={ctx.teams}
                  participantId={ctx.selectedParticipant.id}
                  poolName={ctx.selectedPoolName}
                  locked={locked}
                  lockAtIso={ctx.selectedLockAt}
                  showSavedBanner={showSavedBanner}
                  knockoutBracketPicksUnlocked={ctx.knockoutBracketPicksUnlocked}
                />
              ) : (
                <>
                  <MyKnockoutPicksSummary
                    slots={ctx.initialSlots}
                    teams={ctx.teams}
                    participantId={ctx.selectedParticipant.id}
                    poolName={ctx.selectedPoolName}
                    locked={locked}
                    lockAtIso={ctx.selectedLockAt}
                    showSavedBanner={showSavedBanner}
                    knockoutBracketPicksUnlocked={ctx.knockoutBracketPicksUnlocked}
                    showCompactStageProgress
                    sections="toolbar_only"
                  />
                  <div className="mt-6">
                    <ParticipantBracketView
                      slots={ctx.initialSlots}
                      teams={ctx.teams}
                      knockoutBracketPicksUnlocked={ctx.knockoutBracketPicksUnlocked}
                      editPicksHref={editPicksHref}
                      listViewHref={listHref}
                      readOnly={false}
                    />
                  </div>
                </>
              )}

              {whoToCheer ? (
                <div className="mt-6">
                  <WhoToCheerForCard
                    suggestions={whoToCheer.suggestions}
                    totalRelevantMatches={whoToCheer.totalRelevantMatches}
                    tournamentErr={whoToCheer.tournamentErr}
                    showIncompleteCta={whoToCheer.showIncompleteCta}
                    hasAnyPick={whoToCheer.hasAnyPick}
                    picksHref={editPicksHref}
                    initialSlots={ctx.initialSlots}
                    teams={ctx.teams}
                  />
                </div>
              ) : null}

              <p className="text-center text-sm text-ash-muted">
                <Link
                  href={`/participant/${ctx.selectedParticipant.id}`}
                  className="ash-link"
                >
                  Public profile & scoring
                </Link>
              </p>
            </>
          ) : null}

          {ctx.selectedId &&
          ctx.selectedParticipant &&
          !ctx.loadError &&
          ctx.initialSlots.length === 0 ? (
            <div className="rounded-xl border border-amber-700/50 bg-amber-950/25 p-6 shadow-[0_4px_12px_rgba(0,0,0,0.3)]">
              <p className="text-sm text-amber-100">
                Knockout stages are not set up in the database yet, so we
                can’t show a summary. Ask your organizer or check tournament
                seeds.
              </p>
              <Link
                href={`/account/picks?participant=${ctx.selectedParticipant.id}`}
                className="btn-ghost mt-4 inline-flex border-amber-700/50 text-amber-50 hover:bg-amber-950/40"
              >
                Back to picks
              </Link>
            </div>
          ) : null}
        </>
      ) : null}
    </PageContainer>
  );
}
