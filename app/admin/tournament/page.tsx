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
          — see team and match counts, last sync time, and whether standings
          look current.
        </span>
      </p>

      <PageTitle
        title="Tournament data"
        description="Bring in official match scores and turn them into results your pool can score against. After a successful sync, everyone’s points and the public leaderboard are updated."
      />

      <div className="ash-surface mb-6 space-y-2 p-4 text-sm text-ash-muted">
        <p>
          <span className="font-medium text-ash-text">Edition:</span>{" "}
          {edition
            ? `${edition.name} (${edition.code})`
            : "Not loaded yet — the official schedule needs to be installed. Contact whoever set up this site."}
        </p>
        <p>
          <span className="font-medium text-ash-text">Matches on file:</span>{" "}
          {matchCount ?? "—"}
        </p>
        <p>
          <span className="font-medium text-ash-text">
            Group-stage matches marked finished:
          </span>{" "}
          {edition ? finishedGroupMatches : "—"}
        </p>
      </div>

      <div className="ash-surface flex flex-col gap-4 p-4">
        <p className="text-sm text-ash-muted">
          Match scores are usually updated where your tournament data is
          maintained. You can <span className="font-medium text-ash-text">freeze</span>{" "}
          a match so automated sync skips it and leaves your manual score in
          place.
        </p>
        <form action={runTournamentSyncAction}>
          <button type="submit" className="btn-primary">
            Sync tournament and update standings
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
