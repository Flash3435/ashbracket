import { PageContainer } from "@/components/ui/PageContainer";
import { NHL_DRAFT26_PICK_COUNT } from "@/lib/nhldraft26/config";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Rules",
  description: "Scoring rules for the NHL Draft 2026 Pick'em game on AshBracket.",
};

export default function NhlDraft26RulesPage() {
  return (
    <PageContainer compactBottom>
      <section className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-slate-950/80 via-slate-900/40 to-amber-950/25 px-5 py-8 sm:px-8">
        <h1 className="text-3xl font-bold tracking-tight text-ash-text">Rules &amp; scoring</h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-300">
          You predict the first {NHL_DRAFT26_PICK_COUNT} selections of the 2026 NHL Draft in order.
          Points add up pick by pick; bonuses reward a sharp top of the board.
        </p>
      </section>

      <section className="ash-surface space-y-4 px-4 py-5 sm:px-5">
        <h2 className="text-lg font-semibold text-ash-text">Your entry</h2>
        <ul className="list-inside list-disc space-y-2 text-sm leading-relaxed text-slate-400">
          <li>Choose exactly {NHL_DRAFT26_PICK_COUNT} unique prospects from the published pool.</li>
          <li>Rank them pick 1 (first overall) through pick {NHL_DRAFT26_PICK_COUNT}.</li>
          <li>Submit before the draft deadline shown on the home page.</li>
        </ul>
      </section>

      <section className="ash-surface space-y-4 px-4 py-5 sm:px-5">
        <h2 className="text-lg font-semibold text-ash-text">Points per pick</h2>
        <ul className="list-inside list-disc space-y-2 text-sm leading-relaxed text-slate-400">
          <li>
            <span className="font-medium text-slate-200">Exact player at exact pick:</span> 5 points
          </li>
          <li>
            <span className="font-medium text-slate-200">Player drafted in the top 10, wrong spot:</span>{" "}
            2 points (once per player — best matching pick counts)
          </li>
          <li>
            <span className="font-medium text-slate-200">One pick away:</span> +1 bonus on top of the
            base points for that player (e.g. you had them at #4, they went #5)
          </li>
        </ul>
      </section>

      <section className="ash-surface space-y-4 px-4 py-5 sm:px-5">
        <h2 className="text-lg font-semibold text-ash-text">Bonuses</h2>
        <ul className="list-inside list-disc space-y-2 text-sm leading-relaxed text-slate-400">
          <li>
            <span className="font-medium text-slate-200">Perfect top 3:</span> +5 points if picks 1–3
            are all exact matches
          </li>
          <li>
            <span className="font-medium text-slate-200">Perfect top 10:</span> +20 points if every
            pick 1–{NHL_DRAFT26_PICK_COUNT} is an exact match
          </li>
        </ul>
        <p className="text-sm text-slate-500">
          Final tie-breakers and edge cases will be published before the draft. Leaderboard updates
          after official results are entered in admin.
        </p>
      </section>

      <p className="text-center text-sm text-slate-500">
        <Link href="/nhldraft26/picks" className="text-amber-300/90 no-underline hover:underline">
          Make my picks
        </Link>
        <span className="mx-2 text-slate-700" aria-hidden>
          ·
        </span>
        <Link
          href="/nhldraft26/leaderboard"
          className="text-amber-300/90 no-underline hover:underline"
        >
          Leaderboard
        </Link>
      </p>
    </PageContainer>
  );
}
