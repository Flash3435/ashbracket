import Link from "next/link";
import { deriveParticipantBracket } from "../../lib/bracket/deriveParticipantBracket";
import {
  buildLiveBracketTracker,
  type LiveBracketMatch,
  type LiveBracketTrackerModel,
} from "../../lib/bracket/liveBracketTracker";
import { shouldUseLiveBracketTracker } from "../../lib/bracket/resolveLiveBracketTrackerMode";
import type { ParticipantBracketModel } from "../../lib/bracket/types";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { Team } from "../../src/types/domain";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import { BracketMatchCard } from "./BracketMatchCard";
import { LiveBracketMatchCard } from "./LiveBracketMatchCard";
import { LockedLaterRoundsPanel } from "./LockedLaterRoundsPanel";
import { CountryFlagIcon } from "../tournament/Flag";
import { PreRoundOf32BracketBanner } from "../picks/PreRoundOf32BracketBanner";

type Props = {
  slots: KnockoutPickSlotDraft[];
  teams: Team[];
  knockoutBracketPicksUnlocked: boolean;
  /** Official schedule — grays out teams eliminated in completed knockout matches. */
  tournamentMatches?: TournamentMatchPublicRow[] | null;
  /** Optional: link to `/account/picks?participant=…` for the owner. */
  editPicksHref?: string | null;
  /** Optional: list view on summary / snapshot pages. */
  listViewHref?: string | null;
  /** Hide edit links on read-only snapshots. */
  readOnly?: boolean;
};

function LiveRoundColumn({
  title,
  shortTitle,
  matches,
  teamById,
  matchEditHref,
}: {
  title: string;
  shortTitle: string;
  matches: LiveBracketMatch[];
  teamById: Map<string, Team>;
  matchEditHref?: string | null;
}) {
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

function RoundColumn({
  title,
  shortTitle,
  matches,
  teamById,
  matchEditHref,
  eliminatedTeamIds,
}: {
  title: string;
  shortTitle: string;
  matches: ParticipantBracketModel["roundOf32"];
  teamById: Map<string, Team>;
  matchEditHref?: string | null;
  eliminatedTeamIds: Set<string>;
}) {
  return (
    <div className="flex min-w-[168px] shrink-0 flex-col border-r border-ash-border/40 pr-2 last:border-r-0 last:pr-0">
      <h3
        className="mb-2 shrink-0 text-center text-[10px] font-semibold uppercase tracking-wide text-ash-muted sm:text-xs"
        title={title}
      >
        <span className="sm:hidden">{shortTitle}</span>
        <span className="hidden sm:inline">{title}</span>
      </h3>
      <div className="flex flex-col gap-2">
        {matches.map((m) => (
          <BracketMatchCard
            key={m.matchKey}
            match={m}
            teamById={teamById}
            matchEditHref={matchEditHref ?? undefined}
            eliminatedTeamIds={eliminatedTeamIds}
          />
        ))}
      </div>
    </div>
  );
}

function LiveChampionCell({
  champion,
  teamById,
}: {
  champion: LiveBracketTrackerModel["champion"];
  teamById: Map<string, Team>;
}) {
  const tid = champion.teamId;
  const team = tid ? teamById.get(tid) : undefined;
  const picked = Boolean(tid && team);
  const muted = champion.eliminatedFromTournament || champion.participantPickBadge === "your_pick_eliminated";
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
            : picked
              ? "border-ash-border/70 bg-ash-body/30"
              : "border-ash-border/70 bg-ash-body/30"
      }`}
    >
      <span className="inline-flex justify-center" aria-hidden>
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
        className={`mt-2 text-sm font-semibold ${
          muted ? "text-ash-muted" : picked ? "text-ash-text" : "text-ash-muted"
        }`}
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
              Your pick
            </p>
          ) : champion.participantPickBadge === "your_pick_eliminated" ? (
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-red-200">
              Your pick eliminated
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

export function ParticipantBracketView({
  slots,
  teams,
  knockoutBracketPicksUnlocked,
  tournamentMatches = null,
  editPicksHref = null,
  listViewHref = null,
  readOnly = false,
}: Props) {
  const bracket = deriveParticipantBracket({
    slots,
    teams,
    knockoutBracketPicksUnlocked,
  });
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const useLiveTracker = shouldUseLiveBracketTracker({
    knockoutBracketPicksUnlocked,
    tournamentMatches,
    slots,
  });
  const liveTracker = useLiveTracker
    ? buildLiveBracketTracker({
        slots,
        teams,
        knockoutBracketPicksUnlocked,
        tournamentMatches,
      })
    : null;
  const eliminatedTeamIds = liveTracker?.eliminatedTeamIds ?? new Set<string>();
  const matchEditHref = !readOnly && editPicksHref ? editPicksHref : null;

  if (!bracket.meta.hasAnyPicks) {
    return (
      <div className="ash-surface p-6 text-center">
        <p className="text-sm text-ash-muted">No picks saved yet.</p>
        {editPicksHref ? (
          <Link href={editPicksHref} className="btn-primary mt-4 inline-flex">
            Go to pick flow
          </Link>
        ) : null}
      </div>
    );
  }

  if (!useLiveTracker) {
    return (
      <div className="space-y-4">
        <PreRoundOf32BracketBanner
          listViewHref={listViewHref}
          showListViewCta={!readOnly}
        />
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ash-muted">
            Knockout bracket — preview
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-ash-muted">
            Round of 32 sides from your group picks appear below. Third-route slots show
            FIFA-style labels (e.g. 3 ABCDF) until those matchups are confirmed. Confirmed
            matchups can be picked in list view; unconfirmed slots stay locked.
          </p>
        </div>
        <div
          className="overflow-x-auto rounded-xl border border-ash-border bg-ash-body/20 p-2 sm:p-4"
          role="region"
          aria-label="Participant bracket preview before official Round of 32"
        >
          <div className="flex min-w-[520px] flex-nowrap gap-2 pb-1">
            <RoundColumn
              title="Round of 32"
              shortTitle="R32"
              matches={bracket.roundOf32}
              teamById={teamById}
              matchEditHref={matchEditHref}
              eliminatedTeamIds={eliminatedTeamIds}
            />
            <LockedLaterRoundsPanel />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-ash-muted">
          Knockout bracket tracker
        </p>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-ash-muted">
          Follow your saved knockout picks against the live tournament results. Completed
          matches show who advanced, who was eliminated, and whether your pick is still alive.
        </p>
      </div>
      <div
        className="overflow-x-auto rounded-xl border border-ash-border bg-ash-body/20 p-2 sm:p-4"
        role="region"
        aria-label="Live participant bracket tracker"
      >
        <div className="flex min-w-[1240px] flex-nowrap gap-2 pb-1">
          <LiveRoundColumn
            title="Round of 32"
            shortTitle="R32"
            matches={liveTracker!.roundOf32}
            teamById={teamById}
            matchEditHref={matchEditHref}
          />
          <LiveRoundColumn
            title="Round of 16"
            shortTitle="R16"
            matches={liveTracker!.roundOf16}
            teamById={teamById}
            matchEditHref={matchEditHref}
          />
          <LiveRoundColumn
            title="Quarter-finals"
            shortTitle="QF"
            matches={liveTracker!.quarterfinals}
            teamById={teamById}
            matchEditHref={matchEditHref}
          />
          <LiveRoundColumn
            title="Semi-finals"
            shortTitle="SF"
            matches={liveTracker!.semifinals}
            teamById={teamById}
            matchEditHref={matchEditHref}
          />
          <LiveRoundColumn
            title="Final"
            shortTitle="F"
            matches={liveTracker!.final}
            teamById={teamById}
            matchEditHref={matchEditHref}
          />
          <div className="flex min-w-[120px] shrink-0 flex-col justify-start border-l border-ash-border/40 pl-2 sm:border-l-0 sm:pl-0 lg:border-l lg:pl-2">
            <h3 className="mb-2 text-center text-[10px] font-semibold uppercase tracking-wide text-ash-muted sm:text-xs">
              Champion
            </h3>
            <LiveChampionCell champion={liveTracker!.champion} teamById={teamById} />
          </div>
        </div>
      </div>
    </div>
  );
}
