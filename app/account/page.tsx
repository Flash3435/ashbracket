import Link from "next/link";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { ParticipantPicksNextMatches } from "@/components/picks/ParticipantPicksNextMatches";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { loadAccountKnockoutSelection } from "../../lib/account/loadAccountKnockoutSelection";
import { SAMPLE_POOL_ID } from "../../lib/config/sample-pool";
import {
  countryCodesFromKnockoutSlots,
  nextMatchesForTeamCountryCodes,
} from "../../lib/participant/nextMatchesForPickedTeams";
import { fetchPublicTournamentProgress } from "../../lib/tournament/fetchPublicTournamentProgress";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/account");
  }

  const { data: rows, error } = await supabase
    .from("participants")
    .select("id, display_name, pool_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  const list = rows ?? [];
  const sample = list.find((p) => p.pool_id === SAMPLE_POOL_ID);

  const firstParticipantId = list[0]?.id ?? "";
  const picksCtx =
    !error && firstParticipantId
      ? await loadAccountKnockoutSelection(user.id, firstParticipantId)
      : null;

  let accountNextMatches: TournamentMatchPublicRow[] = [];
  let accountNextCodes = new Set<string>();
  let accountTournamentErr: string | null = null;

  if (picksCtx && !picksCtx.loadError && picksCtx.initialSlots.length > 0) {
    const teamById = new Map(picksCtx.teams.map((t) => [t.id, t]));
    accountNextCodes = countryCodesFromKnockoutSlots(
      picksCtx.initialSlots,
      teamById,
    );
    const { data: tp, error: te } = await fetchPublicTournamentProgress();
    accountTournamentErr = te;
    if (tp?.matches && !te) {
      accountNextMatches = nextMatchesForTeamCountryCodes(
        tp.matches,
        accountNextCodes,
        5,
      );
    }
  }

  return (
    <PageContainer>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageTitle
          title="Your account"
          description={
            user.email
              ? `Signed in as ${user.email}. Use Edit picks to update your bracket.`
              : "Your pool profiles are listed below."
          }
        />
        <SignOutButton className="btn-ghost shrink-0 self-start text-sm disabled:opacity-50" />
      </div>

      {error ? (
        <p className="text-sm text-red-300" role="alert">
          {error.message}
        </p>
      ) : null}

      {!error && list.length === 0 ? (
        <div className="ash-surface p-6">
          <p className="text-sm text-ash-muted">
            You are not linked to a pool yet. Use your join code to create or
            claim a profile.
          </p>
          <Link href="/join" className="btn-primary mt-4 inline-flex">
            Join a pool
          </Link>
        </div>
      ) : null}

      {!error && list.length > 0 ? (
        <div className="mb-4">
          <Link
            href={
              list.length === 1
                ? `/account/picks?participant=${list[0].id}`
                : "/account/picks"
            }
            className="btn-primary inline-flex"
          >
            {list.length === 1 ? "Enter your picks" : "Your picks"}
          </Link>
        </div>
      ) : null}

      {!error &&
      list.length > 0 &&
      picksCtx &&
      !picksCtx.loadError &&
      picksCtx.initialSlots.length > 0 ? (
        <section className="mb-6 rounded-xl border border-ash-border bg-ash-surface p-4">
          <h2 className="text-base font-bold text-ash-text">
            Upcoming matches for your bracket
          </h2>
          <p className="mt-1 text-xs text-ash-muted">
            Using your first pool profile ({picksCtx.selectedPoolName}). Times
            are America/Edmonton (Calgary).{" "}
            <Link
              href={`/account/picks/summary?participant=${firstParticipantId}`}
              className="ash-link"
            >
              Full snapshot
            </Link>
          </p>
          {accountTournamentErr ? (
            <p className="mt-3 text-sm text-amber-200" role="status">
              Schedule could not be loaded ({accountTournamentErr}).
            </p>
          ) : (
            <div className="mt-3">
              <ParticipantPicksNextMatches
                matches={accountNextMatches}
                pickedCountryCodes={accountNextCodes}
              />
            </div>
          )}
        </section>
      ) : null}

      {!error && list.length > 0 ? (
        <ul className="space-y-3">
          {list.map((p) => (
            <li
              key={p.id}
              className="ash-surface p-4"
            >
              <p className="font-medium text-ash-text">{p.display_name}</p>
              <p className="mt-1 text-xs text-ash-muted">
                Pool id{" "}
                <code className="rounded bg-ash-body px-1 text-ash-text">{p.pool_id}</code>
                {p.pool_id === SAMPLE_POOL_ID ? " · sample pool" : null}
              </p>
              <div className="mt-3 flex flex-wrap gap-3 text-sm">
                <Link
                  href={`/participant/${p.id}`}
                  className="ash-link"
                >
                  Public profile
                </Link>
                <Link href={`/account/picks?participant=${p.id}`} className="ash-link">
                  Edit picks
                </Link>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {sample ? (
        <p className="mt-6 text-sm text-ash-muted">
          <Link href="/" className="ash-link">
            Home
          </Link>{" "}
          shows the sample pool leaderboard.
        </p>
      ) : null}
    </PageContainer>
  );
}
