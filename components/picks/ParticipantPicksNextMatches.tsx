import { formatKickoffAmericaEdmonton } from "../../lib/datetime/scheduleDisplay";
import { countryCodesFromKnockoutSlots } from "../../lib/participant/nextMatchesForPickedTeams";
import { countMatchesInvolvingPicks } from "../../lib/participant/participantPickHighlights";
import { opponentLineForPickedCodes } from "../../lib/participant/opponentLineForPickedCodes";
import type { Team } from "../../src/types/domain";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import { ScheduleMatchPickTeams } from "../tournament/ScheduleMatchPickTeams";

function toCodeSet(
  picked: Set<string> | string[] | undefined,
): Set<string> | undefined {
  if (picked == null) return undefined;
  if (picked instanceof Set) return picked;
  return new Set(picked.map((c) => c.trim().toUpperCase()).filter(Boolean));
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
  /**
   * When `initialSlots` + `teams` are set, highlights use “Your pick” vs “In your bracket”.
   * Otherwise falls back to flat styling and `pickedCountryCodes` only for the opponent line.
   */
  initialSlots?: KnockoutPickSlotDraft[];
  teams?: Team[];
  /** Used for the “vs …” helper line when slots/teams omit bonus-only context. */
  pickedCountryCodes?: Set<string> | string[];
};

export function ParticipantPicksNextMatches({
  matches,
  initialSlots,
  teams,
  pickedCountryCodes,
}: Props) {
  const pickContext =
    initialSlots &&
    teams &&
    initialSlots.length > 0 &&
    teams.length > 0
      ? { slots: initialSlots, teams }
      : null;

  const teamById =
    pickContext && pickContext.slots.length > 0
      ? new Map(pickContext.teams.map((t) => [t.id, t]))
      : null;

  const codeSetForOpponent =
    pickContext && teamById
      ? countryCodesFromKnockoutSlots(pickContext.slots, teamById)
      : toCodeSet(pickedCountryCodes);

  const involvedCount =
    pickContext && teamById
      ? countMatchesInvolvingPicks(matches, pickContext.slots, teamById)
      : codeSetForOpponent && codeSetForOpponent.size > 0
        ? matches.filter((m) =>
            opponentLineForPickedCodes(m, codeSetForOpponent),
          ).length
        : 0;

  if (matches.length === 0) {
    return (
      <p className="text-sm text-ash-muted">
        When the official schedule includes your teams, their next fixtures will
        show here (times in Calgary / Alberta — America/Edmonton).
      </p>
    );
  }

  return (
    <div>
      {involvedCount > 0 ? (
        <p className="mb-3 text-xs text-ash-muted">
          <span className="font-medium text-ash-text">
            {involvedCount} of {matches.length}
          </span>{" "}
          {matches.length === 1 ? "match" : "matches"} involve your picks
          <span
            className="ml-1 cursor-help border-b border-dotted border-ash-border-hover text-ash-border-hover"
            title="A match counts if at least one side is a national team you selected anywhere in your bracket (including bonus questions). “Your pick” means you chose that team for this specific round or group slot."
          >
            ?
          </span>
        </p>
      ) : null}
      <ul className="divide-y divide-ash-border">
        {matches.map((m) => {
          const meta = [m.stage_label];
          if (m.group_code) meta.push(`Group ${m.group_code}`);
          const when = formatKickoffAmericaEdmonton(m.kickoff_at);
          const opponent =
            codeSetForOpponent != null && codeSetForOpponent.size > 0
              ? opponentLineForPickedCodes(m, codeSetForOpponent)
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
              <ScheduleMatchPickTeams m={m} pickContext={pickContext} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
