import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { Team } from "../../src/types/domain";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import {
  pickSideHighlightForMatch,
  type PickSideHighlightKind,
} from "../../lib/participant/bracketMatchImpact";
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

const HIGHLIGHT_HELP: Record<Exclude<PickSideHighlightKind, "none">, string> = {
  needed: "Your bracket needs this team to win this match.",
  in_bracket: PICK_HIGHLIGHT_HELP.bracket,
  eliminated: "This team was eliminated — related picks can no longer help your bracket.",
};

function legacyLevelToKind(level: PickHighlightLevel): PickSideHighlightKind {
  if (level === "round") return "needed";
  if (level === "bracket") return "in_bracket";
  return "none";
}

function HighlightBadge({ kind }: { kind: Exclude<PickSideHighlightKind, "none"> }) {
  const label =
    kind === "needed"
      ? "Bracket wants"
      : kind === "eliminated"
        ? "Eliminated pick"
        : "In your bracket";

  const className =
    kind === "needed"
      ? "shrink-0 rounded bg-ash-accent/25 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ash-accent"
      : kind === "eliminated"
        ? "shrink-0 rounded bg-red-950/50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-200"
        : "shrink-0 rounded bg-ash-body px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ash-muted";

  return (
    <span className={className} title={HIGHLIGHT_HELP[kind]}>
      {label}
    </span>
  );
}

function TeamWithHighlight({
  name,
  code,
  kind,
}: {
  name: string | null;
  code: string | null;
  kind: PickSideHighlightKind;
}) {
  const label = teamLabel(name, code);
  if (kind === "none") {
    return <span className="text-sm font-medium text-ash-text">{label}</span>;
  }

  const borderClass =
    kind === "needed"
      ? "border-ash-accent/45 bg-ash-accent/12 text-ash-accent"
      : kind === "eliminated"
        ? "border-red-900/50 bg-red-950/25 text-red-100"
        : "border-ash-border/80 bg-ash-body/55 text-ash-text";

  return (
    <span
      className={`inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-md border px-2 py-1 ${borderClass}`}
      title={HIGHLIGHT_HELP[kind]}
    >
      <span className="min-w-0 font-medium">{label}</span>
      <HighlightBadge kind={kind} />
    </span>
  );
}

type PickContext = {
  slots: KnockoutPickSlotDraft[];
  teams: Team[];
  /** Full schedule — enables elimination-aware highlights. */
  allMatches?: TournamentMatchPublicRow[];
};

type Props = {
  m: TournamentMatchPublicRow;
  pickContext: PickContext | null | undefined;
  className?: string;
};

function sideHighlight(
  m: TournamentMatchPublicRow,
  side: "home" | "away",
  pickContext: PickContext,
  teamById: Map<string, Team>,
): PickSideHighlightKind {
  if (pickContext.allMatches && pickContext.allMatches.length > 0) {
    return pickSideHighlightForMatch(
      m,
      side,
      pickContext.slots,
      pickContext.teams,
      pickContext.allMatches,
    );
  }
  return legacyLevelToKind(
    pickHighlightForSide(m, side, pickContext.slots, teamById),
  );
}

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
      ? sideHighlight(m, "home", pickContext, teamById)
      : "none";
  const awayLevel =
    teamById && pickContext
      ? sideHighlight(m, "away", pickContext, teamById)
      : "none";

  return (
    <div className={`flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center ${className}`}>
      <TeamWithHighlight
        name={m.home_team_name}
        code={m.home_country_code}
        kind={homeLevel}
      />
      <span className="hidden text-ash-border-hover sm:inline">vs</span>
      <span className="text-center text-xs text-ash-border-hover sm:hidden">
        vs
      </span>
      <TeamWithHighlight
        name={m.away_team_name}
        code={m.away_country_code}
        kind={awayLevel}
      />
    </div>
  );
}
