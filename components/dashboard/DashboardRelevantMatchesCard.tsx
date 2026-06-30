import Link from "next/link";
import { KickoffTimeDisplay } from "@/components/datetime/KickoffTimeDisplay";
import type { CheerSuggestion } from "@/lib/account/buildWhoToCheerFor";
import { matchdayBracketWantsLabel } from "@/lib/account/buildMatchday";
import { ScheduleMatchPickTeams } from "@/components/tournament/ScheduleMatchPickTeams";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { Team } from "../../src/types/domain";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";

type Props = {
  suggestions: CheerSuggestion[];
  tournamentErr: string | null;
  hasAnyPick: boolean;
  scheduleHref?: string;
  initialSlots?: KnockoutPickSlotDraft[];
  teams?: Team[];
  allMatches?: TournamentMatchPublicRow[];
};

function statusBadgeClass(status: string): string {
  switch (status) {
    case "live":
      return "rounded-full border border-red-800/60 bg-red-950/50 px-2 py-0.5 text-[10px] font-medium text-red-200";
    case "postponed":
      return "rounded-full bg-amber-950/50 px-2 py-0.5 text-[10px] font-medium text-amber-100";
    default:
      return "";
  }
}

function statusBadgeLabel(status: string): string | null {
  if (status === "live") return "Live";
  if (status === "postponed") return "Postponed";
  return null;
}

function RelevantMatchRow({
  s,
  hasAnyPick,
  pickContext,
}: {
  s: CheerSuggestion;
  hasAnyPick: boolean;
  pickContext:
    | {
        slots: KnockoutPickSlotDraft[];
        teams: Team[];
        allMatches?: TournamentMatchPublicRow[];
      }
    | null;
}) {
  const wants = matchdayBracketWantsLabel(s);
  const badge = statusBadgeLabel(s.status);

  return (
    <li className="border-b border-ash-border/60 py-3 last:border-b-0 last:pb-0 first:pt-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ScheduleMatchPickTeams
          m={s.match}
          pickContext={pickContext}
          className="text-sm font-medium text-ash-text"
        />
        {badge ? (
          <span className={statusBadgeClass(s.status)}>{badge}</span>
        ) : null}
      </div>
      {s.kickoffAt ? (
        <p className="mt-1 text-xs text-ash-muted">
          <KickoffTimeDisplay iso={s.kickoffAt} />
        </p>
      ) : null}
      {hasAnyPick ? (
        <>
          <p className="mt-1.5 text-sm text-ash-text">
            <span className="text-ash-muted">Your bracket wants: </span>
            <span className={wants.muted ? "text-ash-muted" : "font-medium"}>
              {wants.primary}
            </span>
          </p>
          <p className="mt-0.5 text-xs text-ash-muted">{s.reason}</p>
        </>
      ) : (
        <p className="mt-1.5 text-xs text-ash-muted">
          Fill in your picks to see which results help your bracket.
        </p>
      )}
    </li>
  );
}

export function DashboardRelevantMatchesCard({
  suggestions,
  tournamentErr,
  hasAnyPick,
  scheduleHref = "/tournament",
  initialSlots,
  teams,
  allMatches,
}: Props) {
  if (tournamentErr) {
    return (
      <section className="rounded-xl border border-ash-border bg-ash-surface p-4">
        <h2 className="text-base font-bold text-ash-text">
          Next matches affecting your bracket
        </h2>
        <p className="mt-2 text-sm text-amber-200" role="status">
          Schedule could not be loaded ({tournamentErr}).
        </p>
      </section>
    );
  }

  if (suggestions.length === 0) return null;

  const pickContext =
    initialSlots && teams
      ? { slots: initialSlots, teams, allMatches }
      : null;

  return (
    <section className="rounded-xl border border-ash-border bg-ash-surface p-4">
      <h2 className="text-base font-bold text-ash-text">
        Next matches affecting your bracket
      </h2>
      <ul className="mt-3">
        {suggestions.map((s) => (
          <RelevantMatchRow
            key={s.matchId}
            s={s}
            hasAnyPick={hasAnyPick}
            pickContext={pickContext}
          />
        ))}
      </ul>
      <Link href={scheduleHref} className="ash-link mt-3 inline-block text-xs">
        Full schedule
      </Link>
    </section>
  );
}
