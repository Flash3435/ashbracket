import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { createClient } from "@/lib/supabase/server";
import { fetchActiveNhlEdition, fetchNhlTeamsForEdition } from "@/lib/nhl/queries";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function NhlAdminTeamsPage() {
  const supabase = await createClient();
  const { edition, error: edErr } = await fetchActiveNhlEdition(supabase);

  const teamsRes =
    edition && !edErr
      ? await fetchNhlTeamsForEdition(supabase, edition.id)
      : { teams: [], error: null as string | null };

  return (
    <PageContainer compactBottom>
      <PageTitle
        title="NHL teams"
        description="Teams belong to the active edition. Starter seed is illustrative, not official league data."
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

      {teamsRes.error ? (
        <p className="rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {teamsRes.error}
        </p>
      ) : null}

      {edition && !teamsRes.error ? (
        <>
          <p className="text-sm text-ash-muted">
            Active edition:{" "}
            <span className="font-medium text-ash-text">{edition.season_label}</span> (
            <code className="text-xs">{edition.slug}</code>)
          </p>
          {teamsRes.teams.length === 0 ? (
            <p className="text-sm text-ash-muted">
              No teams yet. Run “Load starter NHL teams” on the overview.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-blue-500/20">
              <table className="min-w-full border-collapse text-left text-sm">
                <thead className="border-b border-blue-500/20 bg-slate-950/60 text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-3 py-2">Abbr</th>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Conference</th>
                    <th className="px-3 py-2">Division</th>
                    <th className="px-3 py-2">Seed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-blue-500/10 text-ash-text">
                  {teamsRes.teams.map((t) => (
                    <tr key={t.id} className="bg-slate-950/30">
                      <td className="px-3 py-2 font-mono text-xs">{t.abbreviation}</td>
                      <td className="px-3 py-2">{t.team_name}</td>
                      <td className="px-3 py-2 capitalize">{t.conference}</td>
                      <td className="px-3 py-2 text-ash-muted">{t.division ?? "—"}</td>
                      <td className="px-3 py-2 text-ash-muted">{t.seed ?? "—"}</td>
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
