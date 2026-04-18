import Link from "next/link";
import { deriveParticipantBracket } from "../../lib/bracket/deriveParticipantBracket";
import type { ParticipantBracketModel } from "../../lib/bracket/types";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { Team } from "../../src/types/domain";
import { BracketMatchCard } from "./BracketMatchCard";
import { flagEmojiForFifaCountryCode } from "../../lib/teams/fifaToIso2ForFlag";

type Props = {
  slots: KnockoutPickSlotDraft[];
  teams: Team[];
  knockoutBracketPicksUnlocked: boolean;
  /** Optional: link to `/account/picks?participant=…` for the owner. */
  editPicksHref?: string | null;
  /** Hide edit links on read-only snapshots. */
  readOnly?: boolean;
};

function RoundColumn({
  title,
  shortTitle,
  matches,
  teamById,
  matchEditHref,
}: {
  title: string;
  shortTitle: string;
  matches: ParticipantBracketModel["roundOf32"];
  teamById: Map<string, Team>;
  matchEditHref?: string | null;
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
          />
        ))}
      </div>
    </div>
  );
}

function ChampionCell({
  champion,
  teamById,
}: {
  champion: ParticipantBracketModel["champion"];
  teamById: Map<string, Team>;
}) {
  const tid = champion.teamId?.trim() || null;
  const team = tid ? teamById.get(tid) : undefined;
  const picked = Boolean(tid && team);
  const flag = team ? flagEmojiForFifaCountryCode(team.countryCode) : "";

  return (
    <div
      className={`rounded-lg border p-3 text-center ${
        picked
          ? "border-ash-accent/50 bg-ash-accent/15 ring-1 ring-ash-accent/30"
          : "border-ash-border/70 bg-ash-body/30"
      }`}
    >
      <span className="text-2xl" aria-hidden>
        {picked ? flag : "🏆"}
      </span>
      <p
        className={`mt-2 text-sm font-semibold ${picked ? "text-ash-text" : "text-ash-muted"}`}
      >
        {picked ? team!.name : "TBD"}
      </p>
      {picked ? <p className="text-[11px] text-ash-muted">{team!.countryCode}</p> : null}
    </div>
  );
}

export function ParticipantBracketView({
  slots,
  teams,
  knockoutBracketPicksUnlocked,
  editPicksHref = null,
  readOnly = false,
}: Props) {
  const bracket = deriveParticipantBracket({
    slots,
    teams,
    knockoutBracketPicksUnlocked,
  });
  const teamById = new Map(teams.map((t) => [t.id, t]));
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

  return (
    <div className="space-y-4">
      {bracket.meta.notes.length > 0 ? (
        <ul className="space-y-1 text-xs text-ash-muted">
          {bracket.meta.notes.map((n, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-ash-accent" aria-hidden>
                •
              </span>
              <span>{n}</span>
            </li>
          ))}
        </ul>
      ) : null}

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
          />
          <RoundColumn
            title="Round of 16"
            shortTitle="R16"
            matches={bracket.roundOf16}
            teamById={teamById}
            matchEditHref={matchEditHref}
          />
          <RoundColumn
            title="Quarter-finals"
            shortTitle="QF"
            matches={bracket.quarterfinals}
            teamById={teamById}
            matchEditHref={matchEditHref}
          />
          <RoundColumn
            title="Semi-finals"
            shortTitle="SF"
            matches={bracket.semifinals}
            teamById={teamById}
            matchEditHref={matchEditHref}
          />
          <RoundColumn
            title="Final"
            shortTitle="F"
            matches={bracket.final}
            teamById={teamById}
            matchEditHref={matchEditHref}
          />
          <div className="flex min-w-[120px] shrink-0 flex-col justify-start border-l border-ash-border/40 pl-2 sm:border-l-0 sm:pl-0 lg:border-l lg:pl-2">
            <h3 className="mb-2 text-center text-[10px] font-semibold uppercase tracking-wide text-ash-muted sm:text-xs">
              Champion
            </h3>
            <ChampionCell champion={bracket.champion} teamById={teamById} />
          </div>
        </div>
      </div>
    </div>
  );
}
