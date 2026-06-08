import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { Team } from "../../src/types/domain";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import {
  PICK_HIGHLIGHT_HELP,
  pickHighlightForSide,
  type PickHighlightLevel,
} from "../../lib/participant/participantPickHighlights";

function teamLabel(name: string | null, code: string | null): string {
  if (name) return name;
  if (code) return code;
  return "TBD";
}

function HighlightBadge({ level }: { level: PickHighlightLevel }) {
  if (level === "none") return null;
  const isRound = level === "round";
  return (
    <span
      className={
        isRound
          ? "shrink-0 rounded bg-ash-accent/25 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ash-accent"
          : "shrink-0 rounded bg-ash-body px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ash-muted"
      }
      title={isRound ? PICK_HIGHLIGHT_HELP.round : PICK_HIGHLIGHT_HELP.bracket}
    >
      {isRound ? "Your pick" : "In your bracket"}
    </span>
  );
}

function TeamWithHighlight({
  name,
  code,
  level,
}: {
  name: string | null;
  code: string | null;
  level: PickHighlightLevel;
}) {
  const label = teamLabel(name, code);
  if (level === "none") {
    return <span className="text-sm font-medium text-ash-text">{label}</span>;
  }
  const isRound = level === "round";
  return (
    <span
      className={`inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-md border px-2 py-1 ${
        isRound
          ? "border-ash-accent/45 bg-ash-accent/12 text-ash-accent"
          : "border-ash-border/80 bg-ash-body/55 text-ash-text"
      }`}
      title={isRound ? PICK_HIGHLIGHT_HELP.round : PICK_HIGHLIGHT_HELP.bracket}
    >
      <span className="min-w-0 font-medium">{label}</span>
      <HighlightBadge level={level} />
    </span>
  );
}

type PickContext = {
  slots: KnockoutPickSlotDraft[];
  teams: Team[];
};

type Props = {
  m: TournamentMatchPublicRow;
  pickContext: PickContext | null | undefined;
  className?: string;
};

/**
 * Home vs away line with optional per-side highlight for the signed-in user’s saved picks.
 */
export function ScheduleMatchPickTeams({
  m,
  pickContext,
  className = "mt-1",
}: Props) {
  const teamById =
    pickContext && pickContext.slots.length > 0
      ? new Map(pickContext.teams.map((t) => [t.id, t]))
      : null;

  const homeLevel =
    teamById && pickContext
      ? pickHighlightForSide(m, "home", pickContext.slots, teamById)
      : "none";
  const awayLevel =
    teamById && pickContext
      ? pickHighlightForSide(m, "away", pickContext.slots, teamById)
      : "none";

  return (
    <div className={`flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center ${className}`}>
      <TeamWithHighlight
        name={m.home_team_name}
        code={m.home_country_code}
        level={homeLevel}
      />
      <span className="hidden text-ash-border-hover sm:inline">vs</span>
      <span className="text-center text-xs text-ash-border-hover sm:hidden">
        vs
      </span>
      <TeamWithHighlight
        name={m.away_team_name}
        code={m.away_country_code}
        level={awayLevel}
      />
    </div>
  );
}
