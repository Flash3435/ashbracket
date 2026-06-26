import { AccountPicksProfileLinks } from "@/components/account/AccountPicksProfileLinks";
import { ParticipantKnockoutPicksForm } from "@/components/admin/ParticipantKnockoutPicksForm";
import { KnockoutSelectionInstructionCard } from "@/components/picks/KnockoutSelectionInstructionCard";
import { PicksDeadlineBannerFromPool } from "@/components/pool/PicksDeadlineBannerFromPool";
import { buildKnockoutSelectionInstructionCard } from "@/lib/picks/knockoutSelectionWindow";
import {
  getGradualKnockoutSelectionState,
  hasEditableKnockoutPicks,
} from "@/lib/picks/gradualKnockoutUnlock";
import { fetchPublicTournamentProgress } from "@/lib/tournament/fetchPublicTournamentProgress";
import {
  ParticipantPoolPaymentPanel,
  UnpaidPaymentReminderBanner,
} from "@/components/pools/ParticipantPoolPaymentPanel";
import { fetchPoolPotForMember } from "@/lib/pools/fetchPoolPotForMember";
import { poolIsPaid } from "@/lib/pools/poolPayment";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { createClient } from "@/lib/supabase/server";
import {
  loadAccountKnockoutSelection,
  poolLocked,
} from "../../../../lib/account/loadAccountKnockoutSelection";
import Link from "next/link";
import { redirect } from "next/navigation";
import { saveMyKnockoutPicksAction } from "./actions";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ participant?: string; joined?: string }>;
};

export default async function AccountPicksPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/account/picks");
  }

  const participantParam = sp.participant?.trim() ?? "";
  const showJoinPaymentNotice = sp.joined === "1";
  const ctx = await loadAccountKnockoutSelection(user.id, participantParam);

  const potSummary =
    ctx.selectedPoolId &&
    poolIsPaid(ctx.selectedPoolPayment) &&
    ctx.selectedPoolPayment.showPotToParticipants
      ? await fetchPoolPotForMember(supabase, ctx.selectedPoolId)
      : null;

  if (ctx.invalidOtherProfile && ctx.paramId) {
    redirect(`/participant/${ctx.paramId}/snapshot?from=account`);
  }

  const locked = poolLocked(ctx.selectedLockAt);

  const summaryHref = ctx.selectedId
    ? `/account/picks/summary?participant=${ctx.selectedId}`
    : "/account/picks/summary";

  const postSaveRedirectTo = ctx.selectedId
    ? `/account/picks/summary?participant=${ctx.selectedId}&saved=1`
    : undefined;

  const editPicksHref = ctx.selectedId
    ? `/account/picks?participant=${ctx.selectedId}`
    : "/account/picks";

  const { data: tournamentPayload } =
    ctx.selectedId && !ctx.loadError
      ? await fetchPublicTournamentProgress()
      : { data: null };

  const gradualKnockout = getGradualKnockoutSelectionState({
    matches: tournamentPayload?.matches ?? null,
    fullRoundOf32Official: ctx.knockoutBracketPicksUnlocked,
  });
  const knockoutPicksEditable = hasEditableKnockoutPicks({
    gradual: gradualKnockout,
    fullRoundOf32Official: ctx.knockoutBracketPicksUnlocked,
  });
  const picksReadOnly = locked && !knockoutPicksEditable;

  const knockoutSelectionCard =
    ctx.selectedId && !ctx.loadError
      ? buildKnockoutSelectionInstructionCard({
          knockoutBracketPicksUnlocked: ctx.knockoutBracketPicksUnlocked,
          matches: tournamentPayload?.matches ?? null,
          picksHref: editPicksHref,
        })
      : null;

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
        {ctx.selectedId && !ctx.loadError ? (
          <>
            <span className="text-ash-border" aria-hidden>
              |
            </span>
            <Link href={summaryHref} className="ash-link text-sm">
              View bracket summary
            </Link>
            <span className="text-ash-border" aria-hidden>
              |
            </span>
            <Link
              href={`/account/activity?participant=${ctx.selectedId}`}
              className="ash-link text-sm"
            >
              Activity
            </Link>
          </>
        ) : null}
      </div>

      <PageTitle
        title={picksReadOnly ? "Your picks (read-only)" : "Your picks"}
        description={
          picksReadOnly
            ? "Picks are locked — this is a read-only view. Knockout bracket picks will open when the official Round of 32 is published."
            : locked
              ? "Group stage, third-place, and bonus picks are locked. You can still update knockout bracket picks when the official Round of 32 is published."
              : "Your picks open in bracket view so you can see what’s done and what’s still missing. Stage 1: 1st and 2nd in every group. Stage 2: one third-place advancer per group row (eight total). Stage 3: Round of 32 through champion once the official bracket is published, plus bonus picks. Use list view anytime for step-by-step editing."
        }
      />

      {picksReadOnly ? (
        <p
          className="mb-6 rounded-md border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-100"
          role="status"
        >
          Picks are locked — this is a read-only view for group stage, third-place,
          and bonus picks.
        </p>
      ) : null}

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
            then return here to enter picks.
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
          />

          {!ctx.selectedId && ctx.myParticipants.length > 1 ? (
            <p className="text-sm text-ash-muted">
              {picksReadOnly
                ? "Select which pool profile you want to view."
                : "Select which pool profile you want to view or edit."}
            </p>
          ) : null}

          {ctx.selectedId && ctx.selectedParticipant && !ctx.loadError ? (
            <>
              <p className="mb-4 text-sm text-ash-muted">
                Pool:{" "}
                <span className="font-medium text-ash-text">
                  {ctx.selectedPoolName}
                </span>
              </p>

              {poolIsPaid(ctx.selectedPoolPayment) ? (
                <div className="mb-4">
                  <ParticipantPoolPaymentPanel
                    poolPayment={ctx.selectedPoolPayment}
                    isPaid={ctx.selectedParticipant.paid}
                    potSummary={potSummary}
                    variant={
                      showJoinPaymentNotice && !ctx.selectedParticipant.paid
                        ? "join_notice"
                        : "default"
                    }
                  />
                </div>
              ) : null}

              {!showJoinPaymentNotice ? (
                <UnpaidPaymentReminderBanner
                  poolPayment={ctx.selectedPoolPayment}
                  isPaid={ctx.selectedParticipant.paid}
                />
              ) : null}

              {knockoutSelectionCard ? (
                <KnockoutSelectionInstructionCard
                  model={knockoutSelectionCard}
                  className="mb-6"
                />
              ) : null}

              {ctx.predictions.length === 0 && !locked ? (
                <p className="mb-6 rounded-md border border-ash-border bg-ash-surface px-3 py-2 text-sm text-ash-muted">
                  No saved picks yet — the bracket starts empty. Fill groups and
                  third-place advancers first (switch to list view for guided
                  steps), then save. Knockout rounds unlock after the official
                  Round of 32 is published.
                </p>
              ) : null}

              <ParticipantKnockoutPicksForm
                participantId={ctx.selectedParticipant.id}
                participantDisplayName={ctx.selectedParticipant.displayName}
                initialSlots={ctx.initialSlots}
                knockoutBracketPicksUnlocked={ctx.knockoutBracketPicksUnlocked}
                tournamentMatches={tournamentPayload?.matches ?? null}
                teams={ctx.teams}
                groupTeamCountryCodesByLetter={ctx.groupTeamCountryCodesByLetter}
                disabled={ctx.teams.length === 0}
                readOnly={picksReadOnly}
                preBracketSelectionsLocked={locked}
                poolLockAtIso={ctx.selectedLockAt}
                savePicks={saveMyKnockoutPicksAction}
                successMessage="Your picks were saved."
                successDetail="Your pool’s scored leaderboard is recalculated from official results as soon as you save (same scoring rules as everyone else in the pool)."
                saveHelpText="Saving writes every slot (including empty ones you cleared). Your bracket is stored immediately and the pool leaderboard is refreshed from the official results snapshot."
                postSaveRedirectTo={postSaveRedirectTo}
                defaultPicksMainView="bracket"
                rememberPicksMainView
              />

              {ctx.teams.length === 0 ? (
                <p className="mt-4 text-sm text-amber-200">
                  Teams are not loaded yet. Ask an organizer or check Supabase
                  seeds.
                </p>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </PageContainer>
  );
}
