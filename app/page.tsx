import Link from "next/link";
import { PublicLeaderboard } from "@/components/leaderboard/PublicLeaderboard";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { fetchSamplePoolLeaderboard } from "../lib/leaderboard/fetchSamplePoolLeaderboard";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { sections, error } = await fetchSamplePoolLeaderboard();

  return (
    <PageContainer>
      <PageTitle
        title="AshBracket"
        description="World Cup pool standings for the sample pool. Rankings use totals from the public score ledger — no private participant fields are shown."
      />

      <PublicLeaderboard
        errorMessage={error}
        sections={sections}
        nameLinks
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/rules"
          className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-zinc-300"
        >
          <h2 className="font-semibold text-zinc-900">Pool rules</h2>
          <p className="mt-1 text-sm leading-relaxed text-zinc-600">
            Scoring, deadlines, and tie-breakers for your pool.
          </p>
        </Link>
        <Link
          href="/join"
          className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-zinc-300"
        >
          <h2 className="font-semibold text-zinc-900">Join the pool</h2>
          <p className="mt-1 text-sm leading-relaxed text-zinc-600">
            Create an account, enter your join code, and link your leaderboard
            name.
          </p>
        </Link>
      </div>

      <p className="text-sm text-zinc-500">
        Organizers:{" "}
        <Link
          href="/admin"
          className="font-medium text-emerald-700 underline-offset-4 hover:underline"
        >
          Admin
        </Link>{" "}
        for pool setup and participants.
      </p>
    </PageContainer>
  );
}
