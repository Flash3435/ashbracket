import Link from "next/link";
import {
  CountryFlagIcon,
  CountryFlagPlaceholder,
} from "../tournament/Flag";
import type { LiveBracketMatch, LiveBracketSide } from "../../lib/bracket/liveBracketTracker";
import { NOT_YOUR_PICK_BADGE_LABEL, WRONG_PATH_PICK_BADGE_LABEL } from "../../lib/bracket/knockoutBracketDisplayCopy";
import {
  liveSideNameClassName,
  liveSideNeedsMutedFlag,
  liveSideRowClassName,
  liveSideShowsFlag,
} from "../../lib/bracket/liveBracketSideStyles";
import type { Team } from "../../src/types/domain";

function TournamentOutcomeBadge({ outcome }: { outcome: LiveBracketSide["tournamentOutcome"] }) {
  if (outcome === "advanced") {
    return (
      <span className="shrink-0 rounded bg-emerald-950/50 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-200 ring-1 ring-emerald-800/50">
        Advanced
      </span>
    );
  }
  if (outcome === "eliminated") {
    return (
      <span className="shrink-0 rounded bg-ash-body/80 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-ash-muted ring-1 ring-ash-border/60">
        Eliminated
      </span>
    );
  }
  return null;
}

function ParticipantPickBadge({ pick }: { pick: LiveBracketSide["participantPick"] }) {
  if (pick === "your_pick" || pick === "your_pick_alive") {
    return (
      <span className="shrink-0 rounded bg-ash-accent/25 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-ash-accent ring-1 ring-ash-accent/35">
        Your pick
      </span>
    );
  }
  if (pick === "your_pick_eliminated") {
    return (
      <span className="shrink-0 rounded bg-red-950/50 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-red-200 ring-1 ring-red-900/40">
        Pick out
      </span>
    );
  }
  if (pick === "your_pick_wrong_path") {
    return (
      <span className="shrink-0 rounded bg-amber-950/50 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-200 ring-1 ring-amber-900/40">
        {WRONG_PATH_PICK_BADGE_LABEL}
      </span>
    );
  }
  if (pick === "not_your_pick") {
    return (
      <span
        className="shrink-0 rounded bg-ash-body/70 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-ash-muted ring-1 ring-ash-border/50"
        title={NOT_YOUR_PICK_BADGE_LABEL}
      >
        {NOT_YOUR_PICK_BADGE_LABEL}
      </span>
    );
  }
  return null;
}

function LiveSideRow({
  side,
  teamById,
}: {
  side: LiveBracketSide;
  teamById: Map<string, Team>;
}) {
  const team = side.teamId ? teamById.get(side.teamId) : undefined;
  const showFlag = liveSideShowsFlag(side);
  const muted = liveSideNeedsMutedFlag(side);
  const isPlaceholder = side.fillState !== "team";

  return (
    <div
      className={`flex min-h-[44px] items-center gap-2 rounded-md border px-2 py-1.5 ${liveSideRowClassName(side)}`}
      title={side.helperTooltip ?? undefined}
    >
      {showFlag ? (
        <CountryFlagIcon
          countryCode={team!.countryCode}
          size="md"
          className={muted ? "opacity-60 grayscale" : undefined}
        />
      ) : isPlaceholder ? null : (
        <CountryFlagPlaceholder size="md" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1">
          <p className={`min-w-0 truncate ${liveSideNameClassName(side)}`}>
            {side.displayName}
          </p>
          <ParticipantPickBadge pick={side.participantPick} />
          <TournamentOutcomeBadge outcome={side.tournamentOutcome} />
        </div>
        {showFlag && team ? (
          <p className={`truncate text-[10px] ${muted ? "text-ash-muted/80" : "text-ash-muted"}`}>
            {side.countryCode ?? team.countryCode}
          </p>
        ) : null}
      </div>
    </div>
  );
}

type Props = {
  match: LiveBracketMatch;
  teamById: Map<string, Team>;
  matchEditHref?: string | null;
};

export function LiveBracketMatchCard({ match, teamById, matchEditHref }: Props) {
  const label = match.fifaMatchNo > 0 ? `M${match.fifaMatchNo}` : match.matchKey;
  const showScore =
    match.scoreLine &&
    match.scoreLine !== "—" &&
    (match.status === "finished" || match.status === "live");

  const inner = (
    <div className="flex w-[168px] shrink-0 flex-col gap-1 rounded-lg border border-ash-border/55 bg-ash-body/25 p-2 shadow-sm sm:w-[178px]">
      <div className="text-center">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-ash-muted">
          {label}
        </p>
        {showScore ? (
          <p className="mt-0.5 text-[11px] font-semibold tabular-nums text-ash-text">
            {match.scoreLine}
            {match.statusLabel ? (
              <span className="ml-1 font-medium text-ash-muted">· {match.statusLabel}</span>
            ) : null}
          </p>
        ) : match.statusLabel ? (
          <p className="mt-0.5 text-[10px] font-medium text-ash-muted">{match.statusLabel}</p>
        ) : null}
      </div>
      <LiveSideRow side={match.home} teamById={teamById} />
      <LiveSideRow side={match.away} teamById={teamById} />
    </div>
  );

  if (matchEditHref) {
    return (
      <Link
        href={matchEditHref}
        className="block rounded-lg outline-none ring-ash-accent/30 focus-visible:ring-2"
      >
        {inner}
      </Link>
    );
  }
  return inner;
}
