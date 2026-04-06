import { formatKickoffAmericaEdmonton } from "../../lib/datetime/scheduleDisplay";
import { opponentLineForPickedCodes } from "../../lib/participant/opponentLineForPickedCodes";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";

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
  /** FIFA country codes from the participant’s knockout picks (for opponent line). */
  pickedCountryCodes?: Set<string>;
};

export function ParticipantPicksNextMatches({
  matches,
  pickedCountryCodes,
}: Props) {
  if (matches.length === 0) {
    return (
      <p className="text-sm text-ash-muted">
        When the official schedule includes your teams, their next fixtures
        will show here (times in Calgary / Alberta — America/Edmonton).
      </p>
    );
  }

  return (
    <ul className="divide-y divide-ash-border">
      {matches.map((m) => {
        const meta = [m.stage_label];
        if (m.group_code) meta.push(`Group ${m.group_code}`);
        const when = formatKickoffAmericaEdmonton(m.kickoff_at);
        const opponent =
          pickedCountryCodes && pickedCountryCodes.size > 0
            ? opponentLineForPickedCodes(m, pickedCountryCodes)
            : "";

        return (
          <li key={m.match_id} className="py-3 first:pt-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-ash-muted">{meta.join(" · ")}</p>
              <span className={statusClass(m.status)}>{m.status}</span>
            </div>
            {when.singleLineFallback ? (
              <p className="mt-1 text-sm text-ash-muted">
                {when.singleLineFallback}
              </p>
            ) : (
              <>
                <p className="mt-1 text-sm font-medium text-ash-text">
                  {when.dateLine}
                </p>
                <p className="mt-1 text-sm text-ash-muted">{when.timeLine}</p>
              </>
            )}
            {opponent ? (
              <p className="mt-1 text-sm font-medium text-ash-accent">
                {opponent}
              </p>
            ) : null}
            <p className="mt-1 text-xs text-ash-muted">
              {teamLabel(m.home_team_name, m.home_country_code)}
              <span className="mx-1.5 font-normal text-ash-border-hover">vs</span>
              {teamLabel(m.away_team_name, m.away_country_code)}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
