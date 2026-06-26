import type { Team } from "../../src/types/domain";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import type { ParticipantPickSlotPayload } from "../../types/knockoutPicksSave";
import type { Prediction } from "../../src/types/domain";
import {
  getGradualKnockoutSelectionState,
  matchStateForR16GradualWinnerSlot,
  matchStateForR32Slot,
  r16SlotKeyForR32MatchIndex,
  validateKnockoutMatchPick,
} from "../picks/gradualKnockoutUnlock";
import { isKnockoutProgressionKind } from "./knockoutProgressionKinds";
import { mergeKnockoutProgressionSlotsFromPredictions } from "./mergeKnockoutProgressionFromExistingPredictions";

const GRADUAL_R32_SLOT_EDIT_ERROR =
  "Use the matchup row to pick the winner while Round of 32 unlocks gradually.";

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

function gradualR32MatchPickError(
  match: ReturnType<typeof matchStateForR16GradualWinnerSlot>,
): string | null {
  if (!match?.confirmed) {
    return "Matchup not confirmed yet.";
  }
  if (match.started) {
    return "This match has already kicked off and can no longer be edited.";
  }
  return "This Round of 32 matchup is not open for picks yet.";
}

/**
 * When knockout picks are only partially unlocked, freeze non-pickable progression
 * rows and validate pickable Round of 32 match winners against confirmed matchups.
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

    if (slot.predictionKind === "round_of_16") {
      const match = matchStateForR16GradualWinnerSlot(slot.slotKey, gradual);
      if (!match) {
        return {
          slots: input.incoming,
          error: "Later knockout rounds unlock once the full Round of 32 is official.",
        };
      }
      if (!match.pickable) {
        const err = gradualR32MatchPickError(match);
        return { slots: input.incoming, error: err ?? GRADUAL_R32_SLOT_EDIT_ERROR };
      }
      const err = validateKnockoutMatchPick({
        slotKey: match.topSlotKey,
        selectedTeamId: incomingId,
        match,
        teams: input.teams,
        nowMs,
      });
      if (err) return { slots: input.incoming, error: err };
      continue;
    }

    if (slot.predictionKind === "round_of_32") {
      if (incomingId !== keep) {
        return { slots: input.incoming, error: GRADUAL_R32_SLOT_EDIT_ERROR };
      }
      continue;
    }

    return {
      slots: input.incoming,
      error: "Later knockout rounds unlock once the full Round of 32 is official.",
    };
  }

  let slots = mergeKnockoutProgressionSlotsFromPredictions(
    input.incoming,
    input.existing,
  );

  const pickableR16Keys = new Set(
    gradual.matchStates
      .filter((m) => m.pickable)
      .map((m) => r16SlotKeyForR32MatchIndex(m.matchIndex)),
  );

  slots = slots.map((slot) => {
    if (
      slot.predictionKind === "round_of_16" &&
      pickableR16Keys.has(slot.slotKey ?? "")
    ) {
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

  for (const match of gradual.matchStates) {
    if (!match.pickable) continue;
    const r16Key = r16SlotKeyForR32MatchIndex(match.matchIndex);
    const winner = slots.find(
      (s) => s.predictionKind === "round_of_16" && s.slotKey === r16Key,
    );
    if (!winner?.teamId.trim()) continue;
    slots = slots.map((slot) => {
      if (
        slot.predictionKind === "round_of_32" &&
        (slot.slotKey === match.topSlotKey || slot.slotKey === match.bottomSlotKey)
      ) {
        return { ...slot, teamId: "" };
      }
      return slot;
    });
  }

  for (const slot of slots) {
    if (!isKnockoutProgressionKind(slot.predictionKind)) continue;

    if (slot.predictionKind === "round_of_16") {
      const match = matchStateForR16GradualWinnerSlot(slot.slotKey, gradual);
      if (match) {
        if (!match.pickable) {
          const k = progressionKey({
            predictionKind: slot.predictionKind,
            tournamentStageId: slot.tournamentStageId,
            slotKey: slot.slotKey,
          });
          const keep = priorByKey.get(k) ?? "";
          const incomingId = slot.teamId.trim();
          if (incomingId && incomingId !== keep) {
            const err = gradualR32MatchPickError(match);
            return { slots, error: err ?? GRADUAL_R32_SLOT_EDIT_ERROR };
          }
          slots = slots.map((s) =>
            s === slot ? { ...s, teamId: keep } : s,
          );
          continue;
        }
        const err = validateKnockoutMatchPick({
          slotKey: match.topSlotKey,
          selectedTeamId: slot.teamId,
          match,
          teams: input.teams,
          nowMs,
        });
        if (err) return { slots, error: err };
        continue;
      }

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
    const k = progressionKey({
      predictionKind: slot.predictionKind,
      tournamentStageId: slot.tournamentStageId,
      slotKey: slot.slotKey,
    });
    const keep = priorByKey.get(k) ?? "";
    const incomingRow = input.incoming.find(
      (s) =>
        s.predictionKind === slot.predictionKind &&
        s.tournamentStageId === slot.tournamentStageId &&
        s.slotKey === slot.slotKey,
    );
    const requestedId =
      incomingRow != null ? incomingRow.teamId.trim() : keep;
    if (requestedId && requestedId !== keep) {
      if (!match) {
        return { slots, error: "Round of 32 slot is not an official matchup yet." };
      }
      return { slots, error: GRADUAL_R32_SLOT_EDIT_ERROR };
    }
    slots = slots.map((s) =>
      s === slot ? { ...s, teamId: requestedId } : s,
    );
  }

  return { slots, error: null };
}
