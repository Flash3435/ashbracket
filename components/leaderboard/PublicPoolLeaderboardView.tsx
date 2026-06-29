import Link from "next/link";
import {
  buildPublicPoolLeaderboardPresentation,
  poolLeaderboardSummaryCards,
  type PublicPoolLeaderboardRowDisplay,
} from "@/lib/leaderboard/buildPublicPoolLeaderboardPresentation";
import { buildViewerLeaderComparison } from "@/lib/leaderboard/buildViewerLeaderComparison";
import { JumpToMyLeaderboardRowButton } from "./JumpToMyLeaderboardRowButton";
import { ViewerLeaderComparisonSummary } from "./ViewerLeaderComparisonSummary";
import { LiveScoresUpdateNotice } from "../tournament/LiveScoresUpdateNotice";
import type { LeaderboardPublicRow } from "../../types/leaderboard";
import type { PoolPublicStats } from "../../lib/pool/fetchPoolPublicStats";
import { PoolPublicStatsSummary } from "../pool/PoolPublicStatsSummary";
import { ViewerYouChip } from "../ui/ViewerYouChip";
import { formatUsdCents } from "@/lib/format/usdCents";
import { LEADERBOARD_AWARDED_POINTS_NOTE } from "@/lib/leaderboard/buildPoolStandingsFromLedger";
import { poolLeaderboardIsActiveFromRows } from "@/lib/leaderboard/poolLeaderboardIsActive";
import { LeaderboardPostLockIntro } from "./LeaderboardPostLockIntro";
import { BracketOutlookView } from "./BracketOutlookView";
import type { BracketOutlookSummary } from "@/lib/leaderboard/bracketOutlookSeparation";
import { TournamentStatLeadersPanel } from "@/components/tournament/TournamentStatLeadersPanel";
import type { TournamentStatLeadersView } from "@/lib/tournament/matchTeamStats/buildTournamentStatLeadersView";
import { participantPublicProfileHref } from "@/lib/participant/participantProfileRouting";

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

function rowSurfaceClass(
  row: PublicPoolLeaderboardRowDisplay,
  isViewerRow: boolean,
): string {
  let base: string;
  if (row.podium === "gold") {
    base = "border-l-4 border-amber-500/80 bg-amber-500/[0.08]";
  } else if (row.podium === "silver") {
    base = "border-l-4 border-slate-400/70 bg-slate-400/[0.06]";
  } else if (row.podium === "bronze") {
    base = "border-l-4 border-orange-500/70 bg-orange-500/[0.06]";
  } else {
    base = "border-l-4 border-transparent";
  }

  if (isViewerRow && row.podium == null) {
    return `${base} ring-1 ring-inset ring-sky-400/25 bg-gradient-to-r from-sky-500/[0.07] to-transparent`;
  }

  return base;
}

function viewerRowScrollProps(isViewerRow: boolean): {
  "data-viewer-leaderboard-entry"?: true;
  tabIndex?: -1;
  className?: string;
} {
  if (!isViewerRow) return {};
  return {
    "data-viewer-leaderboard-entry": true,
    tabIndex: -1,
    className: "scroll-mt-24",
  };
}

function participantNameCell(
  row: PublicPoolLeaderboardRowDisplay,
  isViewerRow: boolean,
) {
  return (
    <>
      <span className="inline-flex max-w-full flex-wrap items-center gap-2">
        <span className="font-medium text-ash-text">{row.displayName}</span>
        {isViewerRow ? <ViewerYouChip /> : null}
      </span>
      {row.isTiedAtRank ? (
        <p className="mt-0.5 text-xs text-ash-border-hover">Tied at rank {row.rank}</p>
      ) : null}
    </>
  );
}

function participantProfileLink(
  row: PublicPoolLeaderboardRowDisplay,
  isViewerRow: boolean,
  className: string,
  wrapper?: "block" | "inline",
) {
  const href = participantPublicProfileHref(row.participantId);
  const content =
    wrapper === "block" ? (
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {rankCell(row)}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-ash-text">{row.displayName}</p>
              {isViewerRow ? <ViewerYouChip /> : null}
            </div>
            {row.isTiedAtRank ? (
              <p className="text-xs text-ash-muted">Tied at rank {row.rank}</p>
            ) : null}
          </div>
        </div>
        <span className="text-xl font-bold tabular-nums text-ash-text">
          {row.pointsLabel}
        </span>
      </div>
    ) : (
      participantNameCell(row, isViewerRow)
    );

  if (!href) {
    return <div className={className}>{content}</div>;
  }

  return (
    <Link href={href} className={className}>
      {content}
    </Link>
  );
}

type Props = {
  poolName: string;
  rows: LeaderboardPublicRow[];
  stats: PoolPublicStats | null;
  statsError: string | null;
  leaderboardError: string | null;
  /** Set when the signed-in user has a claimed participant row in this pool. */
  viewerParticipantId?: string | null;
  /** Live pools only: last successful daily score update for the official tournament. */
  liveScoresLastUpdatedAt?: string | null;
  /** When true, show post-lock intro with optional reveal link. */
  picksLocked?: boolean;
  revealHref?: string | null;
  /** Public page vs signed-in member view for a private pool. */
  audience?: "public" | "member";
 bonusWatchView?: TournamentStatLeadersView | null;
  /** Pre-points Bracket Outlook summary (display names + counts only). */
  bracketOutlookSummary?: BracketOutlookSummary | null;
  showBracketOutlook?: boolean;
  decisiveResultCount?: number;
};

export function PublicPoolLeaderboardView({
  poolName,
  rows,
  stats,
  statsError,
  leaderboardError,
  viewerParticipantId = null,
  liveScoresLastUpdatedAt = null,
  picksLocked = false,
  revealHref = null,
  audience = "public",
 bonusWatchView = null,
  bracketOutlookSummary = null,
  showBracketOutlook = false,
  decisiveResultCount = 0,
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
  const leaderboardActive = poolLeaderboardIsActiveFromRows(rows);
  const viewerComparison = buildViewerLeaderComparison(rows, viewerParticipantId);
  const hasViewerRow =
    viewerParticipantId != null &&
    presentation.rows.some((r) => r.participantId === viewerParticipantId);


  if (presentation.participantCount > 0 && !leaderboardActive) {
    return (
      <div className="space-y-8">
        {picksLocked ? (
          <LeaderboardPostLockIntro revealHref={revealHref} />
        ) : null}
        <BracketOutlookView
          poolName={poolName}
          entryCount={presentation.participantCount}
          decisiveResultCount={decisiveResultCount}
          revealHref={revealHref}
          showOutlook={showBracketOutlook && bracketOutlookSummary != null}
          summary={bracketOutlookSummary}
        />
      </div>
    );
  }

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
      {picksLocked ? (
        <LeaderboardPostLockIntro revealHref={revealHref} />
      ) : null}
      {bonusWatchView ? (
        <TournamentStatLeadersPanel variant="user" view={bonusWatchView} />
      ) : null}
      <section className="ash-surface relative overflow-hidden px-5 py-5 sm:px-6 sm:py-6">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(22,163,74,0.14),transparent_45%),linear-gradient(180deg,rgba(255,255,255,0.03),transparent_70%)]" />
        <div className="relative space-y-4">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-ash-border/70 bg-ash-body/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-ash-muted">
              {audience === "member" ? "Pool standings" : " Public leaderboard"}
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
              and a full scoring breakdown.
            </p>
            <LiveScoresUpdateNotice
              lastUpdatedAt={liveScoresLastUpdatedAt}
              className="mt-4 max-w-3xl"
            />
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
          {hasViewerRow ? (
            <div className="space-y-3">
              {viewerComparison ? (
                <ViewerLeaderComparisonSummary comparison={viewerComparison} />
              ) : null}
              <JumpToMyLeaderboardRowButton />
            </div>
          ) : null}
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
            awarded points. Tied totals share the same rank.
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
              {presentation.rows.map((row) => {
                const isViewerRow =
                  viewerParticipantId != null &&
                  row.participantId === viewerParticipantId;

                const scrollProps = viewerRowScrollProps(isViewerRow);

                return (
                <tr
                  key={row.participantId}
                  className={`${rowSurfaceClass(row, isViewerRow)} ${scrollProps.className ?? ""}`.trim()}
                  aria-current={isViewerRow ? "true" : undefined}
                  data-viewer-leaderboard-entry={scrollProps["data-viewer-leaderboard-entry"]}
                  tabIndex={scrollProps.tabIndex}
                >
                  <td className="px-4 py-3.5">{rankCell(row)}</td>
                  <td className="px-4 py-3.5">
                    {participantProfileLink(
                      row,
                      isViewerRow,
                      "inline-block underline-offset-2 hover:text-ash-accent hover:underline",
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <span className="text-lg font-bold tabular-nums text-ash-text">
                      {row.pointsLabel}
                    </span>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <ul className="space-y-3 md:hidden">
          {presentation.rows.map((row) => {
            const isViewerRow =
              viewerParticipantId != null &&
              row.participantId === viewerParticipantId;

            const scrollProps = viewerRowScrollProps(isViewerRow);

            return (
            <li
              key={row.participantId}
              className={scrollProps.className}
              data-viewer-leaderboard-entry={scrollProps["data-viewer-leaderboard-entry"]}
              tabIndex={scrollProps.tabIndex}
              aria-current={isViewerRow ? "true" : undefined}
            >
              {participantProfileLink(
                row,
                isViewerRow,
                `block rounded-xl border border-ash-border/70 px-4 py-4 transition-colors hover:bg-ash-body/40 ${rowSurfaceClass(row, isViewerRow)}`,
                "block",
              )}
            </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
