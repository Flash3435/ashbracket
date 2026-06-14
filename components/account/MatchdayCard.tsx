import Link from "next/link";
import { KickoffTimeDisplay } from "@/components/datetime/KickoffTimeDisplay";
import type { CheerSuggestion } from "@/lib/account/buildWhoToCheerFor";
import { matchdayBracketWantsLabel } from "@/lib/account/buildMatchday";
import type { RecentScoreImpactItem } from "@/lib/account/loadRecentScoreImpactForDashboard";
import { formatTournamentMatchScoreLine } from "@/lib/tournament/matchScoreDisplay";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { Team } from "../../src/types/domain";
import { ScheduleMatchPickTeams } from "@/components/tournament/ScheduleMatchPickTeams";

type Props = {
  suggestions: CheerSuggestion[];
  tournamentErr: string | null;
  hasMatchesToday: boolean;
  usingUpcomingFallback: boolean;
  hasAnyPick: boolean;
  picksIncomplete: boolean;
  activityHref: string;
  leaderboardHref: string | null;
  leaderboardPendingNote?: string | null;
  scheduleHref?: string;
  recentScoreImpact: RecentScoreImpactItem[];
  initialSlots?: KnockoutPickSlotDraft[];
  teams?: Team[];
};

function statusBadgeClass(status: string): string {
  switch (status) {
    case "live":
      return "rounded-full border border-red-800/60 bg-red-950/50 px-2 py-0.5 text-[10px] font-medium text-red-200";
    case "postponed":
      return "rounded-full bg-amber-950/50 px-2 py-0.5 text-[10px] font-medium text-amber-100";
    default:
      return "";
  }
}

function statusBadgeLabel(status: string): string | null {
  if (status === "live") return "Live";
  if (status === "postponed") return "Postponed";
  return null;
}

function matchStatusLine(s: CheerSuggestion): string | null {
  const scoreLine = formatTournamentMatchScoreLine(s.match);
  if (s.status === "finished" && scoreLine !== "—") {
    return `Final: ${scoreLine}`;
  }
  if (s.status === "live" && scoreLine !== "—") {
    return `Live: ${scoreLine}`;
  }
  if (s.status === "finished") {
    return "Final";
  }
  return null;
}

function MatchdayCheerRow({ s, hasAnyPick }: { s: CheerSuggestion; hasAnyPick: boolean }) {
  const wants = matchdayBracketWantsLabel(s);
  const statusLine = matchStatusLine(s);

  return (
    <div className="mt-2">
      {statusLine ? (
        <p className="text-sm font-medium text-ash-text">{statusLine}</p>
      ) : null}
      {hasAnyPick ? (
        <>
          <p className="mt-1 text-sm text-ash-text">
            <span className="text-ash-muted">Your bracket wants: </span>
            <span className={wants.muted ? "text-ash-muted" : "font-medium"}>
              {wants.primary}
            </span>
          </p>
          <p className="mt-0.5 text-xs text-ash-muted">{s.reason}</p>
        </>
      ) : null}
    </div>
  );
}

function RecentScoreImpactBlock({
  items,
  leaderboardHref,
}: {
  items: RecentScoreImpactItem[];
  leaderboardHref: string | null;
}) {
  if (items.length === 0) return null;

  return (
    <div className="mt-4 border-t border-ash-border pt-4">
      <h3 className="text-sm font-semibold text-ash-text">Recent score impact</h3>
      <ul className="mt-2 space-y-3">
        {items.map((item) => (
          <li key={item.id}>
            <p className="text-sm font-medium text-ash-text">{item.headline}</p>
            {item.detailLines.map((line) => (
              <p key={line} className="mt-0.5 text-xs text-ash-muted">
                {line}
              </p>
            ))}
            {item.showLeaderboardLink && leaderboardHref ? (
              <Link href={leaderboardHref} className="ash-link mt-1 inline-block text-xs">
                View leaderboard
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MatchdayCard({
  suggestions,
  tournamentErr,
  hasMatchesToday,
  usingUpcomingFallback,
  hasAnyPick,
  picksIncomplete,
  activityHref,
  leaderboardHref,
  leaderboardPendingNote = null,
  scheduleHref = "/tournament",
  recentScoreImpact,
  initialSlots,
  teams,
}: Props) {
  const pickContext =
    hasAnyPick &&
    initialSlots &&
    teams &&
    initialSlots.length > 0 &&
    teams.length > 0
      ? { slots: initialSlots, teams }
      : null;

  const showMatches = !tournamentErr && suggestions.length > 0;

  return (
    <section className="rounded-xl border border-ash-border bg-ash-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-ash-text">Matchday</h2>
          <p className="mt-0.5 text-xs text-ash-muted">
            Follow today&apos;s matches and see what your bracket is watching.
          </p>
        </div>
        <Link href={scheduleHref} className="ash-link shrink-0 text-xs">
          Full schedule
        </Link>
      </div>

      {picksIncomplete ? (
        <div className="mt-3 rounded-md border border-amber-700/40 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
          Picks are locked. Your bracket was incomplete.
        </div>
      ) : null}

      {tournamentErr ? (
        <p className="mt-3 text-sm text-amber-200" role="status">
          Schedule could not be loaded ({tournamentErr}).
        </p>
      ) : null}

      {!tournamentErr && !showMatches ? (
        <p className="mt-3 text-sm text-ash-muted">
          {usingUpcomingFallback || !hasMatchesToday
            ? "No matches today. Check the full schedule."
            : "No matches to show right now."}
        </p>
      ) : null}

      {showMatches ? (
        <ul className="mt-3 divide-y divide-ash-border">
          {suggestions.map((s) => {
            const meta = [s.stageLabel];
            if (s.groupCode) meta.push(`Group ${s.groupCode}`);
            const badgeClass = statusBadgeClass(s.status);
            const badgeLabel = statusBadgeLabel(s.status);
            const statusLine = matchStatusLine(s);

            return (
              <li key={s.matchId} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] text-ash-muted">{meta.join(" · ")}</p>
                  {badgeClass && badgeLabel ? (
                    <span className={badgeClass}>{badgeLabel}</span>
                  ) : null}
                </div>
                {!statusLine ? (
                  <KickoffTimeDisplay
                    iso={s.kickoffAt}
                    layout="split"
                    dateClassName="mt-1 text-sm font-medium text-ash-text"
                    timeClassName="text-xs text-ash-muted"
                    className="mt-1 text-xs text-ash-muted"
                  />
                ) : null}
                <ScheduleMatchPickTeams
                  m={s.match}
                  pickContext={pickContext}
                  className="mt-2"
                />
                <MatchdayCheerRow s={s} hasAnyPick={hasAnyPick} />
              </li>
            );
          })}
        </ul>
      ) : null}

      {leaderboardPendingNote ? (
        <p className="mt-3 text-xs text-ash-muted">{leaderboardPendingNote}</p>
      ) : null}

      <RecentScoreImpactBlock items={recentScoreImpact} leaderboardHref={leaderboardHref} />

      <div className="mt-4 flex flex-wrap gap-3 text-sm">
        <Link href={activityHref} className="ash-link">
          View activity
        </Link>
        {leaderboardHref ? (
          <Link href={leaderboardHref} className="ash-link">
            Leaderboard
          </Link>
        ) : null}
        <Link href={scheduleHref} className="ash-link">
          Full schedule
        </Link>
      </div>
    </section>
  );
}
