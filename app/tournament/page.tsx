import Link from "next/link";
import { TournamentProgressView } from "@/components/tournament/TournamentProgressView";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { fetchPublicTournamentProgress } from "../../lib/tournament/fetchPublicTournamentProgress";
import { OFFICIAL_EDITION_CODE } from "../../lib/config/officialTournament";

export const dynamic = "force-dynamic";

export default async function TournamentProgressPage() {
  const { data, error } = await fetchPublicTournamentProgress();

  return (
    <PageContainer>
      <PageTitle
        title="Tournament progress"
        description="Official schedule and scores from the database. This page is public and does not include pool picks or admin tools."
      />

      {error ? (
        <div
          className="mb-6 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"
          role="alert"
        >
          <p className="font-medium">Could not load tournament data</p>
          <p className="mt-1 text-red-800">{error}</p>
          <p className="mt-2 text-xs text-red-800/90">
            If you are hosting this app, apply the latest Supabase migration (views{" "}
            <code className="rounded bg-red-100/80 px-1">tournament_editions_public</code>,{" "}
            <code className="rounded bg-red-100/80 px-1">tournament_public_matches</code>
            ) so anonymous readers can load official rows safely.
          </p>
        </div>
      ) : null}

      {!error && data && !data.edition && data.matches.length === 0 ? (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <p className="font-medium">No official tournament yet</p>
          <p className="mt-1">
            There is no edition with code{" "}
            <code className="rounded bg-amber-100/80 px-1 text-xs">
              {OFFICIAL_EDITION_CODE}
            </code>{" "}
            and no public match rows. Seed the World Cup schedule from the organizer
            tooling when you are ready.
          </p>
        </div>
      ) : null}

      {!error && data && (data.edition || data.matches.length > 0) ? (
        <TournamentProgressView payload={data} />
      ) : null}

      <p className="mt-8 text-sm text-zinc-500">
        <Link href="/" className="font-medium text-emerald-700 underline-offset-4 hover:underline">
          Home
        </Link>
        {" · "}
        <Link
          href="/rules"
          className="text-emerald-700 underline-offset-4 hover:underline"
        >
          Rules
        </Link>
      </p>
    </PageContainer>
  );
}
