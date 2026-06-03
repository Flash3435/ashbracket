import { PageContainer } from "@/components/ui/PageContainer";
import { NHL_DRAFT26_PICK_COUNT } from "@/lib/nhldraft26/config";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin · Results",
  description: "Enter NHL Draft 2026 official results for scoring.",
};

export default function NhlDraft26AdminResultsPage() {
  return (
    <PageContainer compactBottom>
      <section className="ash-surface space-y-4 px-4 py-5 sm:px-5">
        <h1 className="text-2xl font-bold text-ash-text">Draft results</h1>
        <p className="text-sm leading-relaxed text-slate-400">
          Enter the official first {NHL_DRAFT26_PICK_COUNT} selections after the draft. Results will
          be stored in{" "}
          <code className="rounded bg-slate-900 px-1 text-xs">nhl_draft26_results</code> and used to
          recompute the Pick&apos;em leaderboard.
        </p>
        <p className="rounded-lg border border-dashed border-amber-500/30 bg-amber-950/20 px-4 py-8 text-center text-sm text-amber-100/90">
          TODO: results entry form and scoring recompute — not implemented in this MVP pass.
        </p>
      </section>
    </PageContainer>
  );
}
