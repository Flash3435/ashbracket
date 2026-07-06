import {
  adminOutcomeToneClassName,
  resolveAdminMatchOutcomeSummary,
} from "../../../lib/bracket/adminBracketDisplay";
import type { LiveBracketMatch } from "../../../lib/bracket/liveBracketTracker";
import type { Team } from "../../../src/types/domain";

type Props = {
  match: LiveBracketMatch;
  teamById: Map<string, Team>;
};

export function MatchOutcomeSummary({ match, teamById }: Props) {
  const summary = resolveAdminMatchOutcomeSummary(match, teamById);
  return (
    <p
      className={`border-t border-ash-border/35 px-1.5 py-1 text-[9px] leading-snug ${adminOutcomeToneClassName(summary.tone)}`}
    >
      {summary.text}
    </p>
  );
}
