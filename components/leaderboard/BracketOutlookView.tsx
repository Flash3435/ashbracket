import {
  BRACKET_OUTLOOK_DISCLAIMER,
  BRACKET_OUTLOOK_HEADLINE,
  BRACKET_OUTLOOK_INTRO,
  BRACKET_OUTLOOK_OFFICIAL_NOTE,
  formatBracketOutlookDetailLine,
  type ClientSafeBracketOutlookEntry,
} from "@/lib/leaderboard/buildBracketOutlook";
import { LeaderboardWaitingState } from "./LeaderboardWaitingState";

type Props = {
  poolName: string;
  entries: ClientSafeBracketOutlookEntry[];
  entryCount: number;
  revealHref?: string | null;
  /** When false, show waiting state instead (no completed results or no meaningful outlook). */
  showOutlook: boolean;
};

export function BracketOutlookView({
  poolName,
  entries,
  entryCount,
  revealHref = null,
  showOutlook,
}: Props) {
  if (!showOutlook) {
    return (
      <LeaderboardWaitingState
        poolName={poolName}
        entryCount={entryCount}
        revealHref={revealHref}
      />
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-amber-500/25 bg-amber-950/15 px-5 py-6 sm:px-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-200/80">
          Unofficial early read
        </p>
        <h2 className="mt-2 text-lg font-bold text-ash-text sm:text-xl">
          {BRACKET_OUTLOOK_HEADLINE}
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ash-muted">
          {BRACKET_OUTLOOK_INTRO}
        </p>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ash-muted">
          {BRACKET_OUTLOOK_OFFICIAL_NOTE}
        </p>
        <p className="mt-3 max-w-3xl text-xs leading-relaxed text-ash-muted">
          {BRACKET_OUTLOOK_DISCLAIMER}
        </p>
      </section>

      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-ash-text">Looking strong so far</h3>
          <p className="mt-1 text-xs text-ash-muted">
            Sorted by helpful completed results, then path teams helped. Not official
            standings.
          </p>
        </div>

        <ol className="space-y-3">
          {entries.map((entry, index) => (
            <li
              key={`${entry.displayName}-${index}`}
              className="rounded-lg border border-ash-border/70 bg-ash-body/25 px-4 py-3"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium text-ash-text">
                  <span className="mr-2 tabular-nums text-ash-muted">{index + 1}.</span>
                  {entry.displayName}
                </p>
                <p className="text-sm text-ash-muted">
                  {formatBracketOutlookDetailLine(entry)}
                </p>
              </div>
              <p className="mt-1 text-xs text-ash-muted">
                {entry.displayName}&apos;s bracket is looking strong based on completed
                group results so far.
              </p>
            </li>
          ))}
        </ol>
      </section>

      <p className="text-xs text-ash-muted">{poolName}</p>
    </div>
  );
}
