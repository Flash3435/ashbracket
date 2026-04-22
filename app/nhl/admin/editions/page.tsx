import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { createClient } from "@/lib/supabase/server";
import { fetchAllNhlEditions } from "@/lib/nhl/queries";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function NhlAdminEditionsPage() {
  const supabase = await createClient();
  const { editions, error } = await fetchAllNhlEditions(supabase);

  return (
    <PageContainer compactBottom>
      <PageTitle
        title="NHL editions"
        description="Playoff product editions (one active row is used for setup and future bracket display)."
      />

      <p className="text-sm text-ash-muted">
        <Link href="/nhl/admin" className="ash-link">
          ← NHL admin overview
        </Link>
      </p>

      {error ? (
        <p className="rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      ) : null}

      {editions.length === 0 ? (
        <p className="text-sm text-ash-muted">
          No editions yet. Use{" "}
          <Link href="/nhl/admin" className="ash-link">
            Overview
          </Link>{" "}
          to create the default edition.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-blue-500/20">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead className="border-b border-blue-500/20 bg-slate-950/60 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-2">Season label</th>
                <th className="px-3 py-2">Slug</th>
                <th className="px-3 py-2">Active</th>
                <th className="px-3 py-2">Lock</th>
                <th className="px-3 py-2">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-blue-500/10 text-ash-text">
              {editions.map((e) => (
                <tr key={e.id} className="bg-slate-950/30">
                  <td className="px-3 py-2 font-medium">{e.season_label}</td>
                  <td className="px-3 py-2 font-mono text-xs text-ash-muted">{e.slug}</td>
                  <td className="px-3 py-2">{e.is_active ? "Yes" : "No"}</td>
                  <td className="px-3 py-2 text-ash-muted">
                    {e.lock_at ? new Date(e.lock_at).toLocaleString() : "—"}
                  </td>
                  <td className="px-3 py-2 text-ash-muted text-xs">
                    {new Date(e.updated_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageContainer>
  );
}
