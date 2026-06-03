import { PageContainer } from "@/components/ui/PageContainer";
import { NHL_DRAFT26_EVENT } from "@/lib/nhldraft26/config";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Home",
  description:
    "Predict the top 10 picks in the 2026 NHL Draft — AshBracket NHL Draft Pick'em.",
};

export default function NhlDraft26HomePage() {
  return (
    <PageContainer compactBottom>
      <section className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-slate-950/80 via-slate-900/40 to-amber-950/30 px-5 py-8 shadow-lg shadow-amber-950/20 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-amber-300/90">
          NHL Draft 2026
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-ash-text sm:text-4xl">
          NHL Draft Pick&apos;em
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-300">
          Predict the top 10 picks in the 2026 NHL Draft. Choose from a curated prospect pool,
          rank your picks from #1 through #10, and score points when the real draft matches your
          board.
        </p>
        <p className="mt-3 text-sm text-slate-400">
          <span className="font-medium text-slate-300">Draft:</span>{" "}
          {NHL_DRAFT26_EVENT.draftDateLabel}
        </p>
        <p className="mt-1 text-sm text-slate-400">
          <span className="font-medium text-slate-300">Deadline:</span>{" "}
          {NHL_DRAFT26_EVENT.picksDeadlineLabel}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/nhldraft26/picks" className="btn-primary no-underline">
            Make my picks
          </Link>
          <Link href="/nhldraft26/leaderboard" className="btn-ghost border-amber-500/25 no-underline">
            View leaderboard
          </Link>
          <Link href="/nhldraft26/rules" className="btn-ghost border-amber-500/25 no-underline">
            Rules
          </Link>
        </div>
      </section>

      <section className="ash-surface px-4 py-5 sm:px-5">
        <h2 className="text-lg font-semibold text-ash-text">How it works</h2>
        <ul className="mt-3 list-inside list-disc space-y-2 text-sm leading-relaxed text-slate-400">
          <li>Select 10 prospects from the published pool — no free-form names.</li>
          <li>Order them as you think the draft will fall from pick 1 to pick 10.</li>
          <li>Earn points for exact picks, players in your top 10, and bonus slabs.</li>
          <li>Leaderboard updates after official results are entered.</li>
        </ul>
        <p className="mt-3 text-xs text-slate-500">{NHL_DRAFT26_EVENT.prospectPoolNote}</p>
      </section>
    </PageContainer>
  );
}
