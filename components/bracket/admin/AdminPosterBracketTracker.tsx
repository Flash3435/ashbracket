import type { LiveBracketMatch, LiveBracketTrackerModel } from "../../../lib/bracket/liveBracketTracker";
import type { Team } from "../../../src/types/domain";
import {
  ADMIN_BRACKET_CARD_WIDTH_PX,
  ADMIN_BRACKET_CHAMPION_COLUMN_MIN_WIDTH_PX,
  ADMIN_BRACKET_COLUMN_MIN_WIDTH_PX,
} from "./adminBracketLayout";
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
    <div
      className="flex shrink-0 flex-col"
      style={{ minWidth: ADMIN_BRACKET_COLUMN_MIN_WIDTH_PX }}
    >
      <h3
        className="mb-2 shrink-0 text-center text-[10px] font-semibold uppercase tracking-wide text-ash-muted sm:text-xs"
        title={title}
      >
        <span className="sm:hidden">{shortTitle}</span>
        <span className="hidden sm:inline">{title}</span>
      </h3>
      <div className={`flex flex-col ${wideGap ? "gap-5" : "gap-2.5"}`}>
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

function AdminChampionColumn({
  champion,
  teamById,
  wideGap,
}: {
  champion: LiveBracketTrackerModel["champion"];
  teamById: Map<string, Team>;
  wideGap?: boolean;
}) {
  return (
    <div
      className="flex shrink-0 flex-col border-l border-ash-border/45 pl-5"
      style={{ minWidth: ADMIN_BRACKET_CHAMPION_COLUMN_MIN_WIDTH_PX }}
    >
      <h3
        className="mb-2 shrink-0 text-center text-[10px] font-semibold uppercase tracking-wide text-ash-muted sm:text-xs"
        title="Champion"
      >
        Champion
      </h3>
      <div
        className={`sticky top-20 ${wideGap ? "pt-6" : "pt-2"}`}
        style={{ minWidth: ADMIN_BRACKET_CARD_WIDTH_PX }}
      >
        <ChampionSummaryCard champion={champion} teamById={teamById} />
      </div>
    </div>
  );
}

export function AdminPosterBracketTracker({ tracker, teamById, matchEditHref }: Props) {
  return (
    <div className="w-full space-y-4">
      <AdminParticipantPicksSummary tracker={tracker} teamById={teamById} />

      <div
        className="w-full overflow-x-auto rounded-xl border border-ash-border bg-ash-body/20 p-3 sm:p-5"
        role="region"
        aria-label="Admin participant bracket"
      >
        <p className="mb-3 text-[10px] text-ash-muted lg:hidden">
          Scroll horizontally to see all rounds →
        </p>
        <div className="flex w-max min-w-full flex-nowrap items-start gap-5 pb-1 lg:gap-6">
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
          {tracker.showChampionCard ? (
            <AdminChampionColumn
              champion={tracker.champion}
              teamById={teamById}
              wideGap
            />
          ) : null}
        </div>
        {tracker.finalHelperCopy ? (
          <p className="mt-4 text-center text-[10px] leading-snug text-ash-muted">
            {tracker.finalHelperCopy}
          </p>
        ) : null}
      </div>
    </div>
  );
}
