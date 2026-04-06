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
      <p className="mb-4 text-sm text-ash-muted">
        <Link href="/admin/tournament/status" className="ash-link">
          Tournament status
        </Link>
        <span>
          {" "}
          — edition details, counts, ledger freshness, locked rows.
        </span>
      </p>

      <PageTitle
        title="Tournament data"
        description="Official schedule and scores live in tournament_matches. Sync derives scoring results and recomputes standings. Knockout rows can carry scoring_* columns when you add them via seed or SQL."
      />

      <div className="ash-surface mb-6 space-y-2 p-4 text-sm text-ash-muted">
        <p>
          <span className="font-medium text-ash-text">Edition:</span>{" "}
          {edition
            ? `${edition.name} (${edition.code})`
            : `Not loaded — run npm run seed:wc2026 with a service role key.`}
        </p>
        <p>
          <span className="font-medium text-ash-text">Matches in DB:</span>{" "}
          {matchCount ?? "—"}
        </p>
        <p>
          <span className="font-medium text-ash-text">
            Group matches marked finished:
          </span>{" "}
          {edition ? finishedGroupMatches : "—"}
        </p>
      </div>

      <div className="ash-surface flex flex-col gap-4 p-4">
        <p className="text-sm text-ash-muted">
          Enter scores in Supabase (or via a future API adapter calling{" "}
          <code className="rounded bg-ash-body px-1 text-xs text-ash-text">
            syncOfficialTournament(..., {"{"} patches: [...] {"}"})
          </code>
          ). Set <code className="rounded bg-ash-body px-1 text-ash-text">sync_locked</code>{" "}
          on a match row to freeze automated score updates for that match.
        </p>
        <form action={runTournamentSyncAction}>
          <button type="submit" className="btn-primary">
            Run sync → scoring results → standings
          </button>
        </form>
      </div>

      <p className="mt-8 text-sm text-ash-muted">
        <Link href="/admin" className="ash-link">
          ← Admin home
        </Link>
      </p>
    </PageContainer>
  );
}
