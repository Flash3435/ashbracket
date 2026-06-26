import type { Team } from "../../src/types/domain";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import type { ParticipantPickSlotPayload } from "../../types/knockoutPicksSave";
import type { Prediction } from "../../src/types/domain";
import {
  getGradualKnockoutSelectionState,
  matchStateForR32Slot,
  validateKnockoutMatchPick,
} from "../picks/gradualKnockoutUnlock";
import { isKnockoutProgressionKind } from "./knockoutProgressionKinds";
import { mergeKnockoutProgressionSlotsFromPredictions } from "./mergeKnockoutProgressionFromExistingPredictions";

function progressionKey(parts: {
  predictionKind: string;
  tournamentStageId: string;
  slotKey: string | null;
}): string {
  return `${parts.predictionKind}\0${parts.tournamentStageId}\0${parts.slotKey ?? ""}`;
}

function existingTeamIdByKey(
  existing: Prediction[],
): Map<string, string> {
  const byKey = new Map<string, string>();
  for (const p of existing) {
    if (!isKnockoutProgressionKind(p.predictionKind)) continue;
    const tid = p.teamId?.trim() ?? "";
    if (!tid) continue;
    byKey.set(
      progressionKey({
        predictionKind: p.predictionKind,
        tournamentStageId: p.tournamentStageId ?? "",
        slotKey: p.slotKey,
      }),
      tid,
    );
  }
  return byKey;
}

/**
 * When knockout picks are only partially unlocked, freeze non-pickable progression
 * rows and validate pickable Round of 32 changes against confirmed matchups.
 */
export function applyGradualKnockoutPickSaveGuards(input: {
  incoming: ParticipantPickSlotPayload[];
  existing: Prediction[];
  teams: Team[];
  matches: TournamentMatchPublicRow[];
  fullRoundOf32Official: boolean;
  nowMs?: number;
}): { slots: ParticipantPickSlotPayload[]; error: string | null } {
  const nowMs = input.nowMs ?? Date.now();
  const gradual = getGradualKnockoutSelectionState({
    matches: input.matches,
    teams: input.teams,
    nowMs,
    fullRoundOf32Official: input.fullRoundOf32Official,
  });

  if (input.fullRoundOf32Official) {
    return { slots: input.incoming, error: null };
  }

  const priorByKey = existingTeamIdByKey(input.existing);

  for (const slot of input.incoming) {
    if (!isKnockoutProgressionKind(slot.predictionKind)) continue;
    const incomingId = slot.teamId.trim();
    if (!incomingId) continue;
    const k = progressionKey({
      predictionKind: slot.predictionKind,
      tournamentStageId: slot.tournamentStageId,
      slotKey: slot.slotKey,
    });
    const keep = priorByKey.get(k) ?? "";
    if (incomingId === keep) continue;

    if (slot.predictionKind !== "round_of_32") {
      return {
        slots: input.incoming,
        error: "Later knockout rounds unlock once the full Round of 32 is official.",
      };
    }

    const match = matchStateForR32Slot(slot.slotKey, gradual);
    if (!match?.publicMatch || !match.pickable) {
      if (!match?.confirmed) {
        return { slots: input.incoming, error: "Matchup not confirmed yet." };
      }
      if (match?.started) {
        return {
          slots: input.incoming,
          error: "This match has already kicked off and can no longer be edited.",
        };
      }
      return {
        slots: input.incoming,
        error: "This Round of 32 matchup is not open for picks yet.",
      };
    }
    const err = validateKnockoutMatchPick({
      slotKey: slot.slotKey ?? "",
      selectedTeamId: incomingId,
      match,
      teams: input.teams,
      nowMs,
    });
    if (err) return { slots: input.incoming, error: err };
  }

  let slots = mergeKnockoutProgressionSlotsFromPredictions(
    input.incoming,
    input.existing,
  );

  const pickableR32Keys = new Set(
    gradual.matchStates
      .filter((m) => m.pickable)
      .flatMap((m) => [m.topSlotKey, m.bottomSlotKey]),
  );

  slots = slots.map((slot) => {
    if (slot.predictionKind !== "round_of_32") return slot;
    if (pickableR32Keys.has(slot.slotKey ?? "")) {
      const incoming = input.incoming.find(
        (s) =>
          s.predictionKind === slot.predictionKind &&
          s.tournamentStageId === slot.tournamentStageId &&
          s.slotKey === slot.slotKey,
      );
      return incoming ? { ...slot, teamId: incoming.teamId } : slot;
    }
    return slot;
  });

  for (const slot of slots) {
    if (!isKnockoutProgressionKind(slot.predictionKind)) continue;

    if (slot.predictionKind !== "round_of_32") {
      const k = progressionKey({
        predictionKind: slot.predictionKind,
        tournamentStageId: slot.tournamentStageId,
        slotKey: slot.slotKey,
      });
      const keep = priorByKey.get(k);
      if (keep != null) {
        slots = slots.map((s) => (s === slot ? { ...s, teamId: keep } : s));
      } else if (slot.teamId.trim()) {
        return {
          slots,
          error: "Later knockout rounds unlock once the full Round of 32 is official.",
        };
      }
      continue;
    }

    const match = matchStateForR32Slot(slot.slotKey, gradual);
    if (!match) {
      if (slot.teamId.trim()) {
        return { slots, error: "Round of 32 slot is not an official matchup yet." };
      }
      continue;
    }

    if (!match.publicMatch) {
      if (slot.teamId.trim()) {
        return { slots, error: "Matchup not confirmed yet." };
      }
      continue;
    }

    if (!match.pickable) {
      const k = progressionKey({
        predictionKind: slot.predictionKind,
        tournamentStageId: slot.tournamentStageId,
        slotKey: slot.slotKey,
      });
      const keep = priorByKey.get(k) ?? "";
      const incomingId = slot.teamId.trim();
      if (incomingId && incomingId !== keep) {
        if (!match.confirmed) {
          return { slots, error: "Matchup not confirmed yet." };
        }
        if (match.started) {
          return {
            slots,
            error: "This match has already kicked off and can no longer be edited.",
          };
        }
        return { slots, error: "This Round of 32 matchup is not open for picks yet." };
      }
      slots = slots.map((s) =>
        s === slot ? { ...s, teamId: keep } : s,
      );
      continue;
    }

    const err = validateKnockoutMatchPick({
      slotKey: slot.slotKey ?? "",
      selectedTeamId: slot.teamId,
      match,
      teams: input.teams,
      nowMs,
    });
    if (err) return { slots, error: err };
  }

  return { slots, error: null };
}
