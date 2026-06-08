import type { Team } from "../../src/types/domain";
import type { TeamStrengthLabel } from "./teamStrengthLabel";

/** Tooltip: when the snapshot was published. */
export function fifaRankSnapshotTitle(team: Team): string | undefined {
  if (team.fifaRank == null || team.fifaRankAsOf == null) return undefined;
  const d = new Date(`${team.fifaRankAsOf}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return undefined;
  const formatted = d.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  return `Men’s FIFA world ranking as of ${formatted}.`;
}

/** e.g. "FIFA rank #12", or null if not stored. */
export function fifaRankShort(team: Team): string | null {
  if (team.fifaRank == null) return null;
  return `FIFA rank #${team.fifaRank}`;
}

/**
 * One friendly line for pick cards: rank first, then casual strength hint.
 * Example: "FIFA rank #5 · Often picked"
 */
export function teamPickMetaLine(
  team: Team,
  strength: TeamStrengthLabel,
): string {
  const rank = fifaRankShort(team);
  if (rank) return `${rank} · ${strength}`;
  return strength;
}
