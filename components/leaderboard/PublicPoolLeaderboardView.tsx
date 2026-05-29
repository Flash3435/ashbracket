import Link from "next/link";
import {
  buildPublicPoolLeaderboardPresentation,
  poolLeaderboardSummaryCards,
  type PublicPoolLeaderboardRowDisplay,
} from "@/lib/leaderboard/buildPublicPoolLeaderboardPresentation";
import type { LeaderboardPublicRow } from "../../types/leaderboard";
import type { PoolPublicStats } from "../../lib/pool/fetchPoolPublicStats";
import { PoolPublicStatsSummary } from "../pool/PoolPublicStatsSummary";
import { formatUsdCents } from "@/lib/format/usdCents";

function summaryCard(label: string, value: string, hint: string) {
  return (
    <div className="rounded-xl border border-ash-border/70 bg-ash-body/25 px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ash-muted">
        {label}
      </p>
      <p className="mt-2 line-clamp-2 text-lg font-semibold leading-snug text-ash-text sm:text-xl">
        {value}
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-ash-muted">{hint}</p>
    </div>
  );
}

function rankCell(row: PublicPoolLeaderboardRowDisplay) {
  const base =
    "inline-flex min-w-[2.25rem] items-center justify-center rounded-full px-2 py-0.5 text-sm font-bold tabular-nums";

  if (row.podium === "gold") {
    return (
      <span className={`${base} border border-amber-500/50 bg-amber-500/20 text-amber-100`}>
        {row.rank}
      </span>
    );
  }
  if (row.podium === "silver") {
    return (
      <span className={`${base} border border-slate-400/40 bg-slate-500/15 text-slate-200`}>
        {row.rank}
      </span>
    );
  }
  if (row.podium === "bronze") {
    return (
      <span className={`${base} border border-orange-500/40 bg-orange-600/15 text-orange-100`}>
        {row.rank}
      </span>
    );
  }

  return (
    <span className={`${base} border border-ash-border/60 bg-ash-body/40 text-ash-muted`}>
      {row.rank}
    </span>
  );
}

function rowSurfaceClass(row: PublicPoolLeaderboardRowDisplay): string {
  if (row.podium === "gold") {
    return "border-l-4 border-amber-500/80 bg-amber-500/[0.08]";
  }
  if (row.podium === "silver") {
    return "border-l-4 border-slate-400/70 bg-slate-400/[0.06]";
  }
  if (row.podium === "bronze") {
    return "border-l-4 border-orange-500/70 bg-orange-500/[0.06]";
  }
  return "border-l-4 border-transparent";
}

type Props = {
  poolName: string;
  rows: LeaderboardPublicRow[];
  stats: PoolPublicStats | null;
  statsError: string | null;
  leaderboardError: string | null;
};

export function PublicPoolLeaderboardView({
  poolName,
  rows,
  stats,
  statsError,
  leaderboardError,
}: Props) {
  if (leaderboardError) {
    return (
      <p
        className="rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200"
        role="alert"
      >
        Could not load the leaderboard: {leaderboardError}
      </p>
    );
  }

  const presentation = buildPublicPoolLeaderboardPresentation(rows);
  const cards = poolLeaderboardSummaryCards(presentation, stats);

  if (presentation.participantCount === 0) {
    return (
      <div className="space-y-8">
        <section className="ash-surface px-5 py-8 text-center sm:px-8">
          <p className="text-3xl" aria-hidden>
            🏆
          </p>
          <h2 className="mt-4 text-xl font-bold text-ash-text">{poolName}</h2>
          <p className="mt-2 text-sm text-ash-muted">
            No participants on the public leaderboard yet. Entries appear here after
            people join and the pool is open for standings.
          </p>
          <Link href="/rules" className="ash-link mt-4 inline-block text-sm">
            View pool rules
          </Link>
        </section>
        <PoolPublicStatsSummary
          poolLabel={poolName}
          stats={stats}
          errorMessage={statsError}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8 sm:space-y-10">
      <section className="ash-surface relative overflow-hidden px-5 py-5 sm:px-6 sm:py-6">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(22,163,74,0.14),transparent_45%),linear-gradient(180deg,rgba(255,255,255,0.03),transparent_70%)]" />
        <div className="relative space-y-4">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-ash-border/70 bg-ash-body/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-ash-muted">
              Public leaderboard
            </span>
            {stats?.prizePoolCents != null && stats.entryFeeCents != null ? (
              <span className="rounded-full border border-emerald-500/30 bg-emerald-950/25 px-3 py-1 text-[11px] font-semibold text-emerald-100">
                Est. prize {formatUsdCents(stats.prizePoolCents)}
              </span>
            ) : null}
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-ash-text sm:text-4xl">
              {poolName}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ash-muted sm:text-base">
              See who is leading, how tight the race is, and tap any name for picks
              and a full scoring breakdown. Totals update when official results are
              saved and this pool recalculates — we do not show a “last updated” time
              on this page.
            </p>
            {presentation.allScoresZero ? (
              <p className="mt-2 text-sm text-amber-100/90">
                Everyone is still at zero — the board will come alive as match results
                award points.
              </p>
            ) : null}
          </div>
          <p className="text-sm">
            <Link href="/rules" className="ash-link">
              Pool rules & scoring
            </Link>
          </p>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCard("Current leader", cards.leaderLine, cards.leaderHint)}
        {summaryCard("Race for 2nd", cards.raceLine, cards.raceHint)}
        {summaryCard("On the board", cards.progressLine, cards.progressHint)}
        {summaryCard("Entries", cards.entriesLine, cards.entriesHint)}
      </section>

      <PoolPublicStatsSummary
        poolLabel={poolName}
        stats={stats}
        errorMessage={statsError}
      />

      <section className="space-y-4 border-t border-ash-border/50 pt-2">
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ash-muted">
            Standings
          </p>
          <h2 className="text-2xl font-bold tracking-tight text-ash-text">
            Leaderboard
          </h2>
          <p className="max-w-3xl text-sm leading-relaxed text-ash-muted">
            {presentation.participantCount}{" "}
            {presentation.participantCount === 1 ? "entry" : "entries"} ranked by
            total points. Tied totals share the same rank.
          </p>
        </div>

        <div className="hidden overflow-hidden rounded-xl border border-ash-border/70 md:block">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ash-border bg-ash-body/50 text-xs font-medium uppercase tracking-wide text-ash-muted">
              <tr>
                <th className="w-20 px-4 py-3">Rank</th>
                <th className="px-4 py-3">Participant</th>
                <th className="px-4 py-3 text-right">Points</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ash-border/60">
              {presentation.rows.map((row) => (
                <tr key={row.participantId} className={rowSurfaceClass(row)}>
                  <td className="px-4 py-3.5">{rankCell(row)}</td>
                  <td className="px-4 py-3.5">
                    <Link
                      href={`/participant/${row.participantId}`}
                      className="font-medium text-ash-text underline-offset-2 hover:text-ash-accent hover:underline"
                    >
                      {row.displayName}
                    </Link>
                    {row.isTiedAtRank ? (
                      <p className="mt-0.5 text-xs text-ash-border-hover">
                        Tied at rank {row.rank}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <span className="text-lg font-bold tabular-nums text-ash-text">
                      {row.pointsLabel}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ul className="space-y-3 md:hidden">
          {presentation.rows.map((row) => (
            <li key={row.participantId}>
              <Link
                href={`/participant/${row.participantId}`}
                className={`block rounded-xl border border-ash-border/70 px-4 py-4 transition-colors hover:bg-ash-body/40 ${rowSurfaceClass(row)}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {rankCell(row)}
                    <div className="min-w-0">
                      <p className="font-semibold text-ash-text">{row.displayName}</p>
                      {row.isTiedAtRank ? (
                        <p className="text-xs text-ash-muted">Tied at rank {row.rank}</p>
                      ) : null}
                    </div>
                  </div>
                  <span className="text-xl font-bold tabular-nums text-ash-text">
                    {row.pointsLabel}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
