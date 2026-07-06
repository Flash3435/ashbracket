import type { Team } from "../../src/types/domain";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import type { ParticipantPickSlotPayload } from "../../types/knockoutPicksSave";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { Prediction } from "../../src/types/domain";
import {
  getGradualKnockoutSelectionState,
  matchStateForR16GradualWinnerSlot,
  matchStateForR32Slot,
  r16SlotKeyForR32MatchIndex,
  validateKnockoutMatchPick,
} from "../picks/gradualKnockoutUnlock";
import {
  hasOfficialKnockoutMatchResult,
  isKnockoutPickFrozenForParticipant,
  knockoutPickEditBlockedMessage,
} from "../picks/knockoutPickEditability";
import {
  isStrictBracketPathBlockedForParticipant,
  wizardMatchRefForSavedSlot,
} from "../picks/knockoutStrictBracketPath";
import { pickStatusFromPrediction } from "./knockoutPickStatus";
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

function existingPredictionByKey(
  existing: Prediction[],
): Map<string, Prediction> {
  const byKey = new Map<string, Prediction>();
  for (const p of existing) {
    if (!isKnockoutProgressionKind(p.predictionKind)) continue;
    byKey.set(
      progressionKey({
        predictionKind: p.predictionKind,
        tournamentStageId: p.tournamentStageId ?? "",
        slotKey: p.slotKey,
      }),
      p,
    );
  }
  return byKey;
}

function isSavedKnockoutPickFrozenForParticipant(input: {
  predictionKind: string;
  slotKey: string | null;
  savedTeamId?: string | null;
  existingPred?: Prediction;
  matches: TournamentMatchPublicRow[];
  gradual: ReturnType<typeof getGradualKnockoutSelectionState>;
  teams?: Team[];
  progressionRows?: Prediction[];
  fullRoundOf32Official?: boolean;
  nowMs?: number;
}): boolean {
  const { pickStatus } = input.existingPred
    ? pickStatusFromPrediction(input.existingPred)
    : { pickStatus: null };
  return isKnockoutPickFrozenForParticipant({
    predictionKind: input.predictionKind,
    slotKey: input.slotKey,
    tournamentMatches: input.matches,
    gradual: input.gradual,
    savedTeamId: input.savedTeamId,
    pickStatus,
    teams: input.teams,
    progressionRows: input.progressionRows,
    fullRoundOf32Official: input.fullRoundOf32Official,
    nowMs: input.nowMs,
  });
}

function mergedSlotsAsDrafts(
  slots: ParticipantPickSlotPayload[],
): KnockoutPickSlotDraft[] {
  return slots.map((s) => ({
    rowKey: `${s.predictionKind}|${s.slotKey ?? ""}`,
    sectionLabel: "",
    slotLabel: "",
    predictionKind: s.predictionKind as KnockoutPickSlotDraft["predictionKind"],
    tournamentStageId: s.tournamentStageId,
    slotKey: s.slotKey,
    groupCode: s.groupCode,
    bonusKey: s.bonusKey,
    teamId: s.teamId,
  }));
}

function validateStrictBracketKnockoutPickChanges(input: {
  incoming: ParticipantPickSlotPayload[];
  existing: Prediction[];
  matches: TournamentMatchPublicRow[];
  gradual: ReturnType<typeof getGradualKnockoutSelectionState>;
  teams?: Team[];
  nowMs?: number;
}): string | null {
  if (!input.teams?.length) return null;

  const priorByKey = existingTeamIdByKey(input.existing);
  const mergedSlots: ParticipantPickSlotPayload[] = input.existing.map((p) => ({
    predictionKind: p.predictionKind,
    tournamentStageId: p.tournamentStageId ?? "",
    slotKey: p.slotKey,
    groupCode: p.groupCode,
    bonusKey: p.bonusKey,
    teamId: p.teamId?.trim() ?? "",
  }));

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

    const idx = mergedSlots.findIndex(
      (s) =>
        s.predictionKind === slot.predictionKind &&
        s.tournamentStageId === slot.tournamentStageId &&
        s.slotKey === slot.slotKey,
    );
    if (idx >= 0) {
      mergedSlots[idx] = { ...mergedSlots[idx]!, teamId: incomingId };
    } else {
      mergedSlots.push(slot);
    }

    const matchRef = wizardMatchRefForSavedSlot(
      slot.predictionKind,
      slot.slotKey,
    );
    if (!matchRef) continue;

    if (
      isStrictBracketPathBlockedForParticipant({
        wizardKind: matchRef.wizardKind,
        matchIndex: matchRef.matchIndex,
        slots: mergedSlotsAsDrafts(mergedSlots),
        teams: input.teams,
        tournamentMatches: input.matches,
        gradual: input.gradual,
        knockoutBracketPicksUnlocked: true,
        nowMs: input.nowMs,
      })
    ) {
      return knockoutPickEditBlockedMessage({
        predictionKind: slot.predictionKind,
        slotKey: slot.slotKey,
        tournamentMatches: input.matches,
        gradual: input.gradual,
        teams: input.teams,
        slots: mergedSlotsAsDrafts(mergedSlots),
        knockoutBracketPicksUnlocked: true,
        nowMs: input.nowMs,
      });
    }
  }
  return null;
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
 * Client save payloads sometimes fill locked Round of 32 sides with official
 * home/away teams even when the participant pick lives on another row (for
 * example `round_of_16` slot 10). Those rows are not participant edits.
 */
function isLockedR32OfficialSideFill(input: {
  slot: ParticipantPickSlotPayload;
  incomingId: string;
  matches: TournamentMatchPublicRow[];
  gradual: ReturnType<typeof getGradualKnockoutSelectionState>;
  nowMs?: number;
}): boolean {
  if (input.slot.predictionKind !== "round_of_32") return false;
  const ms = matchStateForR32Slot(input.slot.slotKey, input.gradual);
  if (!ms?.publicMatch || !hasOfficialKnockoutMatchResult(ms.publicMatch)) {
    return false;
  }
  if (
    !isKnockoutPickFrozenForParticipant({
      predictionKind: input.slot.predictionKind,
      slotKey: input.slot.slotKey,
      tournamentMatches: input.matches,
      gradual: input.gradual,
      savedTeamId: "",
      nowMs: input.nowMs,
    })
  ) {
    return false;
  }
  return (
    input.incomingId === ms.homeTeamId || input.incomingId === ms.awayTeamId
  );
}

/**
 * Reject non-empty changes to frozen knockout slots before coercion restores
 * saved DB values. Empty clears are handled by coercion so unrelated editable
 * rows can still be saved.
 */
export function validateFrozenKnockoutSwapAttempts(input: {
  incoming: ParticipantPickSlotPayload[];
  existing: Prediction[];
  matches: TournamentMatchPublicRow[];
  gradual: ReturnType<typeof getGradualKnockoutSelectionState>;
  teams?: Team[];
  nowMs?: number;
}): string | null {
  const priorByKey = existingTeamIdByKey(input.existing);
  const predByKey = existingPredictionByKey(input.existing);
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

    if (
      !isSavedKnockoutPickFrozenForParticipant({
        predictionKind: slot.predictionKind,
        slotKey: slot.slotKey,
        savedTeamId: keep,
        existingPred: predByKey.get(k),
        matches: input.matches,
        gradual: input.gradual,
        teams: input.teams,
        progressionRows: input.existing,
        nowMs: input.nowMs,
      })
    ) {
      continue;
    }

    if (
      !keep &&
      isLockedR32OfficialSideFill({
        slot,
        incomingId,
        matches: input.matches,
        gradual: input.gradual,
        nowMs: input.nowMs,
      })
    ) {
      continue;
    }

    return knockoutPickEditBlockedMessage({
      predictionKind: slot.predictionKind,
      slotKey: slot.slotKey,
      tournamentMatches: input.matches,
      gradual: input.gradual,
      nowMs: input.nowMs,
    });
  }
  return null;
}

/**
 * Locked knockout slots keep their saved DB values in the write payload.
 * Client-side path repair, pruning, and official-side promotion must not
 * mutate locked rows or block saves on still-editable matchups.
 */
export function coerceFrozenKnockoutSlotsToSaved(input: {
  incoming: ParticipantPickSlotPayload[];
  existing: Prediction[];
  matches: TournamentMatchPublicRow[];
  gradual: ReturnType<typeof getGradualKnockoutSelectionState>;
  teams?: Team[];
  nowMs?: number;
}): ParticipantPickSlotPayload[] {
  const priorByKey = existingTeamIdByKey(input.existing);
  const predByKey = existingPredictionByKey(input.existing);
  const nowMs = input.nowMs ?? Date.now();

  return input.incoming.map((slot) => {
    if (!isKnockoutProgressionKind(slot.predictionKind)) return slot;

    const k = progressionKey({
      predictionKind: slot.predictionKind,
      tournamentStageId: slot.tournamentStageId,
      slotKey: slot.slotKey,
    });
    const keep = priorByKey.get(k) ?? "";

    if (
      !isSavedKnockoutPickFrozenForParticipant({
        predictionKind: slot.predictionKind,
        slotKey: slot.slotKey,
        savedTeamId: keep,
        existingPred: predByKey.get(k),
        matches: input.matches,
        gradual: input.gradual,
        teams: input.teams,
        progressionRows: input.existing,
        nowMs,
      })
    ) {
      return slot;
    }

    return { ...slot, teamId: keep };
  });
}

/**
 * Reject participant edits to knockout slots that are locked at kickoff or by
 * an official result. Applies regardless of gradual vs full-bracket unlock.
 */
export function validateKnockoutParticipantPickChanges(input: {
  incoming: ParticipantPickSlotPayload[];
  existing: Prediction[];
  matches: TournamentMatchPublicRow[];
  gradual: ReturnType<typeof getGradualKnockoutSelectionState>;
  fullRoundOf32Official: boolean;
  teams?: Team[];
  nowMs?: number;
}): string | null {
  const priorByKey = existingTeamIdByKey(input.existing);
  const predByKey = existingPredictionByKey(input.existing);
  for (const slot of input.incoming) {
    if (!isKnockoutProgressionKind(slot.predictionKind)) continue;
    const incomingId = slot.teamId.trim();
    const k = progressionKey({
      predictionKind: slot.predictionKind,
      tournamentStageId: slot.tournamentStageId,
      slotKey: slot.slotKey,
    });
    const keep = priorByKey.get(k) ?? "";
    if (incomingId === keep) continue;

    if (
      !isSavedKnockoutPickFrozenForParticipant({
        predictionKind: slot.predictionKind,
        slotKey: slot.slotKey,
        savedTeamId: keep,
        existingPred: predByKey.get(k),
        matches: input.matches,
        gradual: input.gradual,
        teams: input.teams,
        progressionRows: input.existing,
        fullRoundOf32Official: input.fullRoundOf32Official,
        nowMs: input.nowMs,
      })
    ) {
      continue;
    }
    return knockoutPickEditBlockedMessage({
      predictionKind: slot.predictionKind,
      slotKey: slot.slotKey,
      tournamentMatches: input.matches,
      gradual: input.gradual,
      teams: input.teams,
      knockoutBracketPicksUnlocked: input.fullRoundOf32Official,
      nowMs: input.nowMs,
    });
  }
  return null;
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

  const swapErr = validateFrozenKnockoutSwapAttempts({
    incoming: input.incoming,
    existing: input.existing,
    matches: input.matches,
    gradual,
    teams: input.teams,
    nowMs,
  });
  if (swapErr) {
    return { slots: input.incoming, error: swapErr };
  }

  const incoming = coerceFrozenKnockoutSlotsToSaved({
    incoming: input.incoming,
    existing: input.existing,
    matches: input.matches,
    gradual,
    teams: input.teams,
    nowMs,
  });

  const editErr = validateKnockoutParticipantPickChanges({
    incoming,
    existing: input.existing,
    matches: input.matches,
    gradual,
    fullRoundOf32Official: input.fullRoundOf32Official,
    teams: input.teams,
    nowMs,
  });
  if (editErr) {
    return { slots: incoming, error: editErr };
  }

  if (input.fullRoundOf32Official) {
    const strictErr = validateStrictBracketKnockoutPickChanges({
      incoming,
      existing: input.existing,
      matches: input.matches,
      gradual,
      teams: input.teams,
      nowMs,
    });
    if (strictErr) {
      return { slots: incoming, error: strictErr };
    }
    return { slots: incoming, error: null };
  }

  const priorByKey = existingTeamIdByKey(input.existing);

  for (const slot of incoming) {
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
          slots: incoming,
          error: "Later knockout rounds unlock once the full Round of 32 is official.",
        };
      }
      if (!match.pickable) {
        const err = gradualR32MatchPickError(match);
        return { slots: incoming, error: err ?? GRADUAL_R32_SLOT_EDIT_ERROR };
      }
      const err = validateKnockoutMatchPick({
        slotKey: match.topSlotKey,
        selectedTeamId: incomingId,
        match,
        teams: input.teams,
        nowMs,
      });
      if (err) return { slots: incoming, error: err };
      continue;
    }

    if (slot.predictionKind === "round_of_32") {
      if (incomingId !== keep) {
        return { slots: incoming, error: GRADUAL_R32_SLOT_EDIT_ERROR };
      }
      continue;
    }

    return {
      slots: incoming,
      error: "Later knockout rounds unlock once the full Round of 32 is official.",
    };
  }

  let slots = mergeKnockoutProgressionSlotsFromPredictions(
    incoming,
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
      const incomingRow = incoming.find(
        (s) =>
          s.predictionKind === slot.predictionKind &&
          s.tournamentStageId === slot.tournamentStageId &&
          s.slotKey === slot.slotKey,
      );
      return incomingRow ? { ...slot, teamId: incomingRow.teamId } : slot;
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
    const incomingRow = incoming.find(
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
