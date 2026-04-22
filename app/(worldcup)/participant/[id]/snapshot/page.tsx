import { AccountNextMatchesSection } from "@/components/account/AccountNextMatchesSection";
import { ParticipantBracketView } from "@/components/bracket/ParticipantBracketView";
import { MyKnockoutPicksSummary } from "@/components/picks/MyKnockoutPicksSummary";
import { PicksViewToggle } from "@/components/picks/PicksViewToggle";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { createClient } from "@/lib/supabase/server";
import { poolLocked } from "@/lib/account/loadAccountKnockoutSelection";
import { loadParticipantBracketSnapshot } from "@/lib/participant/loadParticipantBracketSnapshot";
import {
  countryCodesFromKnockoutSlots,
  nextMatchesForTeamCountryCodes,
} from "@/lib/participant/nextMatchesForPickedTeams";
import { fetchPublicTournamentProgress } from "@/lib/tournament/fetchPublicTournamentProgress";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; view?: string }>;
};

function possessiveTitle(displayName: string): string {
  const n = displayName.trim() || "Participant";
  return `${n}'s bracket snapshot`;
}

export default async function ParticipantBracketSnapshotPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const sp = await searchParams;
  const fromRaw = (sp.from ?? "").trim();
  const from = fromRaw.toLowerCase();
  const view = sp.view === "bracket" ? "bracket" : "list";

  const result = await loadParticipantBracketSnapshot(id);

  if (!result.ok) {
    if (result.kind === "invalid_id" || result.kind === "not_found") {
      notFound();
    }
    return (
      <PageContainer>
        <PageTitle title="Bracket snapshot" description="Read-only picks for this pool profile." />
        <p className="rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {result.message ?? "Could not load this bracket snapshot."}
        </p>
      </PageContainer>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const locked = poolLocked(result.header.lockAt);
  const lockHintSelf =
    locked && result.header.lockAt
      ? `Group stage, third-place advancers, and bonus picks locked ${new Intl.DateTimeFormat(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(result.header.lockAt))}. Knockout bracket may still be editable after the official Round of 32 is published.`
      : locked
        ? "Pre‑knockout picks are locked; knockout bracket may still be open."
        : null;

  const lockHintPeer =
    locked && result.header.lockAt
      ? `This pool had its pre‑knockout picks deadline at ${new Intl.DateTimeFormat(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(result.header.lockAt))} (host timezone as stored). Knockout may still update after the official Round of 32 is published.`
      : locked
        ? "Pre‑knockout picks are locked for this pool; knockout bracket may still be open."
        : null;

  const teamById = new Map(result.teams.map((t) => [t.id, t]));
  const codes = countryCodesFromKnockoutSlots(result.initialSlots, teamById);
  const { data: tournamentPayload, error: tournamentErr } =
    await fetchPublicTournamentProgress();
  const nextMatches =
    tournamentPayload?.matches && !tournamentErr
      ? nextMatchesForTeamCountryCodes(tournamentPayload.matches, codes, 8)
      : [];

  let isSelf = false;
  if (user) {
    const { data: ownRow } = await supabase
      .from("participants")
      .select("id")
      .eq("id", result.participantId)
      .eq("user_id", user.id)
      .maybeSingle();
    isSelf = Boolean(ownRow);
  }

  const showOwnerEditLink = isSelf;

  const snapshotListQs = new URLSearchParams();
  if (fromRaw) snapshotListQs.set("from", fromRaw);
  const snapshotBracketQs = new URLSearchParams(snapshotListQs);
  snapshotBracketQs.set("view", "bracket");
  const snapshotListHref = `/participant/${result.participantId}/snapshot${
    snapshotListQs.toString() ? `?${snapshotListQs}` : ""
  }`;
  const snapshotBracketHref = `/participant/${result.participantId}/snapshot?${snapshotBracketQs}`;
  const snapshotEditPicksHref = `/account/picks?participant=${result.participantId}`;

  return (
    <PageContainer>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        {from === "activity" ? (
          <Link href="/account/activity" className="ash-link text-sm">
            ← Back to activity
          </Link>
        ) : from === "account" ? (
          <Link href="/account" className="ash-link text-sm">
            ← Back to account
          </Link>
        ) : (
          <Link href={`/participant/${result.participantId}`} className="ash-link text-sm">
            ← Public profile & scoring
          </Link>
        )}
        {showOwnerEditLink ? (
          <>
            <span className="text-ash-border" aria-hidden>
              |
            </span>
            <Link
              href={`/account/picks?participant=${result.participantId}`}
              className="ash-link text-sm"
            >
              Edit your picks
            </Link>
          </>
        ) : null}
      </div>

      <PageTitle
        title={possessiveTitle(result.header.displayName)}
        description="Stage 1–2 picks, knockout bracket when unlocked, and bonus answers — read-only."
      />

      {result.initialSlots.length === 0 ? (
        <div className="rounded-xl border border-amber-700/50 bg-amber-950/25 p-6">
          <p className="text-sm text-amber-100">
            This profile does not have bracket picks loaded yet, or knockout stages are not
            configured in the database.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-6">
            <PicksViewToggle
              current={view}
              listHref={snapshotListHref}
              bracketHref={snapshotBracketHref}
            />
          </div>

          {view === "list" ? (
            <MyKnockoutPicksSummary
              slots={result.initialSlots}
              teams={result.teams}
              participantId={result.participantId}
              poolName={result.header.poolName}
              locked={locked}
              lockHint={isSelf ? lockHintSelf : lockHintPeer}
              showSavedBanner={false}
              knockoutBracketPicksUnlocked={result.knockoutBracketPicksUnlocked}
              showCompactStageProgress
              readOnly={!isSelf}
            />
          ) : (
            <>
              <MyKnockoutPicksSummary
                slots={result.initialSlots}
                teams={result.teams}
                participantId={result.participantId}
                poolName={result.header.poolName}
                locked={locked}
                lockHint={isSelf ? lockHintSelf : lockHintPeer}
                showSavedBanner={false}
                knockoutBracketPicksUnlocked={result.knockoutBracketPicksUnlocked}
                showCompactStageProgress
                readOnly={!isSelf}
                sections="toolbar_only"
              />
              <div className="mt-6">
                <ParticipantBracketView
                  slots={result.initialSlots}
                  teams={result.teams}
                  knockoutBracketPicksUnlocked={result.knockoutBracketPicksUnlocked}
                  editPicksHref={isSelf ? snapshotEditPicksHref : null}
                  readOnly={!isSelf}
                />
              </div>
            </>
          )}

          <div className="mt-8">
            <AccountNextMatchesSection
              title={isSelf ? "Next matches for your teams" : "Next matches for their teams"}
              description={
                isSelf ? (
                  <>
                    From the official group schedule in the app (FIFA country codes). Date and
                    time use America/Edmonton (Calgary). Live and upcoming fixtures for teams in
                    this bracket are listed first.
                  </>
                ) : (
                  <>
                    From the official group schedule (FIFA country codes). Times use
                    America/Edmonton (Calgary). Listed for teams in this participant&apos;s saved
                    bracket.
                  </>
                )
              }
              tournamentErr={tournamentErr}
              tournamentErrorSuffix="Saved picks above are unchanged if the schedule fails to load."
              matches={nextMatches}
              initialSlots={result.initialSlots}
              teams={result.teams}
            />
          </div>
        </>
      )}
    </PageContainer>
  );
}
