import { PageContainer } from "@/components/ui/PageContainer";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin",
  description: "NHL Draft 2026 Pick'em admin overview.",
};

export default function NhlDraft26AdminHomePage() {
  return (
    <PageContainer compactBottom>
      <section className="ash-surface space-y-3 px-4 py-5 sm:px-5">
        <h1 className="text-2xl font-bold text-ash-text">NHL Draft 2026 admin</h1>
        <p className="text-sm leading-relaxed text-slate-400">
          Isolated admin for the Draft Pick&apos;em — not linked from the main AshBracket admin
          dashboard.
        </p>
        <ul className="list-inside list-disc space-y-2 text-sm text-slate-400">
          <li>
            <strong className="font-medium text-slate-300">Prospects:</strong> edit the curated
            pool (currently seed data in{" "}
            <code className="rounded bg-slate-900 px-1 text-xs">lib/nhldraft26/prospectsSeed.ts</code>
            ).
          </li>
          <li>
            <strong className="font-medium text-slate-300">Results:</strong> enter official picks
            1–10 and trigger leaderboard recompute.
          </li>
        </ul>
        <p className="text-xs text-amber-200/80">
          TODO: wire database tables{" "}
          <code className="rounded bg-slate-900 px-1">nhl_draft26_prospects</code>,{" "}
          <code className="rounded bg-slate-900 px-1">nhl_draft26_entries</code>,{" "}
          <code className="rounded bg-slate-900 px-1">nhl_draft26_picks</code>,{" "}
          <code className="rounded bg-slate-900 px-1">nhl_draft26_results</code>.
        </p>
      </section>
    </PageContainer>
  );
}
