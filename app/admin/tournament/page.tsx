import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import Link from "next/link";
import { OFFICIAL_EDITION_CODE } from "../../../lib/config/officialTournament";
import { runTournamentSyncAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminTournamentPage() {
  const supabase = await createClient();

  const { data: edition } = await supabase
    .from("tournament_editions")
    .select("id, name, code")
    .eq("code", OFFICIAL_EDITION_CODE)
    .maybeSingle();

  let matchCount: number | null = null;
  let finishedGroupMatches = 0;
  if (edition?.id) {
    const { count } = await supabase
      .from("tournament_matches")
      .select("id", { count: "exact", head: true })
      .eq("edition_id", edition.id);
    matchCount = count ?? 0;

    const { count: fg } = await supabase
      .from("tournament_matches")
      .select("id", { count: "exact", head: true })
      .eq("edition_id", edition.id)
      .eq("stage_code", "group")
      .eq("status", "finished");
    finishedGroupMatches = fg ?? 0;
  }

  return (
    <PageContainer>
      <p className="mb-4 text-sm">
        <Link
          href="/admin/tournament/status"
          className="font-medium text-emerald-700 underline-offset-4 hover:underline"
        >
          Tournament status
        </Link>
        <span className="text-zinc-600">
          {" "}
          — edition details, counts, ledger freshness, locked rows.
        </span>
      </p>

      <PageTitle
        title="Tournament data"
        description="Official schedule and scores live in tournament_matches. Sync derives scoring results and recomputes standings. Knockout rows can carry scoring_* columns when you add them via seed or SQL."
      />

      <div className="mb-6 space-y-2 rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-700 shadow-sm">
        <p>
          <span className="font-medium text-zinc-900">Edition:</span>{" "}
          {edition
            ? `${edition.name} (${edition.code})`
            : `Not loaded — run npm run seed:wc2026 with a service role key.`}
        </p>
        <p>
          <span className="font-medium text-zinc-900">Matches in DB:</span>{" "}
          {matchCount ?? "—"}
        </p>
        <p>
          <span className="font-medium text-zinc-900">
            Group matches marked finished:
          </span>{" "}
          {edition ? finishedGroupMatches : "—"}
        </p>
      </div>

      <div className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
        <p className="text-sm text-zinc-600">
          Enter scores in Supabase (or via a future API adapter calling{" "}
          <code className="rounded bg-zinc-100 px-1 text-xs">
            syncOfficialTournament(..., {"{"} patches: [...] {"}"})
          </code>
          ). Set <code className="rounded bg-zinc-100 px-1">sync_locked</code>{" "}
          on a match row to freeze automated score updates for that match.
        </p>
        <form action={runTournamentSyncAction}>
          <button
            type="submit"
            className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-800"
          >
            Run sync → scoring results → standings
          </button>
        </form>
      </div>

      <p className="mt-8 text-sm text-zinc-500">
        <Link href="/admin" className="text-emerald-700 underline-offset-4 hover:underline">
          ← Admin home
        </Link>
      </p>
    </PageContainer>
  );
}
