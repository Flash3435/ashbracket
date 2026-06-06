import Link from "next/link";
import { formatKickoffAmericaEdmonton } from "@/lib/datetime/scheduleDisplay";
import type { CheerSuggestion } from "@/lib/account/buildWhoToCheerFor";
import { DASHBOARD_MATCH_LIMIT } from "@/lib/account/buildWhoToCheerFor";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { Team } from "../../src/types/domain";
import { ScheduleMatchPickTeams } from "@/components/tournament/ScheduleMatchPickTeams";

type Props = {
  suggestions: CheerSuggestion[];
  totalRelevantMatches: number;
  tournamentErr: string | null;
  showIncompleteCta: boolean;
  hasAnyPick: boolean;
  picksHref: string;
  initialSlots?: KnockoutPickSlotDraft[];
  teams?: Team[];
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

function CheerGuidance({ s }: { s: CheerSuggestion }) {
  const showCheerForTeam = s.cheerForTeamId != null;
  const bothTeams = s.cheerForLabel === "Both teams are in your bracket";
  const noAngle = s.confidence === "none";

  if (bothTeams) {
    return (
      <div className="mt-2">
        <p className="text-sm font-semibold text-ash-text">{s.cheerForLabel}</p>
        <p className="mt-0.5 text-xs text-ash-muted">{s.reason}</p>
      </div>
    );
  }

  if (noAngle) {
    return (
      <div className="mt-2">
        <p className="text-sm font-medium text-ash-muted">{s.cheerForLabel}</p>
        <p className="mt-0.5 text-xs text-ash-muted">{s.reason}</p>
      </div>
    );
  }

  return (
    <div className="mt-2">
      <p className="text-sm">
        <span className="text-ash-muted">Cheer for: </span>
        <span
          className={
            showCheerForTeam && s.confidence === "strong"
              ? "font-semibold text-ash-accent"
              : showCheerForTeam
                ? "font-medium text-ash-text"
                : "text-ash-muted"
          }
        >
          {s.cheerForLabel}
        </span>
      </p>
      <p className="mt-0.5 text-xs text-ash-muted">{s.reason}</p>
    </div>
  );
}

export function WhoToCheerForCard({
  suggestions,
  totalRelevantMatches,
  tournamentErr,
  showIncompleteCta,
  hasAnyPick,
  picksHref,
  initialSlots,
  teams,
}: Props) {
  const pickContext =
    hasAnyPick &&
    initialSlots &&
    teams &&
    initialSlots.length > 0 &&
    teams.length > 0
      ? { slots: initialSlots, teams }
      : null;

  const displaySuggestions = suggestions.slice(0, DASHBOARD_MATCH_LIMIT);
  const showMatches = !tournamentErr && displaySuggestions.length > 0;
  const showCountFooter =
    showMatches && totalRelevantMatches > DASHBOARD_MATCH_LIMIT;

  return (
    <section className="rounded-xl border border-ash-border bg-ash-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-ash-text">Who to cheer for</h2>
          <p className="mt-0.5 text-xs text-ash-muted">
            Upcoming matches connected to your bracket. Kickoff times use Mountain Time.
          </p>
        </div>
        <Link href="/tournament" className="ash-link shrink-0 text-xs">
          Full schedule
        </Link>
      </div>

      {tournamentErr ? (
        <p className="mt-3 text-sm text-amber-200" role="status">
          Schedule could not be loaded ({tournamentErr}).
        </p>
      ) : null}

      {!tournamentErr && showIncompleteCta ? (
        <div className="mt-3 rounded-md border border-amber-700/40 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
          Finish your bracket to unlock cheer suggestions.{" "}
          <Link href={picksHref} className="font-medium text-ash-accent underline">
            Make picks
          </Link>
        </div>
      ) : null}

      {!tournamentErr && !hasAnyPick ? (
        <div className="mt-3">
          <p className="text-sm text-ash-muted">
            Make your picks to see who to cheer for.
          </p>
          <Link href={picksHref} className="btn-primary mt-2 inline-flex text-sm">
            Make picks
          </Link>
        </div>
      ) : null}

      {!tournamentErr && hasAnyPick && suggestions.length === 0 ? (
        <p className="mt-3 text-sm text-ash-muted">No upcoming matches found yet.</p>
      ) : null}

      {showMatches ? (
        <ul className="mt-3 divide-y divide-ash-border">
          {displaySuggestions.map((s) => {
            const when = formatKickoffAmericaEdmonton(s.kickoffAt);
            const meta = [s.stageLabel];
            if (s.groupCode) meta.push(`Group ${s.groupCode}`);
            const badgeClass = statusBadgeClass(s.status);
            const badgeLabel = statusBadgeLabel(s.status);

            return (
              <li key={s.matchId} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] text-ash-muted">{meta.join(" · ")}</p>
                  {badgeClass && badgeLabel ? (
                    <span className={badgeClass}>{badgeLabel}</span>
                  ) : null}
                </div>
                {when.singleLineFallback ? (
                  <p className="mt-1 text-xs text-ash-muted">{when.singleLineFallback}</p>
                ) : (
                  <>
                    <p className="mt-1 text-sm font-medium text-ash-text">{when.dateLine}</p>
                    {when.timeLine ? (
                      <p className="text-xs text-ash-muted">{when.timeLine}</p>
                    ) : null}
                  </>
                )}
                <ScheduleMatchPickTeams
                  m={s.match}
                  pickContext={pickContext}
                  className="mt-2"
                />
                {hasAnyPick && !showIncompleteCta ? <CheerGuidance s={s} /> : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {showCountFooter ? (
        <p className="mt-2 text-[11px] text-ash-muted">
          Showing {displaySuggestions.length} of {totalRelevantMatches} relevant
          matches.
        </p>
      ) : null}
    </section>
  );
}
