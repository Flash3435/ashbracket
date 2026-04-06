import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";

function formatWhen(iso: string | null | undefined): string {
  if (iso == null || iso === "") return "Time TBD";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

function teamLabel(name: string | null, code: string | null): string {
  if (name) return name;
  if (code) return code;
  return "TBD";
}

function statusClass(status: string): string {
  switch (status) {
    case "live":
      return "rounded-full border border-red-800/60 bg-red-950/50 px-2 py-0.5 text-xs font-medium text-red-200";
    case "scheduled":
      return "rounded-full bg-ash-accent/15 px-2 py-0.5 text-xs font-medium text-ash-accent";
    case "postponed":
      return "rounded-full bg-amber-950/50 px-2 py-0.5 text-xs font-medium text-amber-100";
    default:
      return "rounded-full bg-ash-surface px-2 py-0.5 text-xs font-medium text-ash-muted ring-1 ring-ash-border";
  }
}

type Props = {
  matches: TournamentMatchPublicRow[];
};

export function ParticipantPicksNextMatches({ matches }: Props) {
  if (matches.length === 0) {
    return (
      <p className="text-sm text-ash-muted">
        When the schedule includes your teams, their next fixtures will show up
        here. Group-stage lineups can still be TBD in the data — check back as
        the tournament fills in.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-ash-border">
      {matches.map((m) => {
        const meta = [m.stage_label];
        if (m.group_code) meta.push(`Group ${m.group_code}`);

        return (
          <li key={m.match_id} className="py-3 first:pt-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-ash-muted">{meta.join(" · ")}</p>
              <span className={statusClass(m.status)}>{m.status}</span>
            </div>
            <p className="mt-1 text-sm text-ash-muted">{formatWhen(m.kickoff_at)}</p>
            <p className="mt-1 text-sm font-medium text-ash-text">
              {teamLabel(m.home_team_name, m.home_country_code)}
              <span className="mx-2 font-normal text-ash-border-hover">vs</span>
              {teamLabel(m.away_team_name, m.away_country_code)}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
