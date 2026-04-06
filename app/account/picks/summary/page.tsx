import { AccountPicksProfileLinks } from "@/components/account/AccountPicksProfileLinks";
import { MyKnockoutPicksSummary } from "@/components/picks/MyKnockoutPicksSummary";
import { ParticipantPicksNextMatches } from "@/components/picks/ParticipantPicksNextMatches";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { createClient } from "@/lib/supabase/server";
import {
  loadAccountKnockoutSelection,
  poolLocked,
} from "../../../../lib/account/loadAccountKnockoutSelection";
import { fetchPublicTournamentProgress } from "../../../../lib/tournament/fetchPublicTournamentProgress";
import {
  countryCodesFromKnockoutSlots,
  nextMatchesForTeamCountryCodes,
} from "../../../../lib/participant/nextMatchesForPickedTeams";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ participant?: string; saved?: string }>;
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

  const teamById = new Map(ctx.teams.map((t) => [t.id, t]));
  const codes = countryCodesFromKnockoutSlots(ctx.initialSlots, teamById);
  const { data: tournamentPayload, error: tournamentErr } =
    await fetchPublicTournamentProgress();
  const nextMatches =
    tournamentPayload?.matches && !tournamentErr
      ? nextMatchesForTeamCountryCodes(tournamentPayload.matches, codes, 8)
      : [];

  return (
    <PageContainer>
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
          Edit picks wizard
        </Link>
      </div>

      <PageTitle
        title="Your bracket snapshot"
        description="Groups, every knockout round, third-place picks, bonus answers, and upcoming matches for the teams you selected."
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
              <MyKnockoutPicksSummary
                slots={ctx.initialSlots}
                teams={ctx.teams}
                participantId={ctx.selectedParticipant.id}
                poolName={ctx.selectedPoolName}
                locked={locked}
                lockHint={lockHint}
                showSavedBanner={showSavedBanner}
              />

              <section className="ash-surface p-4">
                <h2 className="text-base font-bold text-ash-text">
                  Next matches for your teams
                </h2>
                <p className="mt-1 text-xs text-ash-muted">
                  From the official group schedule in the app (FIFA country
                  codes). Date and time use America/Edmonton (Calgary). Live and
                  upcoming fixtures for teams in your bracket are listed first.
                </p>
                {tournamentErr ? (
                  <p className="mt-3 text-sm text-amber-200" role="status">
                    Schedule could not be loaded ({tournamentErr}). Your picks
                    above are still saved.
                  </p>
                ) : (
                  <div className="mt-3">
                    <ParticipantPicksNextMatches
                      matches={nextMatches}
                      initialSlots={ctx.initialSlots}
                      teams={ctx.teams}
                    />
                  </div>
                )}
              </section>

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
