import Link from "next/link";

/**
 * Explains how live match scores reach `tournament_matches` before the daily update runs.
 * There is no in-app live score form yet — simulation uses a separate workflow.
 */
export function LiveMatchScoreEntryWorkflow() {
  return (
    <section className="ash-surface mb-6 space-y-3 border border-amber-700/40 bg-amber-950/15 p-4 text-sm text-ash-muted">
      <h2 className="text-base font-bold text-ash-text">Before you run the daily update</h2>
      <p className="leading-relaxed">
        <span className="font-medium text-ash-text">Recompute from stored scores</span> reads
        scores already stored on{" "}
        <code className="text-xs">tournament_matches</code> for the live official edition.
        For the primary workflow, use{" "}
        <Link href="/admin/tournament/live-scores" className="ash-link">
          Fetch latest scores
        </Link>{" "}
        to download finals from your provider, preview, and apply.
      </p>
      <div className="space-y-2">
        <p className="font-medium text-ash-text">Production-safe ways to enter a final score</p>
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>
            <span className="font-medium text-ash-text">Admin UI:</span>{" "}
            <Link href="/admin/tournament/match-stats" className="ash-link">
              Match scores &amp; team stats
            </Link>{" "}
            — enter home/away final scores and yellow/red card totals, then run{" "}
            <span className="font-medium text-ash-text">Recompute from stored scores</span>{" "}
            below.
          </li>
          <li>
            <span className="font-medium text-ash-text">CLI:</span> from the repo, run{" "}
            <code className="text-xs">npm run apply:live-match-score -- --match-code … --home … --away …</code>{" "}
            (see script header). Then run{" "}
            <span className="font-medium text-ash-text">Recompute from stored scores</span>{" "}
            below.
          </li>
          <li>
            <span className="font-medium text-ash-text">Supabase Table Editor:</span> edit the
            live edition row in{" "}
            <code className="text-xs">tournament_matches</code> — set{" "}
            <code className="text-xs">home_goals</code>, <code className="text-xs">away_goals</code>
            , and penalties if needed. Leave{" "}
            <code className="text-xs">sync_locked</code> false unless you are freezing the row.
          </li>
          <li>
            <span className="font-medium text-ash-text">Pilot / test only:</span>{" "}
            <Link href="/admin/simulation" className="ash-link">
              Simulation testing
            </Link>{" "}
            has preview/apply fake scores on an isolated simulation edition — never use that
            path for live pools.
          </li>
        </ol>
      </div>
      <p className="leading-relaxed">
        <Link href="/admin/results" className="ash-link">
          Tournament results (live)
        </Link>{" "}
        edits the <code className="text-xs">results</code> table (group 1st/2nd, knockout
        slots, R32) — not individual match scores. Use it to correct derived bracket outcomes
        or lock manual overrides after sync; it is not the normal daily score-entry path.
      </p>
      <p className="leading-relaxed">
        <span className="font-medium text-ash-text">Group-stage note:</span> pool points for
        group picks only move after sync writes both{" "}
        <code className="text-xs">group_winner</code> and{" "}
        <code className="text-xs">group_runner_up</code> for a group — that requires all six
        group fixtures to have final scores. Early group matches still update match rows and
        status; leaderboards change when a group completes or knockout results resolve.
      </p>
    </section>
  );
}
