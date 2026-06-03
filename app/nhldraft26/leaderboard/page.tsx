import { PageContainer } from "@/components/ui/PageContainer";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Leaderboard",
  description: "NHL Draft 2026 Pick'em leaderboard — updates after draft results are entered.",
};

export default function NhlDraft26LeaderboardPage() {
  return (
    <PageContainer compactBottom>
      <section className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-slate-950/80 via-slate-900/40 to-amber-950/25 px-5 py-8 sm:px-8">
        <h1 className="text-3xl font-bold tracking-tight text-ash-text">Leaderboard</h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-300">
          See how your board stacks up once the real draft results are in.
        </p>
      </section>

      <section className="ash-surface px-4 py-10 text-center sm:px-5">
        <p className="text-lg font-medium text-slate-200">
          Leaderboard will appear after draft results are entered.
        </p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500">
          Scoring and standings for this Pick&apos;em are separate from the main AshBracket World
          Cup pools and from the NHL playoff bracket section.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/nhldraft26/picks" className="btn-primary no-underline">
            Make my picks
          </Link>
          <Link href="/nhldraft26/rules" className="btn-ghost border-amber-500/25 no-underline">
            Rules
          </Link>
        </div>
      </section>
    </PageContainer>
  );
}
