import type { LiveBracketMatch } from "../../lib/bracket/liveBracketTracker";
import type { Team } from "../../src/types/domain";
import { LiveBracketMatchCard } from "./LiveBracketMatchCard";

type Props = {
  title: string;
  shortTitle: string;
  matches: LiveBracketMatch[];
  teamById: Map<string, Team>;
  matchEditHref?: string | null;
};

export function LiveRoundColumn({
  title,
  shortTitle,
  matches,
  teamById,
  matchEditHref,
}: Props) {
  return (
    <div className="flex min-w-[180px] shrink-0 flex-col border-r border-ash-border/40 pr-2 last:border-r-0 last:pr-0">
      <h3
        className="mb-2 shrink-0 text-center text-[10px] font-semibold uppercase tracking-wide text-ash-muted sm:text-xs"
        title={title}
      >
        <span className="sm:hidden">{shortTitle}</span>
        <span className="hidden sm:inline">{title}</span>
      </h3>
      <div className="flex flex-col gap-2">
        {matches.map((m) => (
          <LiveBracketMatchCard
            key={m.matchKey}
            match={m}
            teamById={teamById}
            matchEditHref={matchEditHref ?? undefined}
          />
        ))}
      </div>
    </div>
  );
}
