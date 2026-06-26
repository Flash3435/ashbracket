import {
  getGradualKnockoutSelectionState,
  isKnockoutMatchConfirmed,
  isMatchPickable,
} from "../picks/gradualKnockoutUnlock";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";

/** Admin-facing one-line status for gradual R32 unlock data health. */
export function buildR32GradualUnlockDiagnosticLine(
  matches: TournamentMatchPublicRow[] | null | undefined,
  nowMs = Date.now(),
): string {
  const r32 = (matches ?? []).filter((m) => m.stage_code === "round_of_32");
  if (r32.length === 0) {
    return "R32 gradual unlock: 0 pickable, 16 pending — no Round of 32 fixture rows found";
  }

  const gradual = getGradualKnockoutSelectionState({ matches, nowMs });
  const confirmedFromRows = r32.filter((m) => isKnockoutMatchConfirmed(m)).length;
  const pickableFromRows = r32.filter((m) => isMatchPickable(m, nowMs)).length;

  if (confirmedFromRows === 0) {
    return `R32 gradual unlock: 0 pickable, ${gradual.pendingCount} pending — fixture rows exist but no confirmed matchups yet`;
  }

  return `R32 gradual unlock: ${pickableFromRows} pickable, ${gradual.pendingCount} waiting`;
}
