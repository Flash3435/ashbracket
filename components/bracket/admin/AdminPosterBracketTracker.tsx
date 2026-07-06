import type { LiveBracketMatch, LiveBracketTrackerModel } from "../../../lib/bracket/liveBracketTracker";
import type { Team } from "../../../src/types/domain";
import { AdminBracketMatchCard } from "./AdminBracketMatchCard";
import { AdminParticipantPicksSummary } from "./AdminParticipantPicksSummary";
import { ChampionSummaryCard } from "./ChampionSummaryCard";

type Props = {
  tracker: LiveBracketTrackerModel;
  teamById: Map<string, Team>;
  matchEditHref?: string | null;
};

function AdminRoundColumn({
  title,
  shortTitle,
  matches,
  teamById,
  matchEditHref,
  wideGap = false,
}: {
  title: string;
  shortTitle: string;
  matches: LiveBracketMatch[];
  teamById: Map<string, Team>;
  matchEditHref?: string | null;
  wideGap?: boolean;
}) {
  return (
    <div className="flex min-w-[184px] shrink-0 flex-col">
      <h3
        className="mb-2 shrink-0 text-center text-[10px] font-semibold uppercase tracking-wide text-ash-muted sm:text-xs"
        title={title}
      >
        <span className="sm:hidden">{shortTitle}</span>
        <span className="hidden sm:inline">{title}</span>
      </h3>
      <div className={`flex flex-col ${wideGap ? "gap-4" : "gap-2"}`}>
        {matches.map((m) => (
          <AdminBracketMatchCard
            key={m.matchKey}
            match={m}
            teamById={teamById}
            matchEditHref={matchEditHref}
            compact={!wideGap}
          />
        ))}
      </div>
    </div>
  );
}

export function AdminPosterBracketTracker({ tracker, teamById, matchEditHref }: Props) {
  return (
    <div className="space-y-4">
      <AdminParticipantPicksSummary tracker={tracker} teamById={teamById} />

      <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
        <div
          className="min-w-0 flex-1 overflow-x-auto rounded-xl border border-ash-border bg-ash-body/20 p-3 sm:p-4"
          role="region"
          aria-label="Admin participant bracket"
        >
          <p className="mb-2 text-[10px] text-ash-muted xl:hidden">
            Scroll horizontally to see all rounds →
          </p>
          <div className="flex w-max min-w-full flex-nowrap gap-4 pb-1">
            <AdminRoundColumn
              title="Round of 32"
              shortTitle="R32"
              matches={tracker.roundOf32}
              teamById={teamById}
              matchEditHref={matchEditHref}
            />
            <AdminRoundColumn
              title="Round of 16"
              shortTitle="R16"
              matches={tracker.roundOf16}
              teamById={teamById}
              matchEditHref={matchEditHref}
            />
            <AdminRoundColumn
              title="Quarter-finals"
              shortTitle="QF"
              matches={tracker.quarterfinals}
              teamById={teamById}
              matchEditHref={matchEditHref}
              wideGap
            />
            <AdminRoundColumn
              title="Semi-finals"
              shortTitle="SF"
              matches={tracker.semifinals}
              teamById={teamById}
              matchEditHref={matchEditHref}
              wideGap
            />
            <AdminRoundColumn
              title="Final"
              shortTitle="F"
              matches={tracker.final}
              teamById={teamById}
              matchEditHref={matchEditHref}
              wideGap
            />
          </div>
          {tracker.finalHelperCopy ? (
            <p className="mt-3 text-center text-[10px] leading-snug text-ash-muted">
              {tracker.finalHelperCopy}
            </p>
          ) : null}
        </div>

        {tracker.showChampionCard ? (
          <aside className="w-full shrink-0 xl:sticky xl:top-4 xl:w-56">
            <ChampionSummaryCard champion={tracker.champion} teamById={teamById} />
          </aside>
        ) : null}
      </div>
    </div>
  );
}
