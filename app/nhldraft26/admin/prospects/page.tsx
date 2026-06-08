import { PageContainer } from "@/components/ui/PageContainer";
import { getNhlDraft26ProspectPool } from "@/lib/nhldraft26/prospects";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin · Prospects",
  description: "Manage NHL Draft 2026 prospect pool.",
};

export default function NhlDraft26AdminProspectsPage() {
  const prospects = getNhlDraft26ProspectPool();

  return (
    <PageContainer compactBottom>
      <section className="ash-surface space-y-4 px-4 py-5 sm:px-5">
        <h1 className="text-2xl font-bold text-ash-text">Prospect pool</h1>
        <p className="text-sm text-slate-400">
          Read-only preview of the current seed list. Admin editing will move to{" "}
          <code className="rounded bg-slate-900 px-1 text-xs">nhl_draft26_prospects</code>.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-600/60 text-slate-400">
                <th className="py-2 pr-3 font-medium">Rank</th>
                <th className="py-2 pr-3 font-medium">Name</th>
                <th className="py-2 pr-3 font-medium">Pos</th>
                <th className="py-2 pr-3 font-medium">Country</th>
                <th className="py-2 pr-3 font-medium">Team / league</th>
                <th className="py-2 font-medium">ID</th>
              </tr>
            </thead>
            <tbody>
              {prospects.map((p) => (
                <tr key={p.id} className="border-b border-slate-700/40">
                  <td className="py-2 pr-3 text-slate-300">{p.consensusRank}</td>
                  <td className="py-2 pr-3 text-ash-text">{p.name}</td>
                  <td className="py-2 pr-3 text-slate-400">{p.position}</td>
                  <td className="py-2 pr-3 text-slate-400">{p.country}</td>
                  <td className="py-2 pr-3 text-slate-400">{p.teamLeague}</td>
                  <td className="py-2 font-mono text-xs text-slate-500">{p.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </PageContainer>
  );
}
