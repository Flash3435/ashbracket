import Link from "next/link";
import { formatKickoffAmericaEdmonton } from "@/lib/datetime/scheduleDisplay";
import type { CheerSuggestion } from "@/lib/account/buildWhoToCheerFor";
import { TeamFlagName } from "@/components/tournament/TeamFlagName";

type Props = {
  suggestions: CheerSuggestion[];
  tournamentErr: string | null;
  showIncompleteCta: boolean;
  hasAnyPick: boolean;
  picksHref: string;
  poolName?: string;
};

function statusBadge(status: string): string {
  switch (status) {
    case "live":
      return "rounded-full border border-red-800/60 bg-red-950/50 px-2 py-0.5 text-[10px] font-medium text-red-200";
    case "postponed":
      return "rounded-full bg-amber-950/50 px-2 py-0.5 text-[10px] font-medium text-amber-100";
    default:
      return "";
  }
}

function MatchTeamsLine({ home, away }: { home: CheerSuggestion["home"]; away: CheerSuggestion["away"] }) {
  const homeFlag =
    home.countryCode != null && home.countryCode !== "" ? (
      <TeamFlagName
        countryCode={home.countryCode}
        teamName={home.name}
        className="inline-flex min-w-0 items-center gap-1"
        nameClassName="text-sm font-semibold text-ash-text"
      />
    ) : (
      <span className="text-sm font-semibold text-ash-text">{home.name}</span>
    );
  const awayFlag =
    away.countryCode != null && away.countryCode !== "" ? (
      <TeamFlagName
        countryCode={away.countryCode}
        teamName={away.name}
        className="inline-flex min-w-0 items-center gap-1"
        nameClassName="text-sm font-semibold text-ash-text"
      />
    ) : (
      <span className="text-sm font-semibold text-ash-text">{away.name}</span>
    );

  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      {homeFlag}
      <span className="text-ash-muted">vs</span>
      {awayFlag}
    </p>
  );
}

export function WhoToCheerForCard({
  suggestions,
  tournamentErr,
  showIncompleteCta,
  hasAnyPick,
  picksHref,
  poolName,
}: Props) {
  return (
    <section className="rounded-xl border border-ash-border bg-ash-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-ash-text">Who to cheer for</h2>
          <p className="mt-0.5 text-xs text-ash-muted">
            Upcoming matches that matter to your bracket.
            {poolName ? (
              <>
                {" "}
                Based on picks for{" "}
                <span className="font-medium text-ash-text">{poolName}</span>.
              </>
            ) : null}
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
          Finish your bracket to see who to cheer for.{" "}
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
          <Link href={picksHref} className="btn-primary mt-3 inline-flex text-sm">
            Make picks
          </Link>
        </div>
      ) : null}

      {!tournamentErr && hasAnyPick && suggestions.length === 0 ? (
        <p className="mt-3 text-sm text-ash-muted">No upcoming matches found yet.</p>
      ) : null}

      {!tournamentErr && hasAnyPick && suggestions.length > 0 ? (
        <ul className="mt-3 divide-y divide-ash-border">
          {suggestions.map((s) => {
            const when = formatKickoffAmericaEdmonton(s.kickoffAt);
            const meta = [s.stageLabel];
            if (s.groupCode) meta.push(`Group ${s.groupCode}`);
            const badgeClass = statusBadge(s.status);

            return (
              <li key={s.matchId} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] text-ash-muted">{meta.join(" · ")}</p>
                  {badgeClass && s.status === "live" ? (
                    <span className={badgeClass}>Live</span>
                  ) : badgeClass && s.status === "postponed" ? (
                    <span className={badgeClass}>Postponed</span>
                  ) : null}
                </div>
                <MatchTeamsLine home={s.home} away={s.away} />
                {when.singleLineFallback ? (
                  <p className="mt-1 text-xs text-ash-muted">{when.singleLineFallback}</p>
                ) : (
                  <p className="mt-1 text-xs text-ash-muted">
                    {when.dateLine}
                    {when.timeLine ? ` · ${when.timeLine}` : ""}
                  </p>
                )}
                <p className="mt-1.5 text-sm">
                  <span className="text-ash-muted">Cheer for: </span>
                  <span
                    className={
                      s.confidence === "strong"
                        ? "font-semibold text-ash-accent"
                        : s.confidence === "medium"
                          ? "font-medium text-ash-text"
                          : "text-ash-muted"
                    }
                  >
                    {s.cheerForLabel}
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-ash-muted">{s.reason}</p>
              </li>
            );
          })}
        </ul>
      ) : null}

      {!tournamentErr && hasAnyPick && suggestions.length > 0 ? (
        <p className="mt-2 text-[11px] text-ash-muted">
          Times are America/Edmonton (Calgary).
        </p>
      ) : null}
    </section>
  );
}
