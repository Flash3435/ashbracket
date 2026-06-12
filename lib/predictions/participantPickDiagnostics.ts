import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import {
  buildAllParticipantPickDrafts,
  DEFAULT_PARTICIPANT_BONUS_KEYS,
  participantBonusKeysForPool,
} from "./buildParticipantPickDrafts";
import { isKnockoutProgressionKind } from "./knockoutProgressionKinds";
import {
  buildPoolMembershipCompletionStatus,
  type PoolMembershipCompletionStatus,
} from "../picks/poolMembershipCompletionStatus";
import type { Prediction, Team, TournamentStage } from "../../src/types/domain";
import { buildTeamIdToGroupLetter } from "./knockoutPickConsistency";

/** Canonical slot key used by drafts and completion helpers. */
export function draftSlotKey(slot: KnockoutPickSlotDraft): string {
  return slot.rowKey;
}

/** Stable key for a saved prediction row (DB shape). */
export function savedPredictionKey(p: Prediction): string {
  const parts = [
    p.predictionKind,
    p.tournamentStageId ?? "",
    p.groupCode ?? "",
    p.slotKey ?? "",
    p.bonusKey ?? "",
  ];
  return parts.join(":");
}

/** Keys expected from canonical draft slots for one participant. */
export function expectedDraftKeysFromSlots(
  slots: KnockoutPickSlotDraft[],
): string[] {
  return slots.map(draftSlotKey);
}

export function predictionsByKind(
  predictions: Prediction[],
  participantId: string,
): Record<string, Prediction[]> {
  const out: Record<string, Prediction[]> = {};
  for (const p of predictions) {
    if (p.participantId !== participantId) continue;
    if (!p.teamId?.trim()) continue;
    (out[p.predictionKind] ??= []).push(p);
  }
  for (const k of Object.keys(out)) {
    out[k]!.sort((a, b) => savedPredictionKey(a).localeCompare(savedPredictionKey(b)));
  }
  return out;
}

export function savedPredictionKeys(
  predictions: Prediction[],
  participantId: string,
): string[] {
  return predictions
    .filter((p) => p.participantId === participantId && p.teamId?.trim())
    .map(savedPredictionKey)
    .sort((a, b) => a.localeCompare(b));
}

/** Bonus keys from scoring_rules before the merge-with-defaults helper (pre-2026-04). */
export function legacyBonusKeysFromScoringRules(
  scoringRuleBonusKeys: readonly string[],
): string[] {
  const fromDb = scoringRuleBonusKeys
    .map((k) => (k ?? "").trim())
    .filter(Boolean);
  return fromDb.length > 0 ? [...fromDb] : [...DEFAULT_PARTICIPANT_BONUS_KEYS];
}

/**
 * Pre–`poolMembershipCompletionStatus` completeness: every relevant draft slot filled
 * (including all twelve third-place rows when present).
 */
export function legacyPicksCompleteFromDrafts(
  slots: KnockoutPickSlotDraft[],
  options?: { knockoutBracketPicksUnlocked?: boolean },
): boolean {
  if (slots.length === 0) return false;
  const unlocked = options?.knockoutBracketPicksUnlocked !== false;
  const relevant = unlocked
    ? slots
    : slots.filter((s) => !isKnockoutProgressionKind(s.predictionKind));
  if (relevant.length === 0) return false;
  return relevant.every((s) => s.teamId.trim() !== "");
}

export function buildLegacyCompletionSlots(input: {
  stageByCode: Partial<Record<TournamentStage["code"], TournamentStage>>;
  predictions: Prediction[];
  participantId: string;
  scoringRuleBonusKeys: readonly string[];
  teams?: Team[];
  groupTeamCountryCodesByLetter?: Record<string, string[]>;
}): KnockoutPickSlotDraft[] {
  return buildAllParticipantPickDrafts({
    stageByCode: input.stageByCode,
    predictions: input.predictions,
    participantId: input.participantId,
    bonusKeys: legacyBonusKeysFromScoringRules(input.scoringRuleBonusKeys),
    teams: input.teams,
    groupTeamCountryCodesByLetter: input.groupTeamCountryCodesByLetter,
  });
}

export type PickKeyMismatchReport = {
  /** Saved rows with team_id that did not hydrate into any filled draft slot. */
  orphanedSavedPredictions: Prediction[];
  /** Required draft keys empty while a near-matching saved row exists. */
  nearMatchHints: Array<{ missingKey: string; savedKey: string; reason: string }>;
  /** True when mismatch signals suggest a definition/key issue rather than missing data. */
  possibleKeyMismatch: boolean;
};

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost,
      );
    }
  }
  return dp[m]![n]!;
}

function nearMatchReason(missing: string, saved: string): string | null {
  if (missing === saved) return "exact alternate formatting";
  const mk = missing.split(":");
  const sk = saved.split(":");
  if (mk[0] === sk[0] && mk[0] === "bonus_pick" && mk[4] && sk[4]) {
    return `bonus key ${sk[4]} vs required ${mk[4]}`;
  }
  if (
    mk[0] === "third_place_qualifier" &&
    sk[0] === "third_place_qualifier" &&
    mk[2] !== sk[2] &&
    mk[3] === "" &&
    sk[3] !== ""
  ) {
    return "legacy third-place slot_key vs group_code";
  }
  if (
    mk[0] === sk[0] &&
    mk[0] === "third_place_qualifier" &&
    mk[2] !== sk[2]
  ) {
    return `third-place group ${sk[2]} saved under ${mk[2]}`;
  }
  if (levenshtein(missing, saved) <= 3) return "similar key string";
  return null;
}

/** Compare raw saved rows vs hydrated drafts to detect key-format mismatches. */
export function detectPickKeyMismatches(input: {
  predictions: Prediction[];
  participantId: string;
  slots: KnockoutPickSlotDraft[];
  missingPickKeys: string[];
  teams?: Team[];
  groupTeamCountryCodesByLetter?: Record<string, string[]>;
}): PickKeyMismatchReport {
  const { predictions, participantId, slots, missingPickKeys } = input;
  const filledDraftKeys = new Set(
    slots.filter((s) => s.teamId.trim()).map(draftSlotKey),
  );
  const teamIdToGroup = buildTeamIdToGroupLetter(
    input.teams ?? [],
    input.groupTeamCountryCodesByLetter,
  );

  const orphanedSavedPredictions: Prediction[] = [];
  for (const p of predictions) {
    if (p.participantId !== participantId || !p.teamId?.trim()) continue;
    const kind = p.predictionKind;
    let represented = false;
    if (kind === "group_winner" || kind === "group_runner_up") {
      const gc = (p.groupCode ?? "").toUpperCase();
      represented = slots.some(
        (s) =>
          s.predictionKind === kind &&
          (s.groupCode ?? "").toUpperCase() === gc &&
          s.teamId.trim() === p.teamId!.trim(),
      );
    } else if (kind === "third_place_qualifier") {
      const savedGroup = (p.groupCode ?? "").trim().toUpperCase();
      const actualGroup = teamIdToGroup.get(p.teamId!.trim()) ?? "";
      const effectiveGroup =
        savedGroup && actualGroup && savedGroup !== actualGroup
          ? actualGroup
          : savedGroup || actualGroup;
      represented = slots.some(
        (s) =>
          s.predictionKind === kind &&
          s.teamId.trim() === p.teamId!.trim() &&
          (!effectiveGroup ||
            (s.groupCode ?? "").toUpperCase() === effectiveGroup),
      );
    } else if (kind === "bonus_pick") {
      represented = slots.some(
        (s) =>
          s.predictionKind === kind &&
          s.bonusKey === p.bonusKey &&
          s.teamId.trim() === p.teamId!.trim(),
      );
    } else {
      represented = slots.some(
        (s) =>
          s.predictionKind === kind &&
          s.tournamentStageId === p.tournamentStageId &&
          (s.slotKey ?? null) === (p.slotKey ?? null) &&
          s.teamId.trim() === p.teamId!.trim(),
      );
    }
    if (!represented) orphanedSavedPredictions.push(p);
  }

  const savedKeys = savedPredictionKeys(predictions, participantId);
  const nearMatchHints: PickKeyMismatchReport["nearMatchHints"] = [];
  for (const missingKey of missingPickKeys) {
    const draft = slots.find((s) => draftSlotKey(s) === missingKey);
    if (!draft) continue;
    const syntheticSaved = [
      draft.predictionKind,
      draft.tournamentStageId,
      draft.groupCode ?? "",
      draft.slotKey ?? "",
      draft.bonusKey ?? "",
    ].join(":");
    for (const savedKey of savedKeys) {
      const reason = nearMatchReason(syntheticSaved, savedKey);
      if (reason) {
        nearMatchHints.push({ missingKey, savedKey, reason });
        break;
      }
    }
  }

  const possibleKeyMismatch =
    orphanedSavedPredictions.length > 0 || nearMatchHints.length > 0;

  return { orphanedSavedPredictions, nearMatchHints, possibleKeyMismatch };
}

export type ParticipantCompletionDiagnostic = {
  membership: {
    id: string;
    displayName: string | null;
    userId: string | null;
    picksFirstSubmittedAt: string | null;
  };
  canonicalStatus: PoolMembershipCompletionStatus;
  legacyComplete: boolean;
  legacyBonusKeys: string[];
  savedByKind: Record<string, number>;
  savedKeys: string[];
  expectedKeys: string[];
  missingKeys: string[];
  nearMatchHints: PickKeyMismatchReport["nearMatchHints"];
  orphanedSavedCount: number;
  possibleKeyMismatch: boolean;
};

export function buildParticipantCompletionDiagnostic(input: {
  membership: ParticipantCompletionDiagnostic["membership"];
  stageByCode: Partial<Record<TournamentStage["code"], TournamentStage>>;
  predictions: Prediction[];
  scoringRuleBonusKeys: readonly string[];
  bonusKeys: readonly string[];
  teams?: Team[];
  groupTeamCountryCodesByLetter?: Record<string, string[]>;
  knockoutBracketPicksUnlocked?: boolean;
}): ParticipantCompletionDiagnostic {
  const slots = buildAllParticipantPickDrafts({
    stageByCode: input.stageByCode,
    predictions: input.predictions,
    participantId: input.membership.id,
    bonusKeys: input.bonusKeys,
    teams: input.teams,
    groupTeamCountryCodesByLetter: input.groupTeamCountryCodesByLetter,
  });
  const canonicalStatus = buildPoolMembershipCompletionStatus(slots, {
    knockoutBracketPicksUnlocked: input.knockoutBracketPicksUnlocked,
  });
  const legacySlots = buildLegacyCompletionSlots({
    stageByCode: input.stageByCode,
    predictions: input.predictions,
    participantId: input.membership.id,
    scoringRuleBonusKeys: input.scoringRuleBonusKeys,
    teams: input.teams,
    groupTeamCountryCodesByLetter: input.groupTeamCountryCodesByLetter,
  });
  const legacyComplete = legacyPicksCompleteFromDrafts(legacySlots, {
    knockoutBracketPicksUnlocked: input.knockoutBracketPicksUnlocked,
  });
  const byKind = predictionsByKind(input.predictions, input.membership.id);
  const savedByKind = Object.fromEntries(
    Object.entries(byKind).map(([k, rows]) => [k, rows.length]),
  );
  const mismatch = detectPickKeyMismatches({
    predictions: input.predictions,
    participantId: input.membership.id,
    slots,
    missingPickKeys: canonicalStatus.missingPickKeys,
    teams: input.teams,
    groupTeamCountryCodesByLetter: input.groupTeamCountryCodesByLetter,
  });

  return {
    membership: input.membership,
    canonicalStatus,
    legacyComplete,
    legacyBonusKeys: legacyBonusKeysFromScoringRules(input.scoringRuleBonusKeys),
    savedByKind,
    savedKeys: savedPredictionKeys(input.predictions, input.membership.id),
    expectedKeys: expectedDraftKeysFromSlots(slots),
    missingKeys: canonicalStatus.missingPickKeys,
    nearMatchHints: mismatch.nearMatchHints,
    orphanedSavedCount: mismatch.orphanedSavedPredictions.length,
    possibleKeyMismatch: mismatch.possibleKeyMismatch,
  };
}
