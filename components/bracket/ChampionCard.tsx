import { CountryFlagIcon } from "../tournament/Flag";
import type { LiveBracketTrackerModel } from "../../lib/bracket/liveBracketTracker";
import type { Team } from "../../src/types/domain";

type Props = {
  champion: LiveBracketTrackerModel["champion"];
  teamById: Map<string, Team>;
};

export function ChampionCard({ champion, teamById }: Props) {
  const tid = champion.teamId;
  const team = tid ? teamById.get(tid) : undefined;
  const picked = Boolean(tid && team);
  const muted =
    champion.eliminatedFromTournament ||
    champion.participantPickBadge === "your_pick_eliminated";
  const positive =
    champion.participantPickBadge === "your_pick" ||
    champion.participantPickBadge === "your_pick_alive";

  return (
    <div
      className={`rounded-lg border p-3 text-center ${
        muted
          ? "border-red-900/40 bg-red-950/20 opacity-80"
          : positive
            ? "border-ash-accent/50 bg-ash-accent/15 ring-1 ring-ash-accent/30"
            : "border-ash-border/70 bg-ash-body/30"
      }`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ash-muted">Champion</p>
      <span className="mt-2 inline-flex justify-center" aria-hidden>
        {picked ? (
          <CountryFlagIcon
            countryCode={team!.countryCode}
            size="lg"
            className={muted ? "opacity-60 grayscale" : undefined}
          />
        ) : (
          <span className="text-2xl leading-none">🏆</span>
        )}
      </span>
      <p
        className={`mt-2 truncate text-sm font-semibold ${
          muted ? "text-ash-muted" : picked ? "text-ash-text" : "text-ash-muted"
        }`}
        title={picked ? team!.name : undefined}
      >
        {picked ? team!.name : "TBD"}
      </p>
      {picked ? (
        <>
          <p className={`text-[11px] ${muted ? "text-ash-muted/80" : "text-ash-muted"}`}>
            {team!.countryCode}
          </p>
          {champion.participantPickBadge === "your_pick" ||
          champion.participantPickBadge === "your_pick_alive" ? (
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-ash-accent">
              Pick
            </p>
          ) : champion.participantPickBadge === "your_pick_eliminated" ? (
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-red-200">
              Pick out
            </p>
          ) : champion.tournamentOutcome === "advanced" ? (
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-200">
              Advanced
            </p>
          ) : champion.eliminatedFromTournament ? (
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-ash-muted">
              Eliminated
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
