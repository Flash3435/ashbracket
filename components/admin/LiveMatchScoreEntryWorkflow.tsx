import Link from "next/link";

/**
 * Explains how live match scores reach `tournament_matches` before recompute runs.
 */
export function LiveMatchScoreEntryWorkflow() {
  return (
    <section className="ash-surface mb-6 space-y-3 border border-amber-700/40 bg-amber-950/15 p-4 text-sm text-ash-muted">
      <h2 className="text-base font-bold text-ash-text">Before you run the daily update</h2>
      <p className="leading-relaxed">
        Use{" "}
        <Link href="/admin/tournament/match-stats" className="ash-link">
          Match stats
        </Link>{" "}
        to enter final scores and team card totals, or use the{" "}
        <Link href="/admin/tournament/live-scores" className="ash-link">
          live score fetch
        </Link>{" "}
        workflow if configured. Then run{" "}
        <span className="font-medium text-ash-text">Recompute from stored scores</span>{" "}
        below.
      </p>
      <div className="space-y-2">
        <p className="font-medium text-ash-text">Workflow</p>
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>
            <span className="font-medium text-ash-text">Option A — Fetch latest scores:</span>{" "}
            <Link href="/admin/tournament/live-scores" className="ash-link">
              Open live score fetch
            </Link>{" "}
            to download finals from your provider, preview, and apply.
          </li>
          <li>
            <span className="font-medium text-ash-text">Option B — Enter manually:</span>{" "}
            <Link href="/admin/tournament/match-stats" className="ash-link">
              Open match stats
            </Link>{" "}
            to enter home/away final scores and yellow/red card totals per match.
          </li>
          <li>
            <span className="font-medium text-ash-text">Then — Recompute:</span> run{" "}
            <span className="font-medium text-ash-text">Recompute from stored scores</span>{" "}
            below to rebuild derived results and live pool leaderboards.
          </li>
        </ol>
      </div>
      <details className="rounded-md border border-ash-border/60 bg-ash-body/20 px-3 py-2">
        <summary className="cursor-pointer font-medium text-ash-text">
          Advanced / fallback score entry
        </summary>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>
            <span className="font-medium text-ash-text">CLI:</span>{" "}
            <code className="text-xs">npm run apply:live-match-score -- --match-code … --home … --away …</code>
          </li>
          <li>
            <span className="font-medium text-ash-text">Supabase Table Editor:</span> edit{" "}
            <code className="text-xs">tournament_matches</code> directly for the live edition.
          </li>
          <li>
            <span className="font-medium text-ash-text">Pilot / test only:</span>{" "}
            <Link href="/admin/simulation" className="ash-link">
              Simulation testing
            </Link>{" "}
            — isolated simulation edition only, never for live pools.
          </li>
        </ul>
      </details>
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
