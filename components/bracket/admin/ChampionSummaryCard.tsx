import { CountryFlagIcon } from "../../tournament/Flag";
import {
  adminOutcomeToneClassName,
  resolveAdminChampionSummaryLine,
} from "../../../lib/bracket/adminBracketDisplay";
import type { LiveBracketTrackerModel } from "../../../lib/bracket/liveBracketTracker";
import type { Team } from "../../../src/types/domain";

type Props = {
  champion: LiveBracketTrackerModel["champion"];
  teamById: Map<string, Team>;
};

export function ChampionSummaryCard({ champion, teamById }: Props) {
  const summary = resolveAdminChampionSummaryLine(champion, teamById);
  const tid = champion.teamId;
  const team = tid ? teamById.get(tid) : undefined;
  const picked = Boolean(tid && team);
  const muted =
    champion.eliminatedFromTournament ||
    champion.participantPickBadge === "your_pick_eliminated" ||
    champion.participantPickBadge === "your_pick_wrong_path";
  const positive =
    champion.participantPickBadge === "your_pick" ||
    champion.participantPickBadge === "your_pick_alive";

  return (
    <div
      className={`rounded-lg border p-4 ${
        muted
          ? "border-red-900/40 bg-red-950/20"
          : positive
            ? "border-ash-accent/50 bg-ash-accent/10 ring-1 ring-ash-accent/25"
            : "border-ash-border/70 bg-ash-body/30"
      }`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ash-muted">Champion</p>
      {picked ? (
        <div className="mt-3 flex items-center gap-2">
          <CountryFlagIcon
            countryCode={team!.countryCode}
            size="md"
            className={muted ? "opacity-60 grayscale" : undefined}
          />
          <p
            className={`min-w-0 truncate text-sm font-semibold ${
              muted ? "text-ash-muted" : "text-ash-text"
            }`}
            title={team!.name}
          >
            {team!.name}
          </p>
        </div>
      ) : (
        <p className="mt-3 text-2xl leading-none" aria-hidden>
          🏆
        </p>
      )}
      <p
        className={`mt-3 text-xs leading-snug ${adminOutcomeToneClassName(summary.tone)}`}
      >
        {summary.line}
      </p>
    </div>
  );
}
