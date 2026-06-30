import Link from "next/link";
import { deriveParticipantBracket } from "../../lib/bracket/deriveParticipantBracket";
import { buildEliminatedTeamIdSet } from "../../lib/bracket/bracketTeamDisplay";
import type { ParticipantBracketModel } from "../../lib/bracket/types";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { Team } from "../../src/types/domain";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import { BracketMatchCard } from "./BracketMatchCard";
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

const CHAMPION_STAGE3_LABEL = "Opens in Stage 3";
const CHAMPION_STAGE3_SUB = "Knockout picks open after group stage.";

function ChampionCell({
  champion,
  teamById,
  knockoutBracketPicksUnlocked,
  eliminatedTeamIds,
}: {
  champion: ParticipantBracketModel["champion"];
  teamById: Map<string, Team>;
  knockoutBracketPicksUnlocked: boolean;
  eliminatedTeamIds: Set<string>;
}) {
  const tid = champion.teamId?.trim() || null;
  const team = tid ? teamById.get(tid) : undefined;
  const picked = Boolean(tid && team);
  const eliminated = Boolean(tid && eliminatedTeamIds.has(tid));
  const stage3Placeholder = !picked && !knockoutBracketPicksUnlocked;

  return (
    <div
      className={`rounded-lg border p-3 text-center ${
        eliminated
          ? "border-ash-border/50 bg-ash-body/15 opacity-75"
          : picked
            ? "border-ash-accent/50 bg-ash-accent/15 ring-1 ring-ash-accent/30"
            : "border-ash-border/70 bg-ash-body/30"
      }`}
    >
      <span className="inline-flex justify-center" aria-hidden>
        {picked ? (
          <CountryFlagIcon
            countryCode={team!.countryCode}
            size="lg"
            className={eliminated ? "opacity-60 grayscale" : undefined}
          />
        ) : (
          <span className="text-2xl leading-none">🏆</span>
        )}
      </span>
      <p
        className={`mt-2 text-sm font-semibold ${
          eliminated ? "text-ash-muted" : picked ? "text-ash-text" : "text-ash-muted"
        }`}
      >
        {picked ? team!.name : stage3Placeholder ? CHAMPION_STAGE3_LABEL : "TBD"}
      </p>
      {picked ? (
        <>
          <p className={`text-[11px] ${eliminated ? "text-ash-muted/80" : "text-ash-muted"}`}>
            {team!.countryCode}
          </p>
          {eliminated ? (
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-ash-muted">
              Eliminated
            </p>
          ) : null}
        </>
      ) : stage3Placeholder ? (
        <p className="mt-1 text-[10px] leading-snug text-ash-muted/90">{CHAMPION_STAGE3_SUB}</p>
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
  const eliminatedTeamIds = buildEliminatedTeamIdSet(tournamentMatches, teams);
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

  if (!knockoutBracketPicksUnlocked) {
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
      <div
        className="overflow-x-auto rounded-xl border border-ash-border bg-ash-body/20 p-2 sm:p-4"
        role="region"
        aria-label="Participant bracket"
      >
        <div className="flex min-w-[1180px] flex-nowrap gap-2 pb-1">
          <RoundColumn
            title="Round of 32"
            shortTitle="R32"
            matches={bracket.roundOf32}
            teamById={teamById}
            matchEditHref={matchEditHref}
            eliminatedTeamIds={eliminatedTeamIds}
          />
          <RoundColumn
            title="Round of 16"
            shortTitle="R16"
            matches={bracket.roundOf16}
            teamById={teamById}
            matchEditHref={matchEditHref}
            eliminatedTeamIds={eliminatedTeamIds}
          />
          <RoundColumn
            title="Quarter-finals"
            shortTitle="QF"
            matches={bracket.quarterfinals}
            teamById={teamById}
            matchEditHref={matchEditHref}
            eliminatedTeamIds={eliminatedTeamIds}
          />
          <RoundColumn
            title="Semi-finals"
            shortTitle="SF"
            matches={bracket.semifinals}
            teamById={teamById}
            matchEditHref={matchEditHref}
            eliminatedTeamIds={eliminatedTeamIds}
          />
          <RoundColumn
            title="Final"
            shortTitle="F"
            matches={bracket.final}
            teamById={teamById}
            matchEditHref={matchEditHref}
            eliminatedTeamIds={eliminatedTeamIds}
          />
          <div className="flex min-w-[120px] shrink-0 flex-col justify-start border-l border-ash-border/40 pl-2 sm:border-l-0 sm:pl-0 lg:border-l lg:pl-2">
            <h3 className="mb-2 text-center text-[10px] font-semibold uppercase tracking-wide text-ash-muted sm:text-xs">
              Champion
            </h3>
            <ChampionCell
              champion={bracket.champion}
              teamById={teamById}
              knockoutBracketPicksUnlocked={knockoutBracketPicksUnlocked}
              eliminatedTeamIds={eliminatedTeamIds}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
