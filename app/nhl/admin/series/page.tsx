import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { createClient } from "@/lib/supabase/server";
import {
  fetchActiveNhlEdition,
  fetchNhlSeriesRowsForEdition,
} from "@/lib/nhl/queries";
import Link from "next/link";

export const dynamic = "force-dynamic";

function sideLabel(side: string | null): string {
  if (side === "cup") return "Cup";
  if (side === "east" || side === "west") return side.charAt(0).toUpperCase() + side.slice(1);
  return "—";
}

export default async function NhlAdminSeriesPage() {
  const supabase = await createClient();
  const { edition, error: edErr } = await fetchActiveNhlEdition(supabase);

  const seriesRes =
    edition && !edErr
      ? await fetchNhlSeriesRowsForEdition(supabase, edition.id)
      : { rows: [], error: null as string | null };

  return (
    <PageContainer compactBottom>
      <PageTitle
        title="NHL series"
        description="Bracket slots by round. Team columns fill in once matchups are assigned."
      />

      <p className="text-sm text-ash-muted">
        <Link href="/nhl/admin" className="ash-link">
          ← NHL admin overview
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
            Active edition:{" "}
            <span className="font-medium text-ash-text">{edition.season_label}</span>
          </p>
          {seriesRes.rows.length === 0 ? (
            <p className="text-sm text-ash-muted">
              No series rows yet. Run “Create empty bracket skeleton” on the overview.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-blue-500/20">
              <table className="min-w-full border-collapse text-left text-sm">
                <thead className="border-b border-blue-500/20 bg-slate-950/60 text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-3 py-2">Round</th>
                    <th className="px-3 py-2">Slot</th>
                    <th className="px-3 py-2">Side</th>
                    <th className="px-3 py-2">Higher seed</th>
                    <th className="px-3 py-2">Lower seed</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Winner</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-blue-500/10 text-ash-text">
                  {seriesRes.rows.map((r) => (
                    <tr key={r.id} className="bg-slate-950/30">
                      <td className="px-3 py-2 font-mono text-xs">{r.round_code}</td>
                      <td className="px-3 py-2 tabular-nums">{r.slot_index}</td>
                      <td className="px-3 py-2 text-ash-muted">{sideLabel(r.side_or_conference)}</td>
                      <td className="px-3 py-2 text-ash-muted">
                        {r.higher_team_abbr ?? "—"}
                        {r.higher_team_name ? (
                          <span className="block text-xs text-slate-500">{r.higher_team_name}</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-ash-muted">
                        {r.lower_team_abbr ?? "—"}
                        {r.lower_team_name ? (
                          <span className="block text-xs text-slate-500">{r.lower_team_name}</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 capitalize">
                        {r.status.replaceAll("_", " ")}
                      </td>
                      <td className="px-3 py-2 text-ash-muted">
                        {r.winner_team_abbr ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </PageContainer>
  );
}
