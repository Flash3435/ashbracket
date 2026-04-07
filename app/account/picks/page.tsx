import { AccountPicksProfileLinks } from "@/components/account/AccountPicksProfileLinks";
import { ParticipantKnockoutPicksForm } from "@/components/admin/ParticipantKnockoutPicksForm";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { createClient } from "@/lib/supabase/server";
import {
  loadAccountKnockoutSelection,
  poolLocked,
} from "../../../lib/account/loadAccountKnockoutSelection";
import Link from "next/link";
import { redirect } from "next/navigation";
import { saveMyKnockoutPicksAction } from "./actions";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ participant?: string }>;
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
  const ctx = await loadAccountKnockoutSelection(user.id, participantParam);

  const locked = poolLocked(ctx.selectedLockAt);
  const lockHint =
    locked && ctx.selectedLockAt
      ? `Picks locked on ${new Intl.DateTimeFormat(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(ctx.selectedLockAt))}.`
      : locked
        ? "This pool is locked — picks can no longer be changed."
        : null;

  const summaryHref = ctx.selectedId
    ? `/account/picks/summary?participant=${ctx.selectedId}`
    : "/account/picks/summary";

  const postSaveRedirectTo = ctx.selectedId
    ? `/account/picks/summary?participant=${ctx.selectedId}&saved=1`
    : undefined;

  return (
    <PageContainer>
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
          </>
        ) : null}
      </div>

      <PageTitle
        title="Your picks"
        description="Groups, eight third-place advancers, then bonus questions anytime. Round of 32 through champion open only after organizers publish the official bracket. Quick start fills groups and third-place picks (and the full knockout path when that step is open). Edits apply until the pool locks."
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
          />

          {!ctx.selectedId && ctx.myParticipants.length > 1 ? (
            <p className="text-sm text-ash-muted">
              Select which pool profile you want to view or edit.
            </p>
          ) : null}

          {ctx.selectedId && ctx.selectedParticipant && !ctx.loadError ? (
            <>
              <p className="mb-4 text-sm text-ash-muted">
                Pool:{" "}
                <span className="font-medium text-ash-text">
                  {ctx.selectedPoolName}
                </span>
                {locked ? (
                  <span className="ml-2 rounded-full bg-amber-950/50 px-2 py-0.5 text-xs font-medium text-amber-100">
                    Locked
                  </span>
                ) : (
                  <span className="ml-2 rounded-full bg-ash-accent/20 px-2 py-0.5 text-xs font-medium text-ash-accent">
                    Open for picks
                  </span>
                )}
              </p>

              {ctx.predictions.length === 0 && !locked ? (
                <p className="mb-6 rounded-md border border-ash-border bg-ash-surface px-3 py-2 text-sm text-ash-muted">
                  No saved knockout picks yet — all slots start empty. Choose a
                  team per slot, then save. After saving, we’ll take you to a
                  clear summary you can revisit anytime.
                </p>
              ) : null}

              <ParticipantKnockoutPicksForm
                participantId={ctx.selectedParticipant.id}
                participantDisplayName={ctx.selectedParticipant.displayName}
                initialSlots={ctx.initialSlots}
                knockoutBracketPicksUnlocked={ctx.knockoutBracketPicksUnlocked}
                teams={ctx.teams}
                groupTeamCountryCodesByLetter={ctx.groupTeamCountryCodesByLetter}
                disabled={ctx.teams.length === 0}
                readOnly={locked}
                lockedMessage={lockHint}
                savePicks={saveMyKnockoutPicksAction}
                successMessage="Your picks were saved."
                successDetail="Standings and the public leaderboard refresh when match results are updated or an organizer recomputes scores."
                saveHelpText="Saving writes every slot (including empty ones you cleared). Your bracket is stored right away; the scoreboard catches up after the next standings update."
                postSaveRedirectTo={postSaveRedirectTo}
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
