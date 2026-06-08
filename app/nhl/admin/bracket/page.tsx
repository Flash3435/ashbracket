import { BracketBoard } from "./BracketBoard";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { buildNhlAdminBracketViewModel } from "@/lib/nhl/bracketViewModel";
import { getOfficial2026EditionTeamStatus } from "@/lib/nhl/official2026Edition";
import {
  fetchActiveNhlEdition,
  fetchNhlSeriesRowsForEdition,
  fetchNhlTeamSlugsForEdition,
} from "@/lib/nhl/queries";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function NhlAdminBracketPage() {
  const supabase = await createClient();
  const { edition, error: edErr } = await fetchActiveNhlEdition(supabase);

  const seriesRes =
    edition && !edErr
      ? await fetchNhlSeriesRowsForEdition(supabase, edition.id)
      : { rows: [], error: null as string | null };

  const slugRes =
    edition && !edErr
      ? await fetchNhlTeamSlugsForEdition(supabase, edition.id)
      : { slugs: [] as string[], error: null as string | null };

  const fieldStatus =
    edition && !edErr && !slugRes.error
      ? slugRes.slugs.length > 0
        ? getOfficial2026EditionTeamStatus(slugRes.slugs.map((s) => ({ team_slug: s })))
        : "empty"
      : null;

  const model =
    seriesRes.rows.length > 0 ? buildNhlAdminBracketViewModel(seriesRes.rows) : null;

  return (
    <PageContainer compactBottom>
      <PageTitle
        title="Bracket"
        description="Read-only playoff tree for the active edition. Pairings and winners come from NHL series rows; use the series table for row-level inspection."
      />

      <p className="text-sm text-ash-muted">
        <Link href="/nhl/admin" className="ash-link">
          ← Overview
        </Link>
        {" · "}
        <Link href="/nhl/admin/series" className="ash-link">
          Series table
        </Link>
      </p>

      {edErr ? (
        <p className="rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {edErr}
        </p>
      ) : null}

      {!edition ? (
        <p className="text-sm text-ash-muted">
          No active edition. Create one from the{" "}
          <Link href="/nhl/admin" className="ash-link">
            overview
          </Link>
          .
        </p>
      ) : null}

      {seriesRes.error ? (
        <p className="rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {seriesRes.error}
        </p>
      ) : null}

      {edition && !seriesRes.error ? (
        <>
          <p className="text-sm text-ash-muted">
            <span className="font-medium text-ash-text">{edition.season_label}</span>{" "}
            <code className="text-xs text-slate-500">({edition.slug})</code>
          </p>
          {fieldStatus === "official_2026" ? (
            <p className="mt-2 rounded-md border border-emerald-800/50 bg-emerald-950/25 px-3 py-2 text-sm text-emerald-100/95">
              Official 2026 playoff field: Round 1 shows seeded pairings from the database; later
              rounds show TBD until teams advance.
            </p>
          ) : null}
          {!model ? (
            <p className="mt-4 text-sm text-ash-muted">
              No series rows for this edition. If this environment still needs structure, create
              the bracket skeleton from{" "}
              <Link href="/nhl/admin" className="ash-link">
                Overview
              </Link>{" "}
              → Maintenance.
            </p>
          ) : (
            <div className="mt-6">
              <BracketBoard model={model} />
            </div>
          )}
        </>
      ) : null}
    </PageContainer>
  );
}
